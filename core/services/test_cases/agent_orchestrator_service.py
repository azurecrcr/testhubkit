"""Agent 多步用例生成编排。

主编排层：任务生命周期、Worker 进程管理、步骤分发、公开 API。
工具函数 → agent_llm_utils
生成步骤 → agent_step_gen
质量步骤 → agent_step_quality
"""

from __future__ import annotations

import json
import multiprocessing
import re
import uuid
from datetime import datetime
from typing import Any

from core.config.user_ai_credentials import resolve_text_ai_credentials
from core.services.test_cases.agent_job_db import (
    cancel_job,
    ensure_agent_job_tables,
    get_job,
    insert_job,
    reset_agent_steps_for_retry,
    update_job_status,
    update_step,
)
from core.services.test_cases.agent_llm_utils import (
    _call_llm,
    _new_id,
    _now,
    _parse_intent_filters,
    _resolve_ai_config,
    strip_thinking_fields,
)
from core.services.test_cases.agent_step_gen import (
    _step_dedupe,
    _step_generate_modules,
    _step_split_modules,
    _step_summarize,
)
from core.services.test_cases.agent_step_quality import (
    _apply_fill_gap_mode,
    _resolve_coverage_rows,
    _step_coverage,
    _step_fill_gaps,
    _step_validate,
)
from core.services.test_cases.coverage_matrix_service import (
    build_coverage_matrix,
    gaps_from_matrix,
)
from core.services.test_cases.lanhu_provenance import (
    provenance_list_for_rows,
    resolve_lanhu_provenance_from_request,
)
from core.services.test_cases.lanhu_requirement_service import fetch_lanhu_requirements_summary

# ── 步骤定义 ──────────────────────────────────────────────

STEP_DEFS_FILL_GAPS: tuple[tuple[str, str], ...] = (
    ("summarize", "需求摘要"),
    ("fill_gaps", "缺口补全"),
    ("coverage", "覆盖率检查"),
    ("validate", "质量校验"),
)

STEP_DEFS_MODULE_GEN_ONLY: tuple[tuple[str, str], ...] = (
    ("split_modules", "模块拆分"),
    ("generate_modules", "分模块生成"),
    ("dedupe", "交叉去重"),
)

# ── 进程管理 ──────────────────────────────────────────────

_running_processes: dict[str, multiprocessing.Process] = {}
_mp_ctx = multiprocessing.get_context("spawn")


def _run_job_process_entry(job_id: str, request_data: dict[str, Any]) -> None:
    """独立子进程执行 Agent 任务，避免 gunicorn worker 超时回收导致线程被杀。"""
    _run_job(job_id, request_data)


def _start_agent_job_worker(job_id: str, request_data: dict[str, Any]) -> None:
    proc = _mp_ctx.Process(
        target=_run_job_process_entry,
        args=(job_id, request_data),
        name=f"tc-agent-{job_id[:8]}",
        daemon=True,
    )
    proc.start()
    _running_processes[job_id] = proc


def recover_stale_agent_jobs(max_age_seconds: int = 1800) -> int:
    from core.services.test_cases.agent_job_db import list_stale_running_jobs

    recovered = 0
    for row in list_stale_running_jobs(max_age_seconds=max_age_seconds):
        job_id = str(row.get("id") or "").strip()
        if not job_id:
            continue
        proc = _running_processes.get(job_id)
        if proc is not None and proc.is_alive():
            continue
        update_job_status(
            job_id,
            "error",
            error_message="任务执行超时或执行进程已退出，请重新发起或点击重试",
            now=_now(),
        )
        _running_processes.pop(job_id, None)
        recovered += 1
    return recovered


# ── 步骤计划 ──────────────────────────────────────────────

def _build_step_plan(mode: str) -> tuple[tuple[str, str], ...]:
    if mode == "fill_gaps_only":
        return STEP_DEFS_FILL_GAPS
    if mode == "module_gen_only":
        return STEP_DEFS_MODULE_GEN_ONLY
    raise ValueError(f"不支持的 Agent 模式: {mode}")


# ── 创建任务（公开 API）───────────────────────────────────

def create_agent_job(data: dict[str, Any], user_id: str | None) -> dict[str, Any]:
    ensure_agent_job_tables()
    mode = str(data.get("mode") or "").strip()
    if mode not in ("fill_gaps_only", "module_gen_only"):
        raise ValueError("不支持的生成模式")
    user_intent = str(data.get("user_intent") or data.get("prompt") or "").strip()
    if not user_intent:
        raise ValueError("请填写 Agent 指令或提示词")
    columns = data.get("columns") or []
    if not isinstance(columns, list) or not columns:
        raise ValueError("请先应用表头模板")
    columns = [str(c) for c in columns]
    existing_rows = data.get("existing_rows") or []
    if not isinstance(existing_rows, list):
        existing_rows = []
    existing_rows = [
        [str(c) for c in row] for row in existing_rows if isinstance(row, list)
    ]
    options = data.get("options") if isinstance(data.get("options"), dict) else {}
    options = dict(options)
    options.setdefault("requirements", str(data.get("requirements") or "").strip())
    if mode == "module_gen_only" and not options.get("requirements"):
        raise ValueError("缺少需求文本，请先获取蓝湖需求")
    options.setdefault("rag_context", str(data.get("rag_context") or "").strip())
    layers = data.get("context_layers")
    if isinstance(layers, dict):
        options["context_layers"] = {
            "requirements": str(layers.get("requirements") or "").strip(),
            "personal": str(layers.get("personal") or "").strip(),
            "public": str(layers.get("public") or "").strip(),
        }
    options.setdefault("lanhu_cookie", str(data.get("lanhu_cookie") or "").strip())
    options.setdefault("lanhu_url", str(data.get("lanhu_url") or "").strip())
    options.setdefault("use_llm_validate", bool(data.get("use_llm_validate", True)))
    options.setdefault("use_builtin", bool(data.get("use_builtin", True)))
    if not options.get("use_builtin"):
        options.setdefault("base_url", str(data.get("base_url") or "").strip())
        options.setdefault("api_key", str(data.get("api_key") or "").strip())
        options.setdefault("model", str(data.get("model") or "").strip())
        options.setdefault("temperature", data.get("temperature"))
    if data.get("target_point_ids"):
        options["target_point_ids"] = data.get("target_point_ids")
    if data.get("matrix_gaps"):
        options["matrix_gaps"] = data.get("matrix_gaps")
    if data.get("requirement_points"):
        options["requirement_points"] = data.get("requirement_points")
    if data.get("coverage_matrix"):
        options["coverage_matrix"] = data.get("coverage_matrix")
    if data.get("skip_coverage_reanalyze"):
        options["skip_coverage_reanalyze"] = bool(data.get("skip_coverage_reanalyze"))
    fill_gap_mode = str(data.get("fill_gap_mode") or "").strip().lower()
    if fill_gap_mode in ("partial", "both"):
        options["fill_gap_mode"] = fill_gap_mode
    if data.get("validate_batch_row_start") is not None:
        try:
            options["validate_batch_row_start"] = max(0, int(data.get("validate_batch_row_start") or 0))
        except (TypeError, ValueError):
            options["validate_batch_row_start"] = 0
    if data.get("validate_batch_row_count") is not None:
        try:
            options["validate_batch_row_count"] = max(0, int(data.get("validate_batch_row_count") or 0))
        except (TypeError, ValueError):
            options["validate_batch_row_count"] = 0
    agent_prompt = str(data.get("agent_prompt") or "").strip()
    if agent_prompt:
        options["agent_prompt"] = agent_prompt
    options["intent_filters"] = _parse_intent_filters(user_intent)

    try:
        from core.services.ai.user_ai_daily_quota_service import (
            assert_fill_gaps_text_ai_available,
            assert_text_ai_available_for_job,
        )
        from core.config.user_ai_credentials import UserAiConfigRequired
        if mode == "fill_gaps_only":
            assert_fill_gaps_text_ai_available(data, user_id)
        else:
            assert_text_ai_available_for_job(data, user_id)
    except UserAiConfigRequired as exc:
        raise ValueError(str(exc)) from exc
    except ValueError as exc:
        raise ValueError(str(exc)) from exc

    job_id = _new_id()
    now = _now()
    step_defs = _build_step_plan(mode)
    steps = [
        {
            "id": _new_id(),
            "step_key": key,
            "step_index": idx,
            "label": label,
        }
        for idx, (key, label) in enumerate(step_defs)
    ]
    insert_job(
        job_id=job_id,
        user_id=user_id,
        mode=mode,
        user_intent=user_intent,
        columns=columns,
        existing_rows=existing_rows,
        options=options,
        steps=steps,
        now=now,
    )
    _start_agent_job_worker(job_id, data)
    job = get_job(job_id)
    return job or {"id": job_id}


# ── 上下文辅助 ────────────────────────────────────────────

def _ensure_ctx_requirements(
    ctx: dict[str, Any], job: dict[str, Any], request_data: dict[str, Any]
) -> str:
    """补全/校验链路可能跳过 summarize，在此兜底拉取需求文本。"""
    req = str(ctx.get("requirements") or "").strip()
    if req:
        return req
    opts = job.get("options") or {}
    cookie = str(opts.get("lanhu_cookie") or request_data.get("lanhu_cookie") or "").strip()
    url = str(opts.get("lanhu_url") or request_data.get("lanhu_url") or "").strip()
    if cookie and url:
        try:
            req = fetch_lanhu_requirements_summary(cookie, url)
        except Exception:
            req = ""
    if not req and job.get("mode") != "fill_gaps_only":
        req = str(job.get("user_intent") or "").strip()
    if req:
        ctx["requirements"] = req
    return req


def _coverage_step_has_fresh_matrix(job: dict[str, Any]) -> bool:
    if job.get("mode") != "fill_gaps_only":
        return False
    for step in job.get("steps") or []:
        if step.get("step_key") != "coverage" or step.get("status") != "done":
            continue
        out = step.get("output") or {}
        if out.get("coverage_matrix") and not out.get("skipped_reanalyze"):
            return True
    return False


def _resolve_job_snapshot_for_coverage_refresh(job_id: str, stale_job: dict[str, Any]) -> dict[str, Any]:
    """fill_gaps 收尾兜底须读 DB 最新 step 状态；_run_step 只写库不同步内存 job。"""
    fresh = get_job(job_id)
    return fresh if fresh else stale_job


def _refresh_coverage_matrix_after_fill(
    job: dict[str, Any],
    ctx: dict[str, Any],
    ai: dict[str, Any],
    all_rows: list[list[str]],
    request_data: dict[str, Any],
) -> bool:
    """任务结束后兜底重算覆盖率（fill_gaps_only 已在 coverage 步重算时跳过）。"""
    if _coverage_step_has_fresh_matrix(job):
        return False
    if not ctx.get("generated_rows") or not ctx.get("requirement_points"):
        return False
    need_refresh = job.get("mode") == "fill_gaps_only"
    if not need_refresh:
        for step in job.get("steps") or []:
            if step.get("step_key") != "fill_gaps" or step.get("status") != "done":
                continue
            if int((step.get("output") or {}).get("row_count") or 0) > 0:
                need_refresh = True
                break
    if not need_refresh:
        return False
    req = _ensure_ctx_requirements(ctx, job, request_data)
    points = ctx.get("requirement_points") or []
    if not req or not points:
        return False
    matrix = build_coverage_matrix(
        req,
        ctx["columns"],
        all_rows,
        points,
        use_builtin=ai["use_builtin"],
        base_url=ai["base_url"],
        api_key=ai["api_key"],
        model=ai["model"],
        temperature=float(ai["temperature"]) if ai.get("temperature") is not None else 0.1,
        call_llm=lambda prompt: _call_llm(prompt, ai),
    )
    ctx["coverage_matrix"] = matrix
    ctx["gaps"] = gaps_from_matrix(
        matrix.get("points") or points,
        matrix.get("mappings") or [],
        include_partial=True,
        target_point_ids=(job.get("options") or {}).get("target_point_ids"),
    )[:20]
    return True


# ── 核心执行主循环 ────────────────────────────────────────

def _run_job(job_id: str, request_data: dict[str, Any]) -> None:
    try:
        job = get_job(job_id)
        ai = _resolve_ai_config(request_data, (job or {}).get("user_id"))
        if not ai["base_url"] or not ai["api_key"] or not ai["model"]:
            raise RuntimeError("AI 配置不完整")
        update_job_status(job_id, "running", now=_now())
        if not job:
            return
        opts = job.get("options") or {}
        ctx: dict[str, Any] = {
            "columns": job["columns"],
            "existing_rows": list(job["existing_rows"] or []),
            "generated_rows": [],
            "requirements": str(opts.get("requirements") or "").strip(),
            "rag_context": str(opts.get("rag_context") or "").strip(),
            "context_layers": opts.get("context_layers") or {},
            "context_stage": "module",
            "modules": [],
            "gaps": list(opts.get("matrix_gaps") or []),
            "requirement_points": list(opts.get("requirement_points") or []),
            "coverage_matrix": opts.get("coverage_matrix"),
            "dedupe_removed": [],
        }
        matrix_seed = ctx.get("coverage_matrix")
        if isinstance(matrix_seed, dict) and matrix_seed.get("points") and not ctx.get("requirement_points"):
            ctx["requirement_points"] = list(matrix_seed.get("points") or [])
        if ctx.get("gaps") and isinstance(ctx["gaps"], list):
            ctx["gaps"] = _apply_fill_gap_mode(ctx["gaps"], opts)
        for step in job["steps"]:
            from core.services.test_cases.agent_job_db import is_job_cancelled
            if is_job_cancelled(job_id):
                return
            if step.get("status") == "done":
                _merge_ctx_from_done_step(ctx, step, job)
                continue
            _run_step(job, step, ctx, ai, request_data)
        from core.services.test_cases.agent_job_db import is_job_cancelled
        if is_job_cancelled(job_id):
            return
        coverage_rows = _resolve_coverage_rows(ctx, job)
        job_for_coverage_refresh = _resolve_job_snapshot_for_coverage_refresh(job_id, job)
        matrix_refreshed = _refresh_coverage_matrix_after_fill(
            job_for_coverage_refresh, ctx, ai, coverage_rows, request_data
        )
        total_rows = len(ctx["existing_rows"]) + len(ctx["generated_rows"])
        prov_req = dict(request_data or {})
        prov_req.setdefault("requirements", ctx.get("requirements") or "")
        if isinstance(prov_req.get("options"), dict):
            prov_req["options"] = dict(prov_req["options"])
        else:
            prov_req["options"] = dict(job.get("options") or {})
        prov_req["options"].setdefault("requirements", ctx.get("requirements") or "")
        lanhu_entry = resolve_lanhu_provenance_from_request(prov_req)
        new_count = len(ctx["generated_rows"])
        result_payload: dict[str, Any] = {
            "total_rows": total_rows,
            "new_rows": new_count,
            "new_rows_data": ctx["generated_rows"],
            "modules": ctx.get("modules") or [],
            "gaps": ctx.get("gaps") or [],
            "coverage_matrix": ctx.get("coverage_matrix"),
            "coverage_matrix_refreshed": matrix_refreshed,
        }
        if lanhu_entry:
            result_payload["lanhu_provenance"] = lanhu_entry
            prov_list = provenance_list_for_rows(lanhu_entry, new_count)
            if prov_list:
                result_payload["provenance"] = prov_list
        update_job_status(
            job_id,
            "done",
            requirements_summary=ctx.get("requirements") or "",
            result=result_payload,
            now=_now(),
        )
    except Exception as exc:
        update_job_status(job_id, "error", error_message=str(exc), now=_now())
    finally:
        _running_processes.pop(job_id, None)


def _merge_ctx_from_done_step(ctx: dict[str, Any], step: dict[str, Any], job: dict[str, Any]) -> None:
    """重试时从已完成步骤 output 恢复上下文，避免重复执行前几步。"""
    out = step.get("output") or {}
    key = step.get("step_key") or ""
    if key == "summarize":
        req = str(job.get("requirements_summary") or "").strip()
        if not req:
            req = str((job.get("options") or {}).get("requirements") or "").strip()
        if req:
            ctx["requirements"] = req
    elif key == "split_modules":
        mods = out.get("modules")
        if isinstance(mods, list) and mods:
            ctx["modules"] = mods
    elif key == "generate_modules":
        rows = out.get("rows")
        if isinstance(rows, list) and rows:
            ctx["generated_rows"] = [list(r) for r in rows if isinstance(r, list)]
    elif key == "fill_gaps":
        rows = out.get("rows")
        if isinstance(rows, list) and rows:
            ctx["generated_rows"] = [list(r) for r in rows if isinstance(r, list)]
    elif key == "dedupe":
        rows = out.get("rows")
        if isinstance(rows, list) and rows:
            ctx["generated_rows"] = [list(r) for r in rows if isinstance(r, list)]
    elif key == "coverage":
        matrix = out.get("coverage_matrix")
        if isinstance(matrix, dict):
            ctx["coverage_matrix"] = matrix
        gaps = out.get("gaps")
        if isinstance(gaps, list):
            ctx["gaps"] = gaps
        if isinstance(matrix, dict) and isinstance(matrix.get("points"), list):
            ctx["requirement_points"] = list(matrix.get("points") or [])


# ── 步骤分发 ──────────────────────────────────────────────

def _run_step(
    job: dict[str, Any],
    step: dict[str, Any],
    ctx: dict[str, Any],
    ai: dict[str, Any],
    request_data: dict[str, Any],
) -> None:
    step = dict(step)
    step.setdefault("job_id", job.get("id"))
    key = step["step_key"]
    stage_map = {
        "summarize": "summary",
        "split_modules": "summary",
        "generate_modules": "module",
        "dedupe": "module",
        "coverage": "module",
        "fill_gaps": "row",
        "validate": "row",
    }
    ctx["context_stage"] = stage_map.get(key, "module")
    started = _now()
    update_step(step["id"], "running", started_at=started, output={"progress_percent": 0})
    try:
        if key == "summarize":
            out = _step_summarize(job, ctx, request_data, step)
        elif key == "split_modules":
            out = _step_split_modules(job, ctx, ai, step)
        elif key == "generate_modules":
            out = _step_generate_modules(job, ctx, ai, step)
        elif key == "dedupe":
            from core.services.test_cases.agent_llm_utils import _set_step_progress
            _set_step_progress(step, 50, phase="dedupe")
            out = _step_dedupe(job, ctx)
        elif key == "coverage":
            out = _step_coverage(job, ctx, ai, step, request_data)
        elif key == "fill_gaps":
            out = _step_fill_gaps(job, ctx, ai, step, request_data)
        elif key == "validate":
            out = _step_validate(job, ctx, ai, step, request_data)
        else:
            out = {"skipped": True}
        if isinstance(out, dict):
            out = dict(out)
            out["progress_percent"] = 100
        update_step(step["id"], "done", output=strip_thinking_fields(out), finished_at=_now())
    except Exception as exc:
        from core.services.test_cases.agent_job_db import update_step as _update_step
        _update_step(step["id"], "error", error_message=str(exc), finished_at=_now())
        raise


# ── 公开 API：重试 / 取消 / SSE ───────────────────────────

def retry_agent_job(job_id: str) -> dict[str, Any] | None:
    job = get_job(job_id)
    if not job or job["status"] not in ("error", "cancelled"):
        return job
    reset_agent_steps_for_retry(job_id)
    update_job_status(job_id, "pending", error_message=None, now=_now())
    req = {"use_builtin": bool((job.get("options") or {}).get("use_builtin", True))}
    if not req["use_builtin"]:
        req.update({
            "base_url": (job.get("options") or {}).get("base_url", ""),
            "api_key": (job.get("options") or {}).get("api_key", ""),
            "model": (job.get("options") or {}).get("model", ""),
            "temperature": (job.get("options") or {}).get("temperature"),
        })
    _start_agent_job_worker(job_id, req)
    return get_job(job_id)


def cancel_agent_job(job_id: str) -> bool:
    return cancel_job(job_id)


def job_to_stream_payload(job: dict[str, Any]) -> dict[str, Any]:
    steps = []
    for step in job.get("steps") or []:
        steps.append(
            {
                "step_key": step["step_key"],
                "step_index": step["step_index"],
                "label": step["label"],
                "status": step["status"],
                "detail": _step_detail(step),
                "output": step.get("output"),
                "error_message": step.get("error_message"),
            }
        )
    payload = {
        "type": "job_update",
        "job_id": job["id"],
        "status": job["status"],
        "mode": job["mode"],
        "error_message": job.get("error_message"),
        "result": job.get("result"),
        "steps": steps,
    }
    opts = job.get("options") or {}
    if opts.get("_ai_quota_meta"):
        payload["ai_quota"] = opts["_ai_quota_meta"]
    return payload


def _step_detail(step: dict[str, Any]) -> str:
    out = step.get("output") or {}
    key = step.get("step_key")
    status = step.get("status") or "pending"
    if status == "pending":
        return "等待中…"
    if status == "cancelled":
        return "已取消"
    if status == "running":
        out = step.get("output") or {}
        label = step.get("label") or key or ""
        current = out.get("current")
        total = out.get("total")
        module_name = out.get("module_name")
        phase = str(out.get("phase") or "")
        completed = out.get("completed")
        if phase == "parallel_gen" and total:
            parsed_rows = out.get("parsed_rows")
            active = out.get("active_modules") if isinstance(out.get("active_modules"), list) else []
            done_n = int(completed or 0)
            parsed_hint = f" · 已解析 {parsed_rows} 条" if parsed_rows is not None else ""
            if active:
                names = "、".join(str(x) for x in active[:3] if str(x).strip())
                return f"并行生成 {done_n}/{total}{parsed_hint} · 进行中：{names}…"
            if done_n > 0:
                return f"并行生成 {done_n}/{total} 个模块已完成{parsed_hint}…"
            if parsed_rows is not None:
                return f"并行生成 0/{total} · 已解析 {parsed_rows} 条…"
            return f"并行生成 0/{total} 个模块…"
        if module_name and current and total and phase != "parallel_gen":
            parsed_rows = out.get("parsed_rows")
            extra = f" · 已解析 {parsed_rows} 条" if parsed_rows is not None else ""
            if phase == "parse":
                return f"正在解析：{module_name}（{current}/{total}）{extra}…"
            return f"正在生成：{module_name}（{current}/{total}）{extra}…"
        parsed_rows = out.get("parsed_rows")
        if parsed_rows is not None and phase in ("llm_request", "parse"):
            return f"正在执行：{label} · 已解析 {parsed_rows} 条…"
        if current and total:
            return f"正在执行：{label}（{current}/{total}）…"
        if phase == "lanhu_fetch":
            return f"正在执行：{label}（拉取蓝湖需求）…"
        if phase == "llm_request":
            return f"正在执行：{label}（等待模型响应）…"
        if phase == "parse":
            return f"正在执行：{label}（解析结果）…"
        if phase == "format_check":
            return f"正在执行：{label}（格式检查）…"
        if phase == "llm_validate":
            return f"正在执行：{label}（AI 质量对照）…"
        return f"正在执行：{label}…"
    if status == "error":
        return step.get("error_message") or "执行失败"
    if status != "done":
        return step.get("label") or "等待中…"
    if key == "summarize":
        return f"需求摘要 {out.get('requirements_length', 0)} 字"
    if key == "split_modules":
        return f"拆分 {out.get('module_count', 0)} 个模块"
    if key == "generate_modules":
        return f"生成 {out.get('row_count', 0)} 条用例"
    if key == "dedupe":
        return f"去重移除 {out.get('removed_count', 0)} 条"
    if key == "coverage":
        rate = out.get("coverage_rate")
        if rate is not None:
            uncovered = out.get("uncovered", out.get("gap_count", 0))
            return f"覆盖 {rate}% · 缺 {uncovered} 项"
        return f"发现 {out.get('gap_count', 0)} 个缺口"
    if key == "fill_gaps":
        if out.get("skipped"):
            return "无缺口，已跳过"
        return f"补全 {out.get('row_count', 0)} 条"
    if key == "validate":
        if out.get("skipped"):
            return "本批无新用例，已跳过"
        gap = int(out.get("issue_count") or 0)
        over = int(out.get("over_generated_count") or 0)
        batch_n = int(out.get("batch_row_count") or 0)
        prefix = f"本批 {batch_n} 条 · " if batch_n else ""
        if over and not gap:
            return prefix + f"过度生成 {over} 条（见覆盖率矩阵）"
        if over:
            return prefix + f"遗漏 {gap} 项 · 过度 {over} 条"
        if gap:
            return prefix + f"发现 {gap} 项问题"
        return prefix + "未发现问题"
    return step.get("label") or ""
