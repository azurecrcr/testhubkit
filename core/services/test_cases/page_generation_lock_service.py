"""页面生成锁业务层。"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from core.services.test_cases.lanhu_requirement_service import _parse_lanhu_url
from core.services.test_cases.page_generation_lock_db import (
    PageGenLockConflictError,
    acquire_page_gen_lock,
    bind_session_to_page_gen_lock,
    get_active_page_gen_lock,
    lock_has_live_session,
    release_active_page_gen_lock,
    release_page_gen_lock_by_session,
    release_stale_page_gen_locks,
)

_ACTIVE_SESSION_STATUSES = frozenset({"pending", "running"})
_UNBOUND_LOCK_GRACE_SECONDS = 90


def normalize_page_gen_context(raw: dict[str, Any]) -> dict[str, Any]:
    url = str(raw.get("lanhu_url") or raw.get("url") or "").strip()
    page_id = str(raw.get("lanhu_page_id") or raw.get("page_id") or "").strip()
    doc_id = str(raw.get("lanhu_doc_id") or raw.get("doc_id") or "").strip()
    pid = str(raw.get("lanhu_pid") or raw.get("pid") or "").strip()
    if url:
        try:
            params = _parse_lanhu_url(url)
            pid = pid or str(params.get("project_id") or "")
            doc_id = doc_id or str(params.get("doc_id") or "")
            if not page_id:
                page_id = str(params.get("page_id") or "").strip()
        except ValueError:
            pass
    return {
        "lanhu_pid": pid,
        "lanhu_doc_id": doc_id,
        "lanhu_page_id": page_id,
        "page_name": str(raw.get("page_name") or "").strip(),
        "lanhu_url": url,
    }


def try_acquire_page_gen_lock(user_id: str, raw_context: dict[str, Any]) -> dict[str, Any]:
    reconcile_user_page_gen_lock(user_id)
    ctx = normalize_page_gen_context(raw_context)
    if not ctx["lanhu_page_id"]:
        raise ValueError("缺少页面 ID，无法开始生成")
    existing = get_active_page_gen_lock(user_id)
    if existing and not lock_has_live_session(user_id, existing):
        release_active_page_gen_lock(user_id)
    return acquire_page_gen_lock(user_id, ctx)


def link_generation_session_to_lock(user_id: str, session_id: str) -> None:
    bind_session_to_page_gen_lock(user_id, session_id)


def finish_page_gen_lock_for_session(session_id: str, status: str) -> Optional[dict[str, Any]]:
    lock = release_page_gen_lock_by_session(session_id, status, delete_row=True)
    if not lock:
        sid = str(session_id or "").strip()
        if sid:
            from core.services.test_cases.generation_session_db import get_session

            session = get_session(sid) or {}
            uid = str(session.get("user_id") or "").strip()
            if uid:
                active = get_active_page_gen_lock(uid)
                bound_sid = str((active or {}).get("session_id") or "").strip()
                if active and (not bound_sid or bound_sid == sid):
                    release_active_page_gen_lock(uid)
        return None
    # 覆盖/追加生成中断或失败时不清理需求页历史用例（落库仅在生成完成后由前端触发）
    return lock


def _lock_age_seconds(updated_at: Any) -> float:
    if not updated_at:
        return 999999.0
    try:
        if isinstance(updated_at, datetime):
            dt = updated_at
        else:
            dt = datetime.strptime(str(updated_at)[:19], "%Y-%m-%d %H:%M:%S")
        return max(0.0, (datetime.now() - dt).total_seconds())
    except (TypeError, ValueError):
        return 999999.0


def reconcile_user_page_gen_lock(user_id: str) -> bool:
    """清理无对应进行中 session 的孤儿页面锁。"""
    uid = str(user_id or "").strip()
    if not uid:
        return False
    lock = get_active_page_gen_lock(uid)
    if not lock:
        return False

    from core.services.test_cases.generation_session_db import (
        get_session,
        list_active_generation_session_ids_for_user,
    )

    sid = str(lock.get("session_id") or "").strip()
    if sid:
        session = get_session(sid)
        if session and str(session.get("status") or "") in _ACTIVE_SESSION_STATUSES:
            return False
        release_page_gen_lock_by_session(sid, "error", delete_row=True)
        if get_active_page_gen_lock(uid):
            release_active_page_gen_lock(uid)
        return True

    active_ids = list_active_generation_session_ids_for_user(uid)
    if active_ids and _lock_age_seconds(lock.get("updated_at")) < _UNBOUND_LOCK_GRACE_SECONDS:
        return False

    return release_active_page_gen_lock(uid)


def get_user_page_gen_lock(user_id: str) -> Optional[dict[str, Any]]:
    release_stale_page_gen_locks(max_age_seconds=600)
    reconcile_user_page_gen_lock(user_id)
    return get_active_page_gen_lock(user_id)
