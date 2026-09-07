"""用例工作台会话业务层。"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from core.config.user_ai_credentials import UserAiConfigRequired, resolve_text_ai_credentials
from core.services.ai.builtin_llm_service import complete_builtin_ai
from core.services.test_cases import workbench_session_db as db

_PLAN_CONTEXT_LABELS = {
    "edit": "智能编辑（表格）",
    "edit_mindmap": "智能编辑（导图）",
}
_MAX_HISTORY_PER_CONTEXT = 5
_DEFAULT_TITLE = "新会话"
_DEFAULT_TITLE_RE = re.compile(
    r"^(智能编辑（表格）|智能编辑（导图）) \d{2}-\d{2} \d{2}:\d{2}$"
)
SESSION_TITLE_SYSTEM_PROMPT = (
    "你是会话标题生成器。根据用户的第一条输入，直接输出一句极简中文标题。"
    "要求：4～16 字；只输出标题本身；禁止解释、禁止思考过程、禁止引号或标点结尾；"
    "禁止「好的」「以下是」等废话。"
)


def normalize_plan_context(value: str | None) -> str:
    return db.normalize_plan_context(value)


def default_session_title(plan_context: str = "edit") -> str:
    return _DEFAULT_TITLE


def is_default_session_title(title: str | None) -> bool:
    t = str(title or "").strip()
    if t == _DEFAULT_TITLE:
        return True
    return bool(_DEFAULT_TITLE_RE.match(t))


def sanitize_session_title(raw: str, plan_context: str = "edit") -> str:
    text = re.sub(r"\s+", " ", str(raw or "").strip())
    text = text.strip("\"'「」[]()（）:：")
    if not text:
        return _DEFAULT_TITLE
    return text[:200]


def fallback_title_from_message(message: str, plan_context: str = "edit") -> str:
    msg = re.sub(r"\s+", " ", str(message or "").strip())
    if not msg:
        return _DEFAULT_TITLE
    if len(msg) > 24:
        msg = msg[:24].rstrip() + "…"
    return msg[:200]


def sanitize_session_prefs(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    lanhu_in = raw.get("lanhu") if isinstance(raw.get("lanhu"), dict) else {}
    quality_in = raw.get("quality") if isinstance(raw.get("quality"), dict) else {}
    return {
        "lanhu": {
            "cookie": str(lanhu_in.get("cookie") or "")[:8000],
            "url": str(lanhu_in.get("url") or "")[:2000],
            "requirements_summary": str(lanhu_in.get("requirements_summary") or "")[:50000],
        },
        "quality": {
            "auto_validate": bool(quality_in.get("auto_validate")),
        },
    }


def create_session(
    *,
    user_id: str | None,
    session_key: str | None,
    title: str | None = None,
    plan_context: str = "edit",
    current_session_id: str | None = None,
    session_prefs: dict | None = None,
) -> dict[str, Any]:
    """创建新会话；若该模式已有 5 条则恢复最新一条，不自动删除旧会话。"""
    plan_context = normalize_plan_context(plan_context)
    if current_session_id:
        try:
            sess = assert_session_access(
                current_session_id,
                user_id=user_id,
                session_key=session_key,
            )
            if normalize_plan_context(sess.get("plan_context")) == plan_context:
                turn_count = int(sess.get("turn_count") or 0)
                if turn_count == 0 and not db.list_turns(current_session_id):
                    return {
                        "session": sess,
                        "turns": [],
                        "created": False,
                        "limit_reached": False,
                        "reused_empty": True,
                    }
        except LookupError:
            pass
    existing = list_history_sessions_for_context(
        user_id=user_id,
        session_key=session_key,
        plan_context=plan_context,
        limit=_MAX_HISTORY_PER_CONTEXT,
    )
    if len(existing) >= _MAX_HISTORY_PER_CONTEXT:
        latest = existing[0]
        turns = db.list_turns(latest["id"])
        return {
            "session": latest,
            "turns": turns,
            "created": False,
            "limit_reached": True,
        }
    if not current_session_id:
        draft = get_latest_new_session_draft_for_context(
            user_id=user_id,
            session_key=session_key,
            plan_context=plan_context,
        )
        if draft:
            cleanup_empty_draft_sessions(
                user_id=user_id,
                session_key=session_key,
                plan_context=plan_context,
                keep_session_id=draft["id"],
            )
            return {
                "session": draft,
                "turns": [],
                "created": False,
                "limit_reached": False,
                "reused_empty": True,
            }
    title = (title or "").strip() or default_session_title(plan_context)
    prefs = sanitize_session_prefs(session_prefs) if session_prefs else None
    doc = db.insert_session(
        user_id=user_id,
        session_key=session_key,
        title=title,
        plan_context=plan_context,
        session_prefs=prefs,
    )
    return {
        "session": doc,
        "turns": [],
        "created": True,
        "limit_reached": False,
    }


def delete_session(
    session_id: str,
    *,
    user_id: str | None,
    session_key: str | None,
) -> None:
    assert_session_access(session_id, user_id=user_id, session_key=session_key)
    if not db.delete_session(session_id):
        raise LookupError("会话不存在")


def update_session_title(
    session_id: str,
    *,
    user_id: str | None,
    session_key: str | None,
    title: str,
) -> dict[str, Any]:
    sess = assert_session_access(session_id, user_id=user_id, session_key=session_key)
    plan_context = normalize_plan_context(sess.get("plan_context"))
    clean = sanitize_session_title(title, plan_context)
    updated = db.update_session_title(session_id, clean)
    if not updated:
        raise LookupError("会话不存在")
    return updated


def update_session_prefs(
    session_id: str,
    *,
    user_id: str | None,
    session_key: str | None,
    session_prefs: dict | None,
) -> dict[str, Any]:
    assert_session_access(session_id, user_id=user_id, session_key=session_key)
    clean = sanitize_session_prefs(session_prefs or {})
    updated = db.update_session_prefs(session_id, clean)
    if not updated:
        raise LookupError("会话不存在")
    return updated


def get_latest_draft_session_for_context(
    *,
    user_id: str | None,
    session_key: str | None,
    plan_context: str,
) -> dict[str, Any] | None:
    return db.get_latest_draft_session(
        user_id=user_id,
        session_key=session_key,
        plan_context=normalize_plan_context(plan_context),
    )


def get_latest_new_session_draft_for_context(
    *,
    user_id: str | None,
    session_key: str | None,
    plan_context: str,
) -> dict[str, Any] | None:
    """返回仍为默认标题「新会话」的空草稿，供进入工作台时复用。"""
    plan_context = normalize_plan_context(plan_context)
    for sess in db.list_empty_draft_sessions(
        user_id=user_id,
        session_key=session_key,
        plan_context=plan_context,
        limit=20,
    ):
        if is_default_session_title(sess.get("title")):
            return sess
    return None


def resolve_entry_session(
    *,
    user_id: str | None,
    session_key: str | None,
    plan_context: str = "edit",
    session_prefs: dict | None = None,
) -> dict[str, Any]:
    """进入工作台时解析应激活的会话。"""
    plan_context = normalize_plan_context(plan_context)
    history = list_history_sessions_for_context(
        user_id=user_id,
        session_key=session_key,
        plan_context=plan_context,
        limit=_MAX_HISTORY_PER_CONTEXT,
    )

    if len(history) >= _MAX_HISTORY_PER_CONTEXT:
        latest = history[0]
        turns = db.list_turns(latest["id"])
        cleanup_empty_draft_sessions(
            user_id=user_id,
            session_key=session_key,
            plan_context=plan_context,
        )
        return {
            "session": latest,
            "turns": turns,
            "history_items": history,
            "created": False,
            "reused_draft": False,
            "limit_reached": True,
        }

    draft = get_latest_new_session_draft_for_context(
        user_id=user_id,
        session_key=session_key,
        plan_context=plan_context,
    )
    if draft:
        cleanup_empty_draft_sessions(
            user_id=user_id,
            session_key=session_key,
            plan_context=plan_context,
            keep_session_id=draft["id"],
        )
        return {
            "session": draft,
            "turns": [],
            "history_items": history,
            "created": False,
            "reused_draft": True,
            "limit_reached": False,
        }

    cleanup_empty_draft_sessions(
        user_id=user_id,
        session_key=session_key,
        plan_context=plan_context,
    )
    title = default_session_title(plan_context)
    prefs = sanitize_session_prefs(session_prefs) if session_prefs else None
    doc = db.insert_session(
        user_id=user_id,
        session_key=session_key,
        title=title,
        plan_context=plan_context,
        session_prefs=prefs,
    )
    return {
        "session": doc,
        "turns": [],
        "history_items": history,
        "created": True,
        "reused_draft": False,
        "limit_reached": False,
    }


def _resolve_title_ai_credentials(user_id: str | None) -> dict[str, Any] | None:
    uid = str(user_id or "").strip()
    if not uid:
        return None
    try:
        return resolve_text_ai_credentials({"use_builtin": True}, uid)
    except UserAiConfigRequired:
        return None


def generate_session_title_from_message(
    session_id: str,
    *,
    user_id: str | None,
    session_key: str | None,
    user_prompt: str,
) -> dict[str, Any]:
    sess = assert_session_access(session_id, user_id=user_id, session_key=session_key)
    plan_context = normalize_plan_context(sess.get("plan_context"))
    message = str(user_prompt or "").strip()
    if not message:
        raise ValueError("缺少用户输入")
    turns = db.list_turns(session_id)
    if len(turns) > 1:
        return {
            "session": sess,
            "title": sess.get("title") or "",
            "generated": False,
            "skipped": True,
        }
    if not is_default_session_title(sess.get("title")):
        return {
            "session": sess,
            "title": sess.get("title") or "",
            "generated": False,
            "skipped": True,
        }

    title = fallback_title_from_message(message, plan_context)
    generated = False
    cfg = _resolve_title_ai_credentials(user_id)
    if cfg:
        try:
            title_cfg = dict(cfg)
            title_cfg["temperature"] = 0.2
            ai_title = complete_builtin_ai(
                f"用户输入：{message[:800]}",
                system_prompt=SESSION_TITLE_SYSTEM_PROMPT,
                timeout=15,
                max_tokens=32,
                cfg=title_cfg,
            )
            cleaned = sanitize_session_title(ai_title, plan_context)
            if cleaned and cleaned != _DEFAULT_TITLE and not is_default_session_title(cleaned):
                title = cleaned
                generated = True
        except Exception:
            generated = False

    updated = db.update_session_title(session_id, title)
    if not updated:
        raise LookupError("会话不存在")
    return {
        "session": updated,
        "title": title,
        "generated": generated,
        "skipped": False,
    }


def list_history_sessions_for_context(
    *,
    user_id: str | None,
    session_key: str | None,
    plan_context: str,
    limit: int = _MAX_HISTORY_PER_CONTEXT,
) -> list[dict[str, Any]]:
    return db.list_sessions(
        user_id=user_id,
        session_key=session_key,
        plan_context=normalize_plan_context(plan_context),
        limit=limit,
        history_only=True,
    )


def cleanup_empty_draft_sessions(
    *,
    user_id: str | None,
    session_key: str | None,
    plan_context: str | None = None,
    keep_session_id: str | None = None,
) -> int:
    return db.cleanup_empty_draft_sessions(
        user_id=user_id,
        session_key=session_key,
        plan_context=plan_context,
        keep_session_id=keep_session_id,
    )


def list_sessions_for_context(
    *,
    user_id: str | None,
    session_key: str | None,
    plan_context: str,
    limit: int = _MAX_HISTORY_PER_CONTEXT,
) -> list[dict[str, Any]]:
    return list_history_sessions_for_context(
        user_id=user_id,
        session_key=session_key,
        plan_context=plan_context,
        limit=limit,
    )


def assert_session_access(
    session_id: str,
    *,
    user_id: str | None,
    session_key: str | None,
) -> dict[str, Any]:
    if not db.session_owned_by(session_id, user_id=user_id, session_key=session_key):
        raise LookupError("会话不存在或无权访问")
    row = db.get_session(session_id)
    if not row:
        raise LookupError("会话不存在")
    return row


def get_session_detail(
    session_id: str,
    *,
    user_id: str | None,
    session_key: str | None,
) -> dict[str, Any]:
    sess = assert_session_access(session_id, user_id=user_id, session_key=session_key)
    turns = db.list_turns(session_id)
    turns = [db.enrich_turn_for_session_read(t, session_turns=turns) for t in turns]
    return {"session": sess, "turns": turns}


def save_turn(
    session_id: str,
    *,
    user_id: str | None,
    session_key: str | None,
    turn_index: int,
    user_prompt: str = "",
    user_mode: str = "",
    chain: dict | None = None,
    agent_chain: dict | None = None,
    batch_meta: dict | None = None,
    lanhu_url: str = "",
    turn_id: str | None = None,
) -> dict[str, Any]:
    assert_session_access(session_id, user_id=user_id, session_key=session_key)
    return db.upsert_turn(
        session_id=session_id,
        turn_index=int(turn_index),
        user_prompt=user_prompt,
        user_mode=user_mode,
        chain=chain,
        agent_chain=agent_chain,
        batch_meta=batch_meta,
        lanhu_url=lanhu_url,
        turn_id=turn_id,
    )




def _sanitize_turn_validation(turn: dict) -> dict | None:
    validation = turn.get("validation")
    if not isinstance(validation, dict):
        return None
    owner = str(validation.get("owner_turn_id") or "").strip()
    turn_id = str(turn.get("id") or "").strip()
    if owner and turn_id and owner != turn_id:
        return None
    return validation


def save_turn_validation(
    turn_id: str,
    *,
    user_id: str | None,
    session_key: str | None,
    validation: dict | None,
    validate_reasoning: str = "",
    batch_meta: dict | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    turn = db.get_turn(turn_id)
    if not turn:
        raise LookupError("对话轮次不存在")
    session_id = str(session_id or "").strip() or None
    turn_session_id = str(turn.get("workbench_session_id") or "").strip()
    if session_id and turn_session_id and session_id != turn_session_id:
        session_id = turn_session_id
    assert_session_access(
        turn_session_id,
        user_id=user_id,
        session_key=session_key,
    )
    if isinstance(validation, dict):
        validation = dict(validation)
        validation["owner_turn_id"] = turn_id
    updated = db.update_turn_validation(
        turn_id,
        validation=validation,
        validate_reasoning=validate_reasoning,
        batch_meta=batch_meta,
    )
    if not updated:
        raise LookupError("对话轮次不存在")
    return updated


def get_turn_validation(
    turn_id: str,
    *,
    user_id: str | None,
    session_key: str | None,
    session_id: str | None = None,
) -> dict[str, Any]:
    turn = db.get_turn(turn_id)
    if not turn:
        raise LookupError("对话轮次不存在")
    session_id = str(session_id or "").strip() or None
    turn_session_id = str(turn.get("workbench_session_id") or "").strip()
    if session_id and turn_session_id and session_id != turn_session_id:
        session_id = turn_session_id
    assert_session_access(
        turn_session_id,
        user_id=user_id,
        session_key=session_key,
    )
    validation = _sanitize_turn_validation(turn)
    return {
        "id": turn["id"],
        "turn_index": turn["turn_index"],
        "validation": validation,
        "validate_reasoning": (turn.get("validate_reasoning") or "") if validation else "",
        "batch_meta": turn.get("batch_meta") if validation else None,
    }
