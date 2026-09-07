"""流式用例生成：上游 LLM SSE 转发 + 增量解析 + 会话事件。"""
from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from typing import Any, Generator

import requests

from core.config.user_ai_credentials import UserAiConfigRequired, resolve_text_ai_credentials
from core.services.ai.openai_compat import build_chat_completions_payload
from core.services.test_cases.generation_session_db import (
    append_session_event,
    cancel_session,
    clear_session_events,
    ensure_generation_session_tables,
    get_session,
    get_session_events_since,
    insert_session,
    is_session_cancelled,
    update_session,
)
from core.services.test_cases.incremental_case_parser import (
    IncrementalCaseParser,
    IncrementalMindmapParser,
    extract_mindmap_parseable_text,
    parse_list_rows_from_text,
    parse_mindmap_rows_from_text,
)
from core.services.test_cases.lanhu_provenance import (
    provenance_list_for_rows,
    resolve_lanhu_provenance_from_request,
)
from core.services.test_cases.page_generation_lock_service import finish_page_gen_lock_for_session
from core.services.test_cases.test_case_generator_service import _format_upstream_api_error
from core.services.visual_attachments.context_builder import (
    inject_attachment_context_into_prompt,
)

_log = logging.getLogger(__name__)

_running_threads: dict[str, threading.Thread] = {}


def _new_id() -> str:
    return uuid.uuid4().hex


def _push_event(session_id: str, event: dict[str, Any]) -> None:
    append_session_event(session_id, event)


def _get_events_since(session_id: str, after_seq: int) -> tuple[list[dict[str, Any]], int]:
    return get_session_events_since(session_id, after_seq)


def _clear_session_events(session_id: str) -> None:
    clear_session_events(session_id)



def _normalize_stream_content_piece(value: Any) -> str:
    """Normalize OpenAI-compatible streaming content (string, parts list, etc.)."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, dict):
                if item.get("type") == "text":
                    parts.append(str(item.get("text") or ""))
                elif "text" in item:
                    parts.append(str(item.get("text") or ""))
            elif isinstance(item, str):
                parts.append(item)
        return "".join(parts)
    return str(value)


def _extract_stream_delta_parts(chunk: dict[str, Any]) -> list[tuple[str, str]]:
    """Extract reasoning/content parts from assorted chat completion stream chunk shapes."""
    choices = chunk.get("choices") or []
    if not choices:
        return []
    choice = choices[0] if isinstance(choices[0], dict) else {}
    delta = choice.get("delta") or {}
    parts: list[tuple[str, str]] = []
    if isinstance(delta, dict):
        reasoning = _normalize_stream_content_piece(delta.get("reasoning_content"))
        if not reasoning:
            reasoning = _normalize_stream_content_piece(delta.get("reasoning"))
        if not reasoning:
            reasoning = _normalize_stream_content_piece(delta.get("thinking"))
        if not reasoning:
            reasoning = _normalize_stream_content_piece(delta.get("thought"))
        content = _normalize_stream_content_piece(delta.get("content"))
        if not content:
            content = _normalize_stream_content_piece(delta.get("text"))
        if reasoning:
            parts.append(("reasoning", reasoning))
        if content:
            parts.append(("content", content))
    message = choice.get("message") or {}
    if isinstance(message, dict) and not parts:
        reasoning = _normalize_stream_content_piece(message.get("reasoning_content"))
        if not reasoning:
            reasoning = _normalize_stream_content_piece(message.get("reasoning"))
        if not reasoning:
            reasoning = _normalize_stream_content_piece(message.get("thinking"))
        if not reasoning:
            reasoning = _normalize_stream_content_piece(message.get("thought"))
        content = _normalize_stream_content_piece(message.get("content"))
        if reasoning:
            parts.append(("reasoning", reasoning))
        if content:
            parts.append(("content", content))
    return parts


def stream_chat_completions(
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    images_base64: list[str] | None = None,
    temperature: float | None = None,
) -> Generator[tuple[str, str], None, None]:
    """OpenAI 兼容流式 chat completions，yield (stream_kind, text)。"""
    images_base64 = images_base64 or []
    images: list[str] = []
    for img_b64 in images_base64:
        if img_b64:
            if "," in img_b64:
                img_b64 = img_b64.split(",", 1)[1]
            images.append(img_b64)

    api_url = f"{base_url.rstrip('/')}/chat/completions"
    if images:
        content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
        for img in images:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img}"},
                }
            )
        messages = [{"role": "user", "content": content}]
    else:
        messages = [{"role": "user", "content": prompt}]

    payload = build_chat_completions_payload(
        model=model,
        messages=messages,
        stream=True,
        temperature=temperature,
        enable_thinking=True,
    )
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    with requests.post(
        api_url, json=payload, headers=headers, stream=True, timeout=(10, None)
    ) as response:
        if response.status_code >= 400:
            detail = _format_upstream_api_error(response)
            raise requests.exceptions.HTTPError(
                f"API请求失败 ({response.status_code}): {detail or response.text[:200]}"
            )
        for raw_line in response.iter_lines(decode_unicode=True):
            if not raw_line:
                continue
            line = raw_line.strip()
            if not line.startswith("data:"):
                continue
            data_str = line[5:].strip()
            if data_str == "[DONE]":
                break
            try:
                chunk = json.loads(data_str)
            except json.JSONDecodeError:
                continue
            for stream_kind, content_piece in _extract_stream_delta_parts(chunk):
                yield stream_kind, content_piece



def stream_chat_completions_messages(
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float | None = None,
    should_cancel: Any = None,
) -> Generator[tuple[str, str], None, None]:
    """OpenAI 兼容流式 chat completions（多轮 messages）。"""
    api_url = f"{base_url.rstrip('/')}/chat/completions"
    payload = build_chat_completions_payload(
        model=model,
        messages=messages,
        stream=True,
        temperature=temperature,
        enable_thinking=True,
    )
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    response = requests.post(
        api_url, json=payload, headers=headers, stream=True, timeout=(10, None)
    )
    try:
        if response.status_code >= 400:
            detail = _format_upstream_api_error(response)
            raise requests.exceptions.HTTPError(
                f"API请求失败 ({response.status_code}): {detail or response.text[:200]}"
            )
        for raw_line in response.iter_lines(decode_unicode=True):
            if should_cancel and should_cancel():
                break
            if not raw_line:
                continue
            line = raw_line.strip()
            if not line.startswith("data:"):
                continue
            data_str = line[5:].strip()
            if data_str == "[DONE]":
                break
            try:
                chunk = json.loads(data_str)
            except json.JSONDecodeError:
                continue
            for stream_kind, content_piece in _extract_stream_delta_parts(chunk):
                if should_cancel and should_cancel():
                    return
                yield stream_kind, content_piece
    finally:
        response.close()



def _resolve_ai_config(data: dict[str, Any], user_id: str | None) -> dict[str, Any]:
    try:
        return resolve_text_ai_credentials(data, user_id)
    except UserAiConfigRequired:
        raise ValueError("请先配置 AI")


def collect_stream_completion(
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    *,
    images_base64: list[str] | None = None,
    temperature: float | None = None,
    on_delta: Any = None,
    on_reasoning: Any = None,
    should_cancel: Any = None,
) -> str:
    """流式调用 LLM 并累积全文；可选 content/reasoning 回调与取消检测。"""
    parts: list[str] = []
    for stream_kind, delta in stream_chat_completions(
        base_url,
        api_key,
        model,
        prompt,
        images_base64,
        temperature=temperature,
    ):
        if should_cancel and should_cancel():
            break
        if stream_kind == "reasoning":
            if on_reasoning:
                on_reasoning(delta)
            continue
        if stream_kind != "content":
            continue
        parts.append(delta)
        if on_delta:
            on_delta(delta)
    return "".join(parts)



def _commit_rows_batch(
    session_id: str,
    *,
    batch: list[list[str]],
    row_offset: int,
    parsed_rows: int,
    lanhu_provenance_entry: dict | None = None,
) -> int:
    """推送 rows_commit + parse_progress，返回更新后的 row_offset。"""
    if not batch:
        return row_offset
    update_session(session_id, parsed_rows=parsed_rows)
    event: dict[str, Any] = {
        "type": "rows_commit",
        "rows": batch,
        "row_offset": row_offset,
    }
    prov_list = provenance_list_for_rows(lanhu_provenance_entry, len(batch))
    if prov_list:
        event["provenance"] = prov_list
    _push_event(session_id, event)
    _push_event(
        session_id,
        {
            "type": "parse_progress",
            "parsed_rows": parsed_rows,
            "delta_rows": len(batch),
        },
    )
    return row_offset + len(batch)


def _run_session(session_id: str, request_data: dict[str, Any], user_id: str | None) -> None:
    start_ms = time.time()
    mode = str(request_data.get("mode") or "list")
    merge_mode = str(request_data.get("merge_mode") or "overwrite")
    prompt = str(request_data.get("prompt") or "")
    vc_id = str(request_data.get("visual_context_id") or "").strip() or None
    prompt = inject_attachment_context_into_prompt(prompt, vc_id, user_id)
    columns = request_data.get("columns") or []
    columns_count = len(columns) if columns else None

    lanhu_provenance_entry = resolve_lanhu_provenance_from_request(request_data)

    try:
        ai = _resolve_ai_config(request_data, user_id)
        from core.services.ai.user_ai_daily_quota_service import pop_quota_meta

        quota_meta = pop_quota_meta(ai)
        update_session(session_id, status="running")
        if quota_meta:
            _push_event(session_id, {"type": "ai_quota", "ai_quota": quota_meta})
        _push_event(
            session_id,
            {
                "type": "session_start",
                "session_id": session_id,
                "mode": mode,
                "merge_mode": merge_mode,
            },
        )

        _push_event(
            session_id,
            {
                "type": "stream_activity",
                "stage": "connecting",
                "parsed_rows": 0,
            },
        )

        parser: Any = (
            IncrementalMindmapParser(columns_count=columns_count)
            if mode == "mindmap"
            else IncrementalCaseParser(columns_count=columns_count)
        )

        pending_rows: list[list[str]] = []
        last_commit = time.time()
        row_offset = 0
        last_heartbeat = time.time()
        full_text_parts: list[str] = []
        full_reasoning_parts: list[str] = []
        reasoning_chunk_buffer = ""
        content_chunk_buffer = ""
        stream_chunk_count = 0
        last_stream_chunk_push = time.time()

        def _flush_stream_chunks(force: bool = False) -> None:
            nonlocal reasoning_chunk_buffer, content_chunk_buffer, stream_chunk_count, last_stream_chunk_push
            if not force and time.time() - last_stream_chunk_push < 0.05:
                if not reasoning_chunk_buffer and not content_chunk_buffer:
                    return
            if reasoning_chunk_buffer:
                _push_event(
                    session_id,
                    {
                        "type": "stream_chunk",
                        "content": reasoning_chunk_buffer,
                        "stream_kind": "reasoning",
                        "step": "gen",
                        "timestamp": int(time.time()),
                    },
                )
                stream_chunk_count += 1
                reasoning_chunk_buffer = ""
            if content_chunk_buffer:
                _push_event(
                    session_id,
                    {
                        "type": "stream_chunk",
                        "content": content_chunk_buffer,
                        "stream_kind": "content",
                        "step": "gen",
                        "timestamp": int(time.time()),
                    },
                )
                stream_chunk_count += 1
                content_chunk_buffer = ""
            last_stream_chunk_push = time.time()

        for stream_kind, delta in stream_chat_completions(
            ai["base_url"],
            ai["api_key"],
            ai["model"],
            prompt,
            request_data.get("images") or [],
            temperature=ai.get("temperature"),
        ):
            if is_session_cancelled(session_id):
                break
            if stream_kind == "reasoning":
                full_reasoning_parts.append(delta)
                reasoning_chunk_buffer += delta
                _flush_stream_chunks()
                continue
            full_text_parts.append(delta)
            content_chunk_buffer += delta
            _flush_stream_chunks()
            new_rows = parser.feed(delta)
            if new_rows:
                pending_rows.extend(new_rows)
            now = time.time()
            if now - last_heartbeat >= 2.0:
                _push_event(
                    session_id,
                    {
                        "type": "stream_activity",
                        "stage": "generating",
                        "parsed_rows": parser.parsed_count,
                    },
                )
                last_heartbeat = now
            if pending_rows and (len(pending_rows) >= 5 or now - last_commit >= 0.5):
                batch = pending_rows[:]
                pending_rows.clear()
                row_offset = _commit_rows_batch(
                    session_id,
                    batch=batch,
                    row_offset=row_offset,
                    parsed_rows=parser.parsed_count,
                    lanhu_provenance_entry=lanhu_provenance_entry,
                )
                last_commit = now

        _flush_stream_chunks(force=True)
        if not is_session_cancelled(session_id):
            full_text = "".join(full_text_parts)
            full_reasoning = "".join(full_reasoning_parts)
            if len(full_text) > 50000:
                full_text = full_text[-50000:]
            if len(full_reasoning) > 50000:
                full_reasoning = full_reasoning[-50000:]
            stream_done_event: dict[str, Any] = {
                "type": "stream_done",
                "total_chunks": stream_chunk_count,
                "total_rows": parser.parsed_count,
                "full_text": full_text,
            }
            if full_reasoning:
                stream_done_event["reasoning_text"] = full_reasoning
            _push_event(session_id, stream_done_event)

        if pending_rows and not is_session_cancelled(session_id):
            row_offset = _commit_rows_batch(
                session_id,
                batch=pending_rows,
                row_offset=row_offset,
                parsed_rows=parser.parsed_count,
                lanhu_provenance_entry=lanhu_provenance_entry,
            )
            pending_rows.clear()

        total_rows = parser.parsed_count
        if not is_session_cancelled(session_id):
            full_text = "".join(full_text_parts)
            full_reasoning = "".join(full_reasoning_parts)
            col_list = columns if isinstance(columns, list) else None
            if mode == "mindmap":
                final_rows = parse_mindmap_rows_from_text(full_text, columns_count)
                if not final_rows and full_reasoning.strip():
                    reasoning_payload = extract_mindmap_parseable_text(full_reasoning)
                    final_rows = parse_mindmap_rows_from_text(reasoning_payload, columns_count)
            else:
                final_rows = parse_list_rows_from_text(
                    full_text,
                    columns=col_list,
                    columns_count=columns_count,
                )
                if not final_rows and full_reasoning.strip():
                    final_rows = parse_list_rows_from_text(
                        full_reasoning,
                        columns=col_list,
                        columns_count=columns_count,
                    )
            if len(final_rows) > row_offset:
                tail = final_rows[row_offset:]
                row_offset = _commit_rows_batch(
                    session_id,
                    batch=tail,
                    row_offset=row_offset,
                    parsed_rows=len(final_rows),
                    lanhu_provenance_entry=lanhu_provenance_entry,
                )
            total_rows = max(row_offset, len(final_rows))

        duration_ms = int((time.time() - start_ms) * 1000)
        if is_session_cancelled(session_id):
            _push_event(
                session_id,
                {
                    "type": "session_done",
                    "total_rows": row_offset,
                    "duration_ms": duration_ms,
                    "cancelled": True,
                },
            )
            update_session(session_id, status="cancelled", duration_ms=duration_ms)
        else:
            session_full_text = "".join(full_text_parts)
            session_full_reasoning = "".join(full_reasoning_parts)
            if len(session_full_text) > 50000:
                session_full_text = session_full_text[-50000:]
            if len(session_full_reasoning) > 50000:
                session_full_reasoning = session_full_reasoning[-50000:]
            done_event: dict[str, Any] = {
                "type": "session_done",
                "total_rows": total_rows,
                "duration_ms": duration_ms,
                "full_text": session_full_text,
            }
            if session_full_reasoning:
                done_event["reasoning_text"] = session_full_reasoning
            if lanhu_provenance_entry:
                done_event["row_provenance"] = lanhu_provenance_entry
            _push_event(session_id, done_event)
            update_session(
                session_id,
                status="done",
                parsed_rows=total_rows,
                duration_ms=duration_ms,
                output_text=session_full_text,
            )
            _log.info(
                "generation session %s done rows=%s duration_ms=%s",
                session_id,
                total_rows,
                duration_ms,
            )
    except Exception as exc:
        _log.exception("generation session %s failed", session_id)
        duration_ms = int((time.time() - start_ms) * 1000)
        _push_event(
            session_id,
            {
                "type": "stream_error",
                "message": str(exc),
                "recoverable": True,
            },
        )
        _push_event(
            session_id,
            {
                "type": "error",
                "message": str(exc),
                "recoverable": True,
            },
        )
        update_session(
            session_id,
            status="error",
            error_message=str(exc),
            duration_ms=duration_ms,
        )
    finally:
        try:
            sess = get_session(session_id)
            st = str((sess or {}).get("status") or "error")
            finish_page_gen_lock_for_session(session_id, st)
        except Exception:
            finish_page_gen_lock_for_session(session_id, "error")
        _running_threads.pop(session_id, None)


def create_generation_session(data: dict[str, Any], user_id: str | None) -> dict[str, Any]:
    ensure_generation_session_tables()
    prompt = str(data.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("请输入提示词")
    mode = str(data.get("mode") or "list")
    if mode not in ("list", "mindmap"):
        mode = "list"
    merge_mode = str(data.get("merge_mode") or "overwrite")
    columns = data.get("columns") or []

    from core.services.ai.user_ai_daily_quota_service import assert_text_ai_available_for_job

    assert_text_ai_available_for_job(data, user_id)

    session_id = _new_id()
    insert_session(
        session_id=session_id,
        user_id=user_id,
        mode=mode,
        merge_mode=merge_mode,
        columns=columns if isinstance(columns, list) else [],
    )
    thread = threading.Thread(
        target=_run_session,
        args=(session_id, data, user_id),
        daemon=True,
    )
    _running_threads[session_id] = thread
    thread.start()
    session = get_session(session_id)
    return session or {"id": session_id, "status": "pending"}


def cancel_generation_session(session_id: str) -> bool:
    return cancel_session(session_id)


def session_stream_events(session_id: str) -> Generator[str, None, None]:
    """SSE generator：推送会话事件直至结束。"""
    seq = 0
    idle = 0
    max_idle = 120
    saw_terminal_event = False
    while idle < max_idle:
        session = get_session(session_id)
        if not session:
            yield f"data: {json.dumps({'type': 'error', 'message': '会话不存在'}, ensure_ascii=False)}\n\n"
            break
        new_events, seq = _get_events_since(session_id, seq)
        for event in new_events:
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            idle = 0
            if event.get("type") in ("session_done", "error"):
                saw_terminal_event = True
        status = session.get("status") or ""
        if status in ("done", "error", "cancelled"):
            if status == "cancelled" or saw_terminal_event or status == "error":
                break
            idle = 0
        elif status == "running" or new_events:
            idle = 0
        else:
            idle += 1
        time.sleep(0.25)
    # 结束前再拉一次，避免竞态漏推 terminal 事件
    tail_events, seq = _get_events_since(session_id, seq)
    for event in tail_events:
        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
    yield f"data: {json.dumps({'type': 'stream_end', 'session_id': session_id}, ensure_ascii=False)}\n\n"
    _clear_session_events(session_id)
