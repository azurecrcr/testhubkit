# -*- coding: utf-8 -*-
"""压测造数 JMeter AI 对话落库业务封装（旁路，失败不影响 SSE）。"""
from __future__ import annotations

import logging
import uuid
from collections.abc import Generator, Iterable
from typing import Any

from core.services.jmeter_scenario import ai_chat_log_db as db

logger = logging.getLogger(__name__)


def _safe_id(value: Any, *, fallback: str | None = None) -> str:
    text = str(value or "").strip()
    if text:
        return text[:64]
    return fallback or uuid.uuid4().hex


def extract_chat_meta(data: dict[str, Any] | None) -> dict[str, str]:
    data = data if isinstance(data, dict) else {}
    return {
        "client_session_id": _safe_id(data.get("client_session_id")),
        "client_turn_id": _safe_id(data.get("client_turn_id")),
        "tg_name": str(data.get("tg_name") or data.get("thread_group_name") or "").strip()[:64],
        "user_prompt": str(data.get("message") or "").strip(),
    }


def persist_plan_safe(
    *,
    user_id: str | None,
    meta: dict[str, str],
    done_event: dict[str, Any] | None = None,
    error_event: dict[str, Any] | None = None,
    route_mode: str = "two_pass",
) -> None:
    if not user_id:
        return
    try:
        err = None
        summary = None
        targets = None
        if error_event and error_event.get("error"):
            err = str(error_event.get("error") or "")
        if done_event:
            summary = str(done_event.get("summary") or "").strip() or None
            targets = done_event.get("targets")
        db.upsert_plan_result(
            user_id=user_id,
            client_session_id=meta["client_session_id"],
            client_turn_id=meta["client_turn_id"],
            user_prompt=meta.get("user_prompt") or "",
            route_mode=route_mode,
            tg_name=meta.get("tg_name") or "",
            plan_summary=summary,
            plan_targets=targets,
            error_text=err,
        )
    except Exception:
        logger.exception("jms ai chat log: persist plan failed")


def persist_edit_safe(
    *,
    user_id: str | None,
    meta: dict[str, str],
    done_event: dict[str, Any] | None = None,
    error_event: dict[str, Any] | None = None,
    route_mode: str = "two_pass",
) -> None:
    if not user_id:
        return
    try:
        err = None
        summary = None
        operations = None
        if error_event and error_event.get("error"):
            err = str(error_event.get("error") or "")
        if done_event:
            summary = str(done_event.get("summary") or "").strip() or None
            operations = done_event.get("operations")
        db.upsert_edit_result(
            user_id=user_id,
            client_session_id=meta["client_session_id"],
            client_turn_id=meta["client_turn_id"],
            user_prompt=meta.get("user_prompt") or "",
            route_mode=route_mode,
            tg_name=meta.get("tg_name") or "",
            edit_summary=summary,
            operations=operations,
            error_text=err,
        )
    except Exception:
        logger.exception("jms ai chat log: persist edit failed")


def persist_apply_safe(
    *,
    user_id: str | None,
    client_turn_id: str | None = None,
    turn_id: str | None = None,
    apply_result: Any = None,
) -> dict[str, Any] | None:
    if not user_id:
        return None
    try:
        return db.save_apply_result(
            user_id=user_id,
            client_turn_id=client_turn_id,
            turn_id=turn_id,
            apply_result=apply_result,
        )
    except Exception:
        logger.exception("jms ai chat log: persist apply failed")
        return None


def iter_sse_logged(
    events: Iterable[dict[str, Any]],
    *,
    user_id: str | None,
    meta: dict[str, str],
    phase: str,
    route_mode: str,
) -> Generator[str, None, None]:
    """包装事件流：原样输出 SSE；流结束后旁路落库（不存 reasoning）。"""
    import json

    last_done: dict[str, Any] | None = None
    last_error: dict[str, Any] | None = None
    try:
        for event in events:
            if isinstance(event, dict):
                et = str(event.get("type") or "")
                if et == "done":
                    last_done = event
                    last_error = None
                elif et == "error":
                    last_error = event
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'status', 'content': str(event)}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'stream_end'}, ensure_ascii=False)}\n\n"
    finally:
        if phase == "plan":
            persist_plan_safe(
                user_id=user_id,
                meta=meta,
                done_event=last_done,
                error_event=last_error,
                route_mode=route_mode,
            )
        elif phase in {"edit", "legacy"}:
            persist_edit_safe(
                user_id=user_id,
                meta=meta,
                done_event=last_done,
                error_event=last_error,
                route_mode=route_mode,
            )


def list_turns_safe(*, user_id: str, client_session_id: str | None = None, limit: int = 30, offset: int = 0):
    db.ensure_jms_ai_chat_tables()
    return db.list_turns_for_user(
        user_id=user_id,
        client_session_id=client_session_id,
        limit=limit,
        offset=offset,
    )


def get_turn_safe(*, turn_id: str, user_id: str | None = None):
    db.ensure_jms_ai_chat_tables()
    return db.get_turn(turn_id=turn_id, user_id=user_id)


def resolve_email_user_id(email: str) -> str | None:
    return db.resolve_user_id_by_email(email)


def serialize_turn(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    out = dict(row)
    for key in ("created_at", "updated_at"):
        val = out.get(key)
        if hasattr(val, "isoformat"):
            out[key] = val.isoformat(sep=" ", timespec="seconds")
    return out