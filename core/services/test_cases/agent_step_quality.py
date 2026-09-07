"""Agent 编排器 — 质量类步骤：覆盖率检查、缺口补全、质量校验。

依赖 agent_llm_utils 中的工具函数，不依赖 agent_orchestrator_service。
"""

from __future__ import annotations

import json
from typing import Any

from core.services.test_cases.agent_job_db import is_job_cancelled
from core.services.test_cases.coverage_matrix_service import (
    build_coverage_matrix,
    extract_requirement_points,
    gaps_from_matrix,
)
from core.services.test_cases.validation_service import check_format_rules, check_llm_quality
from core.services.test_cases.agent_llm_utils import (
    agent_request_data_from_job,
    charge_agent_job_text_quota,
    _build_header_snippet,
    _build_fill_gaps_user_prompt,
    _call_llm,
    _edit_mode_step_prompt_hint,
    _format_rows_python_list_snippet,
    _normalize_rows,
    _rag_context_block,
    _resolve_fill_gaps_requirements_text,
    _set_step_progress,
    _stream_parse_rows,
    _trim_reasoning_text,
)


# ── 上下文解析辅助 ────────────────────────────────────────

def _resolve_coverage_rows(ctx: dict[str, Any], job: dict[str, Any]) -> list[list[str]]:
    """覆盖率分析用例行：本次任务相关用例 + 需求，不含任务开始前更早的表格行。"""
    opts = job.get("options") or {}
    if job.get("mode") == "fill_gaps_only":
        existing = list(ctx.get("existing_rows") or [])
        generated = list(ctx.get("generated_rows") or [])
        try:
            start = max(0, int(opts.get("validate_batch_row_start") or 0))
        except (TypeError, ValueError):
            start = 0
        try:
            count = max(0, int(opts.get("validate_batch_row_count") or 0))
        except (TypeError, ValueError):
            count = 0
        if count > 0:
            return existing[start : start + count] + generated
        if generated:
            return generated
        return existing[start:] if start < len(existing) else []
    return list(ctx.get("generated_rows") or [])


def _resolve_agent_validate_rows(
    ctx: dict[str, Any], opts: dict[str, Any]
) -> tuple[list[list[str]], int]:
    """Agent 规划流水线质量校验：仅本次任务新生成的用例 + 需求，不含任务开始前表格已有行。"""
    generated = list(ctx.get("generated_rows") or [])
    existing_len = len(ctx.get("existing_rows") or [])
    try:
        if opts.get("validate_batch_row_start") is not None:
            start = max(0, int(opts.get("validate_batch_row_start") or 0))
        else:
            start = existing_len
    except (TypeError, ValueError):
        start = existing_len
    return generated, start


def _resolve_fill_validate_rows(
    ctx: dict[str, Any], opts: dict[str, Any]
) -> tuple[list[list[str]], int]:
    """缺口补全后的质量校验：仅 Agent 批次 + 本次补全，不含补全前更早的表格行。"""
    existing = list(ctx.get("existing_rows") or [])
    generated = list(ctx.get("generated_rows") or [])
    try:
        start = max(0, int(opts.get("validate_batch_row_start") or 0))
    except (TypeError, ValueError):
        start = 0
    try:
        count = max(0, int(opts.get("validate_batch_row_count") or 0))
    except (TypeError, ValueError):
        count = 0
    if count > 0:
        batch_rows = existing[start : start + count] + generated
        return batch_rows, start
    if generated:
        return generated, len(existing)
    return [], start


def _resolve_fill_gaps_context_rows(ctx: dict[str, Any], job: dict[str, Any]) -> list[list[str]]:
    """缺口补全引用的用例行：Agent 全量规划仅本次生成；覆盖率触发的补全与 coverage 步范围一致。"""
    if job.get("mode") == "fill_gaps_only":
        return _resolve_coverage_rows(ctx, job)
    return list(ctx.get("generated_rows") or [])


def _apply_fill_gap_mode(gaps: list[dict[str, Any]], opts: dict[str, Any]) -> list[dict[str, Any]]:
    """根据 fill_gap_mode 过滤缺口列表。"""
    mode = str(opts.get("fill_gap_mode") or "").strip().lower()
    if mode == "partial":
        return [g for g in gaps if g.get("partial", False)]
    if mode == "both":
        return gaps
    target_ids = opts.get("target_point_ids")
    if target_ids:
        allowed = {str(x).strip() for x in target_ids if str(x).strip()}
        return [g for g in gaps if str(g.get("point_id") or "") in allowed]
    return gaps


# ── 覆盖率检查 ────────────────────────────────────────────

def _step_coverage(job: dict[str, Any], ctx: dict[str, Any], ai: dict[str, Any], step: dict[str, Any], request_data: dict[str, Any] | None = None) -> dict[str, Any]:
    columns = ctx["columns"]
    all_rows = _resolve_coverage_rows(ctx, job)
    opts = job.get("options") or {}

    if (
        opts.get("skip_coverage_reanalyze")
        and ctx.get("coverage_matrix")
        and job.get("mode") != "fill_gaps_only"
    ):
        matrix = ctx["coverage_matrix"]
        summary = (matrix.get("summary") or {}) if isinstance(matrix, dict) else {}
        gaps = ctx.get("gaps") or gaps_from_matrix(
            matrix.get("points") or [],
            matrix.get("mappings") or [],
            include_partial=True,
        )
        gaps = _apply_fill_gap_mode(gaps, opts)
        ctx["gaps"] = gaps
        return {
            "gap_count": len(gaps),
            "gaps": gaps,
            "coverage_matrix": matrix,
            "coverage_rate": summary.get("coverage_rate", 0),
            "skipped_reanalyze": True,
        }

    _set_step_progress(step, 10, phase="extract_points")
    points = ctx.get("requirement_points") or []
    if not points and isinstance(ctx.get("coverage_matrix"), dict):
        points = list(ctx["coverage_matrix"].get("points") or [])
        ctx["requirement_points"] = points
    rd = request_data if isinstance(request_data, dict) else agent_request_data_from_job(job)
    job_id = str(job.get("id") or "")
    user_id = job.get("user_id")

    def _coverage_llm(prompt: str) -> str:
        charge_agent_job_text_quota(job_id, user_id, rd)
        return _call_llm(prompt, ai)

    if not points:
        points = extract_requirement_points(
            ctx["requirements"],
            job["user_intent"],
            use_builtin=False,
            base_url=ai["base_url"],
            api_key=ai["api_key"],
            model=ai["model"],
            temperature=float(ai["temperature"]) if ai.get("temperature") is not None else 0.1,
            call_llm=_coverage_llm,
        )
    ctx["requirement_points"] = points

    _set_step_progress(step, 35, phase="llm_request")
    matrix = build_coverage_matrix(
        ctx["requirements"],
        columns,
        all_rows,
        points,
        use_builtin=False,
        base_url=ai["base_url"],
        api_key=ai["api_key"],
        model=ai["model"],
        temperature=float(ai["temperature"]) if ai.get("temperature") is not None else 0.1,
        call_llm=_coverage_llm,
    )
    ctx["coverage_matrix"] = matrix
    _set_step_progress(step, 90, phase="parse")

    gaps = gaps_from_matrix(
        matrix.get("points") or points,
        matrix.get("mappings") or [],
        include_partial=True,
    )
    gaps = _apply_fill_gap_mode(gaps, opts)
    ctx["gaps"] = gaps[:20]
    summary = matrix.get("summary") or {}
    return {
        "gap_count": len(ctx["gaps"]),
        "gaps": ctx["gaps"],
        "coverage_matrix": matrix,
        "coverage_rate": summary.get("coverage_rate", 0),
        "point_count": len(points),
        "uncovered": summary.get("uncovered", 0),
        "partial": summary.get("partial", 0),
        "over_generated": summary.get("over_generated", 0),
    }


# ── 缺口补全 ──────────────────────────────────────────────

def _step_fill_gaps(job: dict[str, Any], ctx: dict[str, Any], ai: dict[str, Any], step: dict[str, Any], request_data: dict[str, Any] | None = None) -> dict[str, Any]:
    opts = job.get("options") or {}
    gaps = ctx.get("gaps") or []
    if not gaps and opts.get("matrix_gaps"):
        gaps = list(opts.get("matrix_gaps") or [])
        gaps = _apply_fill_gap_mode(gaps, opts)
        ctx["gaps"] = gaps
    target_ids = opts.get("target_point_ids")
    if target_ids and gaps:
        allowed = {str(x).strip() for x in target_ids if str(x).strip()}
        gaps = [g for g in gaps if str(g.get("point_id") or "") in allowed]
    if not gaps:
        return {"row_count": 0, "rows": [], "skipped": True}
    columns = ctx["columns"]
    header = _build_header_snippet(columns)
    context_rows = _normalize_rows(columns, _resolve_fill_gaps_context_rows(ctx, job))
    rows_block = _format_rows_python_list_snippet(columns, context_rows)
    gap_text = json.dumps(gaps, ensure_ascii=False, indent=2)
    req_text = _resolve_fill_gaps_requirements_text(ctx, job, {})
    user_prompt = _build_fill_gaps_user_prompt(job, opts)
    rows_label = "【本次任务已生成用例（Python 列表，勿重复）】"
    prompt_parts = [
        f"【补全指令】\n{user_prompt}",
        f"【表头字段顺序】\n{header}",
    ]
    if req_text:
        prompt_parts.append(f"【需求】\n{req_text}")
    prompt_parts.extend([
        f"【覆盖率矩阵·未覆盖功能点】\n{gap_text}",
        f"{rows_label}\n{rows_block}",
    ])
    rag_block = _rag_context_block(ctx, exclude_requirements=True).strip()
    if rag_block:
        prompt_parts.append(rag_block)
    prompt_parts.append(
        "请仅针对【覆盖率矩阵·未覆盖功能点】补充缺失用例，不要重复【本次任务已生成用例】中已有内容。\n"
        "严格按表头字段及顺序输出 Python 列表：test_cases = [[...], ...]\n"
        f"{_edit_mode_step_prompt_hint(columns)}"
    )
    prompt = "\n\n".join(prompt_parts)
    rd = request_data if isinstance(request_data, dict) else agent_request_data_from_job(job)
    charge_agent_job_text_quota(str(job.get("id") or ""), job.get("user_id"), rd)
    _set_step_progress(step, 15, phase="llm_request", parsed_rows=0)
    reasoning_holder: dict[str, str] = {"text": ""}
    parsed_holder: dict[str, int] = {"n": 0}

    def on_progress(_accumulated: int, parsed: int) -> None:
        parsed_holder["n"] = parsed
        pct = min(90, 20 + parsed * 4)
        payload: dict[str, Any] = {"phase": "parse", "parsed_rows": parsed}
        if reasoning_holder["text"]:
            payload["reasoning_text"] = reasoning_holder["text"]
        _set_step_progress(step, pct, **payload)

    def on_reasoning(text: str) -> None:
        reasoning_holder["text"] = _trim_reasoning_text(text)
        pct = min(90, 20 + parsed_holder["n"] * 4)
        _set_step_progress(
            step,
            pct,
            phase="llm_request",
            parsed_rows=parsed_holder["n"],
            reasoning_text=reasoning_holder["text"],
        )

    rows, reasoning = _stream_parse_rows(
        prompt,
        ai,
        columns,
        on_progress=on_progress,
        on_reasoning=on_reasoning,
        should_cancel=lambda: is_job_cancelled(job["id"]),
    )
    _set_step_progress(step, 95, phase="parse", parsed_rows=len(rows))
    ctx["generated_rows"].extend(rows)
    result: dict[str, Any] = {"row_count": len(rows), "rows": rows}
    final_reasoning = _trim_reasoning_text(reasoning or reasoning_holder["text"])
    if final_reasoning:
        result["reasoning_text"] = final_reasoning
    return result


# ── 质量校验 ──────────────────────────────────────────────

def _shift_issue_row_indices(
    issues: list[dict[str, Any]], row_offset: int
) -> list[dict[str, Any]]:
    if not row_offset or not issues:
        return issues
    shifted: list[dict[str, Any]] = []
    for issue in issues:
        item = dict(issue)
        ri = item.get("row_index")
        if ri is not None:
            try:
                item["row_index"] = int(ri) + row_offset
            except (TypeError, ValueError):
                pass
        shifted.append(item)
    return shifted


def _step_validate(job: dict[str, Any], ctx: dict[str, Any], ai: dict[str, Any], step: dict[str, Any], request_data: dict[str, Any] | None = None) -> dict[str, Any]:
    columns = ctx["columns"]
    # _ensure_ctx_requirements 逻辑内联以避免循环 import
    req = str(ctx.get("requirements") or "").strip()
    if not req:
        opts = job.get("options") or {}
        from core.services.test_cases.lanhu_requirement_service import fetch_lanhu_requirements_summary
        cookie = str(opts.get("lanhu_cookie") or "").strip()
        url = str(opts.get("lanhu_url") or "").strip()
        if cookie and url:
            try:
                req = fetch_lanhu_requirements_summary(cookie, url)
            except Exception:
                req = ""
        if not req and job.get("mode") != "fill_gaps_only":
            req = str(job.get("user_intent") or "").strip()
        if req:
            ctx["requirements"] = req

    opts = job.get("options") or {}
    if job.get("mode") == "fill_gaps_only":
        batch_rows, row_offset = _resolve_fill_validate_rows(ctx, opts)
    else:
        batch_rows, row_offset = _resolve_agent_validate_rows(ctx, opts)
    if not batch_rows:
        return {
            "issue_count": 0,
            "over_generated_count": 0,
            "format_count": 0,
            "llm_count": 0,
            "issues": [],
            "skipped": True,
            "batch_row_count": 0,
        }
    _set_step_progress(step, 20, phase="format_check")
    format_issues = check_format_rules(columns, batch_rows)
    llm_issues: list[dict[str, Any]] = []
    use_llm = bool((job.get("options") or {}).get("use_llm_validate", True))
    if use_llm and ctx.get("requirements"):
        _set_step_progress(step, 55, phase="llm_validate")
        rd = request_data if isinstance(request_data, dict) else agent_request_data_from_job(job)
        charge_agent_job_text_quota(str(job.get("id") or ""), job.get("user_id"), rd)
        llm_issues = check_llm_quality(
            requirements=ctx["requirements"],
            columns=columns,
            rows=batch_rows,
            use_builtin=False,
            base_url=ai["base_url"],
            api_key=ai["api_key"],
            model=ai["model"],
            temperature=float(ai["temperature"]) if ai.get("temperature") is not None else 0.1,
            user_id=job.get("user_id"),
        )
    format_issues = _shift_issue_row_indices(format_issues, row_offset)
    llm_issues = _shift_issue_row_indices(llm_issues, row_offset)
    issues = format_issues + llm_issues
    gap_issues = [i for i in issues if i.get("type") != "hallucination"]
    over_issues = [i for i in issues if i.get("type") == "hallucination"]
    result: dict[str, Any] = {
        "issue_count": len(gap_issues),
        "over_generated_count": len(over_issues),
        "format_count": len(format_issues),
        "llm_count": len([i for i in llm_issues if i.get("type") == "gap"]),
        "issues": issues[:80],
        "batch_row_count": len(batch_rows),
        "batch_row_offset": row_offset,
    }
    matrix = ctx.get("coverage_matrix")
    if isinstance(matrix, dict):
        summary = matrix.get("summary") or {}
        if summary.get("coverage_rate") is not None:
            result["coverage_rate"] = summary.get("coverage_rate")
            result["coverage_uncovered"] = summary.get("uncovered", 0)
            result["coverage_partial"] = summary.get("partial", 0)
            result["coverage_over_generated"] = summary.get("over_generated", 0)
    return result
