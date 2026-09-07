"""Agent 编排器 — 生成类步骤：摘要、模块拆分、分模块生成、去重。

依赖 agent_llm_utils 中的工具函数，不依赖 agent_orchestrator_service。
"""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from core.services.test_cases.agent_job_db import is_job_cancelled, update_job_status
from core.services.test_cases.lanhu_requirement_service import fetch_lanhu_requirements_summary
from core.services.test_cases.agent_llm_utils import (
    _build_header_snippet,
    _call_llm_stream,
    _dedupe_generated_against_existing,
    _edit_mode_step_prompt_hint,
    _format_rows_python_list_snippet,
    _normalize_rows,
    _now,
    _parse_json_blob,
    _parse_llm_rows,
    _rag_context_block,
    _set_step_progress,
    _stream_parse_rows,
    _trim_reasoning_text,
)

MODULE_GEN_CONCURRENCY = 3


# ── 摘要 ──────────────────────────────────────────────────

def _step_summarize(
    job: dict[str, Any], ctx: dict[str, Any], request_data: dict[str, Any], step: dict[str, Any]
) -> dict[str, Any]:
    req = ctx["requirements"]
    opts = job.get("options") or {}
    cookie = str(opts.get("lanhu_cookie") or request_data.get("lanhu_cookie") or "").strip()
    url = str(opts.get("lanhu_url") or request_data.get("lanhu_url") or "").strip()
    if job.get("mode") == "fill_gaps_only" and cookie and url:
        _set_step_progress(step, 25, phase="lanhu_fetch")
        req = fetch_lanhu_requirements_summary(cookie, url)
    elif not req and cookie and url:
        _set_step_progress(step, 25, phase="lanhu_fetch")
        req = fetch_lanhu_requirements_summary(cookie, url)
    if not req and job.get("mode") != "fill_gaps_only":
        req = job["user_intent"]
    ctx["requirements"] = req or ""
    _set_step_progress(step, 90, phase="summarized")
    update_job_status(job["id"], "running", requirements_summary=req, now=_now())
    return {"requirements_length": len(req), "preview": req[:400]}


# ── 模块拆分 ──────────────────────────────────────────────

def _step_split_modules(job: dict[str, Any], ctx: dict[str, Any], ai: dict[str, Any], step: dict[str, Any]) -> dict[str, Any]:
    prompt = (
        "你是测试架构师。根据【需求摘要】拆分为 3～8 个测试模块。\n"
        "严格输出 JSON 数组，不要 markdown：\n"
        '[{"name":"模块名","description":"一句话描述","priority":"P0|P1|P2"}]\n\n'
        f"【用户指令】\n{job['user_intent']}\n\n"
        f"【需求摘要】\n{ctx['requirements'][:12000]}"
    )
    _set_step_progress(step, 15, phase="llm_request")
    content_parts: list[str] = []
    reasoning_parts: list[str] = []
    last_thinking_push = 0.0

    def _publish_split_thinking(pct: int = 20) -> None:
        nonlocal last_thinking_push
        now = time.time()
        if now - last_thinking_push < 0.35 and pct < 70:
            return
        last_thinking_push = now
        text = _trim_reasoning_text(
            "".join(reasoning_parts) if reasoning_parts else "".join(content_parts)
        )
        extra: dict[str, Any] = {"phase": "llm_request"}
        if text:
            extra["reasoning_text"] = text
        _set_step_progress(step, pct, **extra)

    def on_reasoning(delta: str) -> None:
        reasoning_parts.append(delta)
        _publish_split_thinking(25)

    def on_delta(delta: str) -> None:
        content_parts.append(delta)
        if not reasoning_parts:
            _publish_split_thinking(25)

    raw = _call_llm_stream(
        prompt,
        ai,
        on_delta=on_delta,
        on_reasoning=on_reasoning,
        should_cancel=lambda: is_job_cancelled(job["id"]),
    )
    _set_step_progress(step, 75, phase="parse")
    modules = _parse_json_blob(raw)
    if not isinstance(modules, list) or not modules:
        modules = [{"name": "主流程", "description": job["user_intent"][:200], "priority": "P1"}]
    cleaned = []
    for item in modules[:8]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        cleaned.append(
            {
                "name": name,
                "description": str(item.get("description") or "").strip(),
                "priority": str(item.get("priority") or "P1").strip(),
            }
        )
    if not cleaned:
        cleaned = [{"name": "主流程", "description": job["user_intent"][:200], "priority": "P1"}]
    ctx["modules"] = cleaned
    final_reasoning = _trim_reasoning_text(
        "".join(reasoning_parts)
        if reasoning_parts
        else "".join(content_parts) or str(raw or "")
    )
    return {
        "module_count": len(cleaned),
        "modules": cleaned,
        "reasoning_text": final_reasoning,
    }


# ── 并行模块生成进度聚合器 ────────────────────────────────

class _ParallelModuleProgress:
    """分模块并行生成时的统一总进度（聚合各 worker，避免每路任务各自推一条进度）。"""

    def __init__(
        self,
        step: dict[str, Any],
        total_modules: int,
        module_names: list[str] | None = None,
    ) -> None:
        self.step = step
        self.total = max(1, int(total_modules))
        self.module_names = list(module_names or [])
        self._lock = threading.Lock()
        self._slots: dict[int, dict[str, Any]] = {}
        self._reasoning_by_idx: dict[int, str] = {}

    def start_module(self, idx: int, name: str) -> None:
        with self._lock:
            self._slots[idx] = {"name": name, "parsed": 0, "done": False}
            self._publish()

    def tick_module(self, idx: int, parsed: int) -> None:
        with self._lock:
            slot = self._slots.setdefault(idx, {"name": "", "parsed": 0, "done": False})
            slot["parsed"] = max(0, int(parsed))
            self._publish()

    def finish_module(self, idx: int, parsed: int, name: str) -> None:
        with self._lock:
            slot = self._slots.setdefault(idx, {"name": name, "parsed": 0, "done": False})
            slot["name"] = name or slot.get("name") or ""
            slot["parsed"] = max(0, int(parsed))
            slot["done"] = True
            self._publish()

    def update_reasoning(self, idx: int, text: str) -> None:
        """合并模块思考流：支持增量 chunk 与累计快照，避免重复拼接。"""
        piece = str(text or "")
        if not piece:
            return
        with self._lock:
            prev = str(self._reasoning_by_idx.get(idx) or "")
            if not prev:
                merged = piece
            elif piece == prev:
                merged = prev
            elif piece.startswith(prev):
                # 上游推送的是截至当前的完整思考文本
                merged = piece
            elif prev.startswith(piece):
                merged = prev
            else:
                # 上游推送的是增量片段
                merged = prev + piece
            if merged != prev:
                self._reasoning_by_idx[idx] = merged
                self._publish()

    def reasoning_text(self) -> str:
        with self._lock:
            return self._combined_reasoning_preview()

    def _combined_reasoning_preview(self) -> str:
        chunks: list[str] = []
        for idx in sorted(self._reasoning_by_idx.keys()):
            text = str(self._reasoning_by_idx.get(idx) or "").strip()
            if not text:
                continue
            slot = self._slots.get(idx) or {}
            name = str(slot.get("name") or f"模块{idx + 1}").strip()
            chunks.append(f"【{name}】\n{text}")
        combined = "\n\n".join(chunks)
        return _trim_reasoning_text(combined)

    def module_thinking_slots_payload(self) -> list[dict[str, Any]]:
        with self._lock:
            return self._module_thinking_slots_payload_unlocked()

    def _module_thinking_slots_payload_unlocked(self) -> list[dict[str, Any]]:
        slots_out: list[dict[str, Any]] = []
        for idx in range(self.total):
            slot = self._slots.get(idx) or {}
            name = str(slot.get("name") or "").strip()
            if not name and idx < len(self.module_names):
                name = str(self.module_names[idx] or "").strip()
            if not name:
                name = f"模块{idx + 1}"
            text = _trim_reasoning_text(str(self._reasoning_by_idx.get(idx) or ""))
            if slot.get("done"):
                status = "done"
            elif idx in self._slots and not slot.get("done"):
                status = "active"
            else:
                status = "pending"
            slots_out.append(
                {"idx": idx, "name": name, "text": text, "status": status}
            )
        return slots_out

    def _publish(self) -> None:
        total = self.total
        done = 0
        agg_pct = 0.0
        active: list[str] = []
        parsed_total = 0
        for idx in range(total):
            slot = self._slots.get(idx)
            if not slot:
                continue
            parsed_total += int(slot.get("parsed") or 0)
            if slot.get("done"):
                done += 1
                agg_pct += 100.0 / total
            else:
                frac = min(0.92, int(slot.get("parsed") or 0) / 25.0)
                agg_pct += (frac * 100.0) / total
                name = str(slot.get("name") or "").strip()
                if name:
                    active.append(name)
        _set_step_progress(
            self.step,
            int(min(99, round(agg_pct))),
            phase="parallel_gen",
            progress_mode="aggregate",
            completed=done,
            total=total,
            active_modules=active[:4],
            parsed_rows=parsed_total,
            reasoning_text=self._combined_reasoning_preview(),
            module_thinking_slots=self._module_thinking_slots_payload_unlocked(),
        )


# ── 分模块生成 ────────────────────────────────────────────

def _build_module_gen_prompt(
    job: dict[str, Any], ctx: dict[str, Any], mod: dict[str, Any], header: str
) -> str:
    return (
        f"{job['user_intent']}\n\n"
        f"【表头】\n{header}\n\n"
        "请严格按表头字段及顺序生成用例，输出 Python 列表：test_cases = [[...], ...]\n"
        "每条用例为一条内层数组，字段个数与顺序必须与表头一致。\n"
        f"{_edit_mode_step_prompt_hint(ctx['columns'])}\n"
        f"{_rag_context_block(ctx)}"
        f"【当前模块】{mod.get('name')}（{mod.get('priority', 'P1')}）\n"
        f"{mod.get('description', '')}\n\n"
        f"【需求摘要】\n{ctx['requirements'][:8000]}"
    )


def _generate_module_rows(
    job: dict[str, Any],
    ctx: dict[str, Any],
    ai: dict[str, Any],
    mod: dict[str, Any],
    idx: int,
    header: str,
    step: dict[str, Any],
    tracker: _ParallelModuleProgress,
) -> tuple[int, dict[str, Any], list[list[str]], str]:
    if is_job_cancelled(job["id"]):
        return idx, mod, [], str(mod.get("name") or f"模块{idx + 1}")
    module_name = str(mod.get("name") or f"模块{idx + 1}")
    tracker.start_module(idx, module_name)
    prompt = _build_module_gen_prompt(job, ctx, mod, header)
    columns = ctx["columns"]

    def on_progress(_accumulated: int, parsed: int) -> None:
        tracker.tick_module(idx, parsed)

    def on_reasoning(delta: str) -> None:
        tracker.update_reasoning(idx, delta)

    rows, _reasoning = _stream_parse_rows(
        prompt,
        ai,
        columns,
        on_progress=on_progress,
        on_reasoning=on_reasoning,
        should_cancel=lambda: is_job_cancelled(job["id"]),
    )
    return idx, mod, rows, module_name


def _step_generate_modules(
    job: dict[str, Any], ctx: dict[str, Any], ai: dict[str, Any], step: dict[str, Any]
) -> dict[str, Any]:
    columns = ctx["columns"]
    header = _build_header_snippet(columns)
    modules = ctx.get("modules") or [{"name": "主流程", "description": job["user_intent"], "priority": "P1"}]
    total = len(modules) or 1
    workers = min(MODULE_GEN_CONCURRENCY, total)
    all_new: list[list[str]] = []
    details: list[dict[str, Any]] = []
    ordered_results: list[tuple[dict[str, Any], list[list[str]], str] | None] = [None] * total
    module_names = [
        str(m.get("name") or f"模块{i + 1}").strip() for i, m in enumerate(modules)
    ]
    tracker = _ParallelModuleProgress(step, total, module_names)

    def on_module_done(result: tuple[int, dict[str, Any], list[list[str]], str]) -> None:
        idx, mod_out, rows, module_name = result
        ordered_results[idx] = (mod_out, rows, module_name)
        tracker.finish_module(idx, len(rows), module_name)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [
            pool.submit(
                _generate_module_rows,
                job,
                ctx,
                ai,
                mod,
                idx,
                header,
                step,
                tracker,
            )
            for idx, mod in enumerate(modules)
        ]
        for fut in as_completed(futures):
            if is_job_cancelled(job["id"]):
                break
            on_module_done(fut.result())

    for item in ordered_results:
        if not item:
            continue
        mod_out, rows, module_name = item
        all_new.extend(rows)
        details.append({"module": mod_out.get("name") or module_name, "row_count": len(rows)})
    ctx["generated_rows"] = all_new
    reasoning_text = tracker.reasoning_text()
    result: dict[str, Any] = {"row_count": len(all_new), "modules": details, "rows": all_new}
    if reasoning_text:
        result["reasoning_text"] = reasoning_text
    result["module_thinking_slots"] = tracker.module_thinking_slots_payload()
    return result


# ── 去重 ──────────────────────────────────────────────────

def _step_dedupe(job: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    columns = ctx["columns"]
    generated = list(ctx.get("generated_rows") or [])
    input_new_count = len(generated)
    kept_new, removed = _dedupe_generated_against_existing(
        columns,
        list(ctx.get("existing_rows") or []),
        generated,
    )
    ctx["generated_rows"] = kept_new
    ctx["dedupe_removed"] = removed
    return {
        "removed_count": len(removed),
        "remaining_new": len(kept_new),
        "input_new_count": input_new_count,
        "existing_count": len(ctx.get("existing_rows") or []),
        "rows": kept_new,
    }
