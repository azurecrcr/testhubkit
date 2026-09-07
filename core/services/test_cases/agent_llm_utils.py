"""Agent 编排器 — LLM 工具、行处理、去重、Prompt 构建、进度存储。

纯工具函数，无副作用，可被所有其他文件安全导入。不依赖同目录下其他 agent_* 文件，
避免循环依赖。
"""

from __future__ import annotations

import json
import re
import threading
import time
import uuid
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any

from core.config.user_ai_credentials import UserAiConfigRequired, resolve_text_ai_credentials
from core.services.test_cases.agent_job_db import (
    is_job_cancelled,
    touch_job_heartbeat,
    update_step,
)
from core.services.test_cases.excel_importer_service import parse_test_cases
from core.services.test_cases.generation_stream_service import collect_stream_completion
from core.services.test_cases.incremental_case_parser import IncrementalCaseParser, parse_rows_from_text
from core.services.test_cases.lanhu_requirement_service import fetch_lanhu_requirements_summary
from core.services.test_cases.test_case_generator_service import generate_test_cases


# ── 基础工具 ──────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now()


def _new_id() -> str:
    return uuid.uuid4().hex




def charge_agent_job_text_quota(job_id: str, user_id: str | None, request_data: dict) -> None:
    """Agent 步骤内每次调用文本模型前扣额度并写入 job options 供 SSE 推送。"""
    from core.config.user_ai_credentials import UserAiConfigRequired, resolve_text_ai_credentials
    from core.services.ai.user_ai_daily_quota_service import pop_quota_meta
    from core.services.test_cases.agent_job_db import patch_job_options

    data = dict(request_data or {})
    if "use_builtin" not in data:
        data["use_builtin"] = True
    try:
        ai_cfg = resolve_text_ai_credentials(data, user_id)
    except UserAiConfigRequired:
        return
    quota_meta = pop_quota_meta(ai_cfg)
    if quota_meta:
        patch_job_options(job_id, {"_ai_quota_meta": quota_meta})


def agent_request_data_from_job(job: dict) -> dict:
    opts = job.get("options") or {}
    data = {"use_builtin": bool(opts.get("use_builtin", True))}
    if not data["use_builtin"]:
        data["base_url"] = str(opts.get("base_url") or "")
        data["api_key"] = str(opts.get("api_key") or "")
        data["model"] = str(opts.get("model") or "")
        data["temperature"] = opts.get("temperature")
    return data

def _parse_json_blob(raw: str) -> Any:
    text = str(raw or "").strip()
    if not text:
        return None
    match = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", text)
    if match:
        text = match.group(0)
    return json.loads(text)


def _resolve_ai_config(data: dict[str, Any], user_id: str | None = None) -> dict[str, Any]:
    try:
        from core.config.user_ai_credentials import resolve_text_ai_credentials_only
        return resolve_text_ai_credentials_only(data, user_id)
    except UserAiConfigRequired:
        raise RuntimeError("请先配置 AI")


# ── LLM 调用 ──────────────────────────────────────────────

def _call_llm(prompt: str, ai: dict[str, Any]) -> str:
    temp = ai.get("temperature")
    return generate_test_cases(
        ai["base_url"],
        ai["api_key"],
        ai["model"],
        prompt,
        [],
        temperature=temp if temp is not None else None,
    )


def _call_llm_stream(
    prompt: str,
    ai: dict[str, Any],
    *,
    on_delta: Any = None,
    on_reasoning: Any = None,
    should_cancel: Any = None,
) -> str:
    temp = ai.get("temperature")
    return collect_stream_completion(
        ai["base_url"],
        ai["api_key"],
        ai["model"],
        prompt,
        temperature=temp if temp is not None else None,
        on_delta=on_delta,
        on_reasoning=on_reasoning,
        should_cancel=should_cancel,
    )


# ── 流式解析 ──────────────────────────────────────────────

REASONING_TEXT_UI_LIMIT = 999999
REASONING_TEXT_DB_LIMIT = 0


def _trim_reasoning_text(text: str, limit: int = REASONING_TEXT_UI_LIMIT) -> str:
    raw = str(text or "").strip()
    if len(raw) <= limit:
        return raw
    return raw[-limit:]


def _extract_stream_thinking_prefix(buf: str) -> str:
    """从 content 流中提取 test_cases 赋值前的分析文字（无 reasoning 字段的模型）。"""
    raw = str(buf or "")
    if not raw.strip():
        return ""
    match = re.search(
        r"(?:^|\n)\s*(?:```(?:python|json)?\s*\n)?\s*test_cases\s*=",
        raw,
        re.MULTILINE,
    )
    if match and match.start() > 0:
        prefix = raw[: match.start()].strip()
        return prefix if len(prefix) >= 6 else ""
    if re.search(r"test_cases\s*=\s*\[", raw):
        return ""
    preview = raw.strip()
    return preview if len(preview) >= 6 else ""


def _stream_parse_rows(
    prompt: str,
    ai: dict[str, Any],
    columns: list[str],
    *,
    on_progress: Any = None,
    on_reasoning: Any = None,
    should_cancel: Any = None,
) -> tuple[list[list[str]], str]:
    """流式 LLM + 增量解析，返回 (用例行, reasoning 全文)。"""
    parser = IncrementalCaseParser(columns_count=len(columns) if columns else None)
    accumulated: list[list[str]] = []
    reasoning_parts: list[str] = []
    content_parts: list[str] = []
    last_reasoning_push = 0.0
    last_content_thinking_push = 0.0

    def _on_delta(delta: str) -> None:
        content_parts.append(delta)
        new_rows = parser.feed(delta)
        if new_rows:
            accumulated.extend(new_rows)
            if on_progress:
                on_progress(len(accumulated), parser.parsed_count)
        if reasoning_parts or not on_reasoning:
            return
        nonlocal last_content_thinking_push
        now = time.time()
        if now - last_content_thinking_push < 0.35:
            return
        thinking = _extract_stream_thinking_prefix("".join(content_parts))
        if not thinking:
            return
        last_content_thinking_push = now
        on_reasoning(_trim_reasoning_text(thinking))

    def _on_reasoning_delta(delta: str) -> None:
        reasoning_parts.append(delta)
        if not on_reasoning:
            return
        nonlocal last_reasoning_push
        now = time.time()
        if now - last_reasoning_push >= 0.35:
            last_reasoning_push = now
            on_reasoning(_trim_reasoning_text("".join(reasoning_parts)))

    raw = _call_llm_stream(
        prompt,
        ai,
        on_delta=_on_delta,
        on_reasoning=_on_reasoning_delta,
        should_cancel=should_cancel,
    )
    full_reasoning = _trim_reasoning_text("".join(reasoning_parts))
    if not full_reasoning:
        full_reasoning = _trim_reasoning_text(_extract_stream_thinking_prefix("".join(content_parts)))
    if on_reasoning and full_reasoning:
        on_reasoning(full_reasoning)
    if accumulated:
        final = parse_rows_from_text(raw, len(columns) if columns else None)
        if len(final) > len(accumulated):
            return final, full_reasoning
        return accumulated, full_reasoning
    return _parse_llm_rows(raw, columns), full_reasoning


# ── 行处理 ────────────────────────────────────────────────

def _normalize_rows(columns: list[str], rows: list[Any]) -> list[list[str]]:
    n = len(columns)
    out: list[list[str]] = []
    for row in rows:
        if not isinstance(row, (list, tuple)):
            continue
        normalized = [str(row[i] if i < len(row) and row[i] is not None else "") for i in range(n)]
        out.append(normalized)
    return out


def _parse_llm_rows(raw: str, columns: list[str]) -> list[list[str]]:
    text = str(raw or "").strip()
    if not text:
        return []
    try:
        parsed = parse_test_cases(text)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return _normalize_rows(columns, parsed)


def _format_rows_python_list_snippet(
    columns: list[str], rows: list[list[str]], max_rows: int = 50
) -> str:
    """将用例行格式化为 Python 列表片段，供缺口补全提示词引用。"""
    if not rows:
        return "(暂无)"
    n = len(columns)
    lines: list[str] = ["test_cases = ["]
    for row in rows[: max(1, max_rows)]:
        cells = [
            json.dumps(
                str(row[i] if i < len(row) and row[i] is not None else ""),
                ensure_ascii=False,
            )
            for i in range(n)
        ]
        lines.append(f"  [{', '.join(cells)}],")
    if len(rows) > max_rows:
        lines.append(f"  # ... 另有 {len(rows) - max_rows} 条未展示")
    lines.append("]")
    return "\n".join(lines)


# ── 去重 ──────────────────────────────────────────────────

def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.strip().lower(), b.strip().lower()).ratio()


def _row_signature(columns: list[str], row: list[str]) -> str:
    name_idx = 0
    mod_idx = 1 if len(columns) > 1 else 0
    for i, col in enumerate(columns):
        low = str(col).lower()
        if "用例名" in col or "标题" in low or col == "name":
            name_idx = i
        if "模块" in col or "module" in low:
            mod_idx = i
    name = row[name_idx] if name_idx < len(row) else ""
    mod = row[mod_idx] if mod_idx < len(row) else ""
    return f"{mod}::{name}".strip().lower()


def _row_signature_for_dedupe(columns: list[str], row: list[str]) -> str:
    sig = _row_signature(columns, row)
    return sig if sig and sig != "::" else ""


def _dedupe_rows(columns: list[str], rows: list[list[str]]) -> tuple[list[list[str]], list[dict[str, Any]]]:
    kept: list[list[str]] = []
    removed: list[dict[str, Any]] = []
    seen: list[str] = []
    for i, row in enumerate(rows):
        sig = _row_signature_for_dedupe(columns, row)
        if not sig:
            kept.append(row)
            continue
        dup = False
        for prev_sig in seen:
            if _similarity(sig, prev_sig) >= 0.88:
                dup = True
                break
        if dup:
            removed.append({"row_index": i, "signature": sig})
        else:
            seen.append(sig)
            kept.append(row)
    return kept, removed


def _dedupe_generated_against_existing(
    columns: list[str],
    existing_rows: list[list[str]],
    generated_rows: list[list[str]],
) -> tuple[list[list[str]], list[dict[str, Any]]]:
    """仅对本次新生成用例去重，并对照表内已有行；不修改/丢弃已有行。"""
    baseline: list[str] = []
    for row in existing_rows:
        sig = _row_signature_for_dedupe(columns, row)
        if not sig:
            continue
        baseline.append(sig)

    kept_new: list[list[str]] = []
    removed: list[dict[str, Any]] = []
    seen_new: list[str] = []
    for i, row in enumerate(generated_rows):
        sig = _row_signature_for_dedupe(columns, row)
        if not sig:
            kept_new.append(row)
            continue
        dup = False
        for prev_sig in baseline:
            if _similarity(sig, prev_sig) >= 0.88:
                dup = True
                removed.append({"row_index": i, "signature": sig, "reason": "existing"})
                break
        if dup:
            continue
        for prev_sig in seen_new:
            if _similarity(sig, prev_sig) >= 0.88:
                dup = True
                removed.append({"row_index": i, "signature": sig, "reason": "generated"})
                break
        if not dup:
            seen_new.append(sig)
            kept_new.append(row)
    return kept_new, removed


# ── Prompt 构建 ───────────────────────────────────────────

def _lanhu_requirements_configured(
    job: dict[str, Any], request_data: dict[str, Any] | None = None
) -> bool:
    request_data = request_data or {}
    opts = job.get("options") or {}
    url = str(opts.get("lanhu_url") or request_data.get("lanhu_url") or "").strip()
    cookie = str(opts.get("lanhu_cookie") or request_data.get("lanhu_cookie") or "").strip()
    return bool(url and cookie)


def _build_fill_gaps_user_prompt(_job: dict[str, Any], _opts: dict[str, Any]) -> str:
    return "补全以下未覆盖的需求功能点，不要重复已有用例。"


def _resolve_fill_gaps_requirements_text(
    ctx: dict[str, Any], job: dict[str, Any], request_data: dict[str, Any]
) -> str:
    """缺口补全：仅当用户配置了蓝湖需求地址时才返回需求文本。"""
    if not _lanhu_requirements_configured(job, request_data):
        return ""
    req = str(ctx.get("requirements") or "").strip()
    if req:
        return req[:12000]
    opts = job.get("options") or {}
    cookie = str(opts.get("lanhu_cookie") or request_data.get("lanhu_cookie") or "").strip()
    url = str(opts.get("lanhu_url") or request_data.get("lanhu_url") or "").strip()
    try:
        req = fetch_lanhu_requirements_summary(cookie, url)
    except Exception:
        req = ""
    req = str(req or "").strip()
    if req:
        ctx["requirements"] = req
    return req[:12000]


def _build_header_snippet(columns: list[str]) -> str:
    return " | ".join(str(c) for c in columns)


def _edit_mode_step_prompt_hint(columns: list[str]) -> str:
    if "编辑模式" not in columns:
        return ""
    return "\n【编辑模式字段要求】\n编辑模式字段必须且只能填写：STEP（全大写，禁止使用 STMP 或其他值；不得留空）。\n"


def _rag_context_block(
    ctx: dict[str, Any],
    limit: int = 12000,
    *,
    exclude_requirements: bool = False,
) -> str:
    stage = str(ctx.get("context_stage") or "module").strip().lower()
    stage_limits = {"summary": 3000, "module": 8000, "row": 4000}
    cap = stage_limits.get(stage, limit)

    layers = ctx.get("context_layers")
    if isinstance(layers, dict):
        req = str(layers.get("requirements") or "").strip()
        public = str(layers.get("public") or "").strip()
        has_layer_content = bool(public) or (bool(req) and not exclude_requirements)
        if has_layer_content:
            parts: list[str] = []
            if req and not exclude_requirements:
                parts.append(f"【当前页需求（蓝湖）】\n{req[:cap]}")
            if public:
                parts.append(f"【平台历史案例（公共库）】\n{public[:cap]}")
            if parts:
                return "\n\n".join(parts) + "\n\n"
    rag = str(ctx.get("rag_context") or "").strip()
    if not rag:
        return ""
    return f"【知识库-历史需求】\n{rag[:cap]}\n\n"


def _parse_intent_filters(user_intent: str) -> dict[str, Any]:
    intent = str(user_intent or "").strip()
    filters: dict[str, Any] = {"priority": [], "gap_types": []}
    upper = intent.upper()
    if "P0" in upper:
        filters["priority"].append("P0")
    if "P1" in upper:
        filters["priority"].append("P1")
    if any(k in intent for k in ("边界", "异常", "edge", "边界场景")):
        filters["gap_types"].extend(["boundary", "exception", "edge_case"])
    return filters


# ── 进度/存储 ─────────────────────────────────────────────

def _set_step_progress(step: dict[str, Any], progress_percent: int, **extra: Any) -> None:
    payload: dict[str, Any] = {"progress_percent": max(0, min(100, int(progress_percent)))}
    payload.update(extra)
    update_step(step["id"], "running", output=_compact_step_output_for_db(payload))
    job_id = str(step.get("job_id") or "").strip()
    if job_id:
        touch_job_heartbeat(job_id)


def _compact_step_output_for_db(payload: dict[str, Any]) -> dict[str, Any]:
    out = dict(payload)
    if "reasoning_text" in out:
        out["reasoning_text"] = _trim_reasoning_text(
            str(out.get("reasoning_text") or ""), REASONING_TEXT_DB_LIMIT
        )
    slots = out.get("module_thinking_slots")
    if isinstance(slots, list):
        compact_slots = []
        for slot in slots:
            if not isinstance(slot, dict):
                continue
            row = dict(slot)
            row["text"] = str(row.get("text") or "")
            compact_slots.append(row)
        out["module_thinking_slots"] = compact_slots
    return out


def strip_thinking_fields(data: Any) -> Any:
    if not isinstance(data, dict):
        return data
    out = dict(data)
    out.pop("reasoning_text", None)
    out.pop("module_thinking_slots", None)
    return out
