"""每用户单页面生成锁：同一时刻只允许为一个蓝湖页面生成用例。"""
from __future__ import annotations

import time
import uuid
from datetime import datetime
from typing import Any, Optional

from core.services.test_cases.mysql_db import get_connection

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS tc_user_page_generation_lock (
    id CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(32) NOT NULL,
    lanhu_pid VARCHAR(64) NOT NULL DEFAULT '',
    lanhu_doc_id VARCHAR(64) NOT NULL DEFAULT '',
    lanhu_page_id VARCHAR(64) NOT NULL DEFAULT '',
    page_name VARCHAR(512) NOT NULL DEFAULT '',
    lanhu_url VARCHAR(2048) NOT NULL DEFAULT '',
    session_id CHAR(32) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'running',
    started_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    UNIQUE KEY uk_user_page_gen_lock (user_id),
    INDEX idx_page_gen_lock_session (session_id),
    INDEX idx_page_gen_lock_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


class PageGenLockConflictError(ValueError):
    def __init__(self, message: str, *, lock: Optional[dict[str, Any]] = None):
        super().__init__(message)
        self.lock = lock or {}


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def ensure_page_generation_lock_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
        conn.commit()
    finally:
        conn.close()


def _row_to_lock(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row.get("id") or ""),
        "user_id": str(row.get("user_id") or ""),
        "lanhu_pid": str(row.get("lanhu_pid") or ""),
        "lanhu_doc_id": str(row.get("lanhu_doc_id") or ""),
        "lanhu_page_id": str(row.get("lanhu_page_id") or ""),
        "page_name": str(row.get("page_name") or ""),
        "lanhu_url": str(row.get("lanhu_url") or ""),
        "session_id": str(row.get("session_id") or "") or None,
        "status": str(row.get("status") or ""),
        "started_at": str(row.get("started_at") or ""),
        "updated_at": str(row.get("updated_at") or ""),
        "finished_at": str(row.get("finished_at") or "") or None,
    }


def get_active_page_gen_lock(user_id: str) -> Optional[dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return None
    ensure_page_generation_lock_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, user_id, lanhu_pid, lanhu_doc_id, lanhu_page_id, page_name,
                       lanhu_url, session_id, status, started_at, updated_at, finished_at
                FROM tc_user_page_generation_lock
                WHERE user_id = %s AND status = 'running'
                LIMIT 1
                """,
                (uid,),
            )
            row = cur.fetchone()
        return _row_to_lock(row) if row else None
    finally:
        conn.close()


def get_page_gen_lock_by_session(session_id: str) -> Optional[dict[str, Any]]:
    sid = str(session_id or "").strip()
    if not sid:
        return None
    ensure_page_generation_lock_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, user_id, lanhu_pid, lanhu_doc_id, lanhu_page_id, page_name,
                       lanhu_url, session_id, status, started_at, updated_at, finished_at
                FROM tc_user_page_generation_lock
                WHERE session_id = %s
                LIMIT 1
                """,
                (sid,),
            )
            row = cur.fetchone()
        return _row_to_lock(row) if row else None
    finally:
        conn.close()


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


_ACTIVE_SESSION_STATUSES = frozenset({"pending", "running"})
_UNBOUND_LOCK_GRACE_SECONDS = 90


def lock_has_live_session(user_id: str, lock: dict[str, Any]) -> bool:
    """锁是否仍对应进行中的生成 session。"""
    uid = str(user_id or "").strip()
    if not uid or not lock:
        return False
    from core.services.test_cases.generation_session_db import (
        get_session,
        list_active_generation_session_ids_for_user,
    )

    sid = str(lock.get("session_id") or "").strip()
    if sid:
        session = get_session(sid)
        return bool(session and str(session.get("status") or "") in _ACTIVE_SESSION_STATUSES)
    active_ids = list_active_generation_session_ids_for_user(uid)
    if not active_ids:
        return False
    return _lock_age_seconds(lock.get("updated_at")) < _UNBOUND_LOCK_GRACE_SECONDS


def acquire_page_gen_lock(user_id: str, context: dict[str, Any]) -> dict[str, Any]:
    uid = str(user_id or "").strip()
    if not uid:
        raise ValueError("请先登录")
    page_id = str(context.get("lanhu_page_id") or context.get("page_id") or "").strip()
    doc_id = str(context.get("lanhu_doc_id") or context.get("doc_id") or "").strip()
    if not page_id:
        raise ValueError("缺少页面 ID")
    pid = str(context.get("lanhu_pid") or "").strip()
    page_name = str(context.get("page_name") or "").strip() or page_id
    lanhu_url = str(context.get("lanhu_url") or "").strip()
    ensure_page_generation_lock_table()
    existing = get_active_page_gen_lock(uid)
    if existing:
        if not lock_has_live_session(uid, existing):
            release_active_page_gen_lock(uid)
            existing = None
    if existing:
        same_page = existing["lanhu_page_id"] == page_id
        if doc_id and existing["lanhu_doc_id"]:
            same_page = same_page and existing["lanhu_doc_id"] == doc_id
        if same_page:
            raise PageGenLockConflictError("该页面正在生成中，请等待完成", lock=existing)
        label = existing.get("page_name") or existing.get("lanhu_page_id") or "其他页面"
        raise PageGenLockConflictError(f"「{label}」正在生成用例，请等待完成后再切换页面", lock=existing)
    lock_id = uuid.uuid4().hex
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM tc_user_page_generation_lock WHERE user_id = %s", (uid,))
            cur.execute(
                """
                INSERT INTO tc_user_page_generation_lock
                (id, user_id, lanhu_pid, lanhu_doc_id, lanhu_page_id, page_name, lanhu_url,
                 session_id, status, started_at, updated_at, finished_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NULL, 'running', %s, %s, NULL)
                """,
                (lock_id, uid, pid, doc_id, page_id, page_name, lanhu_url, now, now),
            )
        conn.commit()
    finally:
        conn.close()
    lock = get_active_page_gen_lock(uid)
    if not lock:
        raise RuntimeError("创建生成锁失败")
    return lock


def bind_session_to_page_gen_lock(user_id: str, session_id: str) -> None:
    uid = str(user_id or "").strip()
    sid = str(session_id or "").strip()
    if not uid or not sid:
        return
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tc_user_page_generation_lock
                SET session_id = %s, updated_at = %s
                WHERE user_id = %s AND status = 'running'
                """,
                (sid, now, uid),
            )
        conn.commit()
    finally:
        conn.close()


def release_page_gen_lock_by_session(
    session_id: str,
    status: str,
    *,
    delete_row: bool = True,
) -> Optional[dict[str, Any]]:
    sid = str(session_id or "").strip()
    if not sid:
        return None
    terminal = status if status in ("done", "error", "cancelled") else "error"
    ensure_page_generation_lock_table()
    lock = get_page_gen_lock_by_session(sid)
    if not lock:
        return None
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if delete_row:
                cur.execute("DELETE FROM tc_user_page_generation_lock WHERE session_id = %s", (sid,))
            else:
                cur.execute(
                    """
                    UPDATE tc_user_page_generation_lock
                    SET status = %s, updated_at = %s, finished_at = %s
                    WHERE session_id = %s
                    """,
                    (terminal, now, now, sid),
                )
        conn.commit()
    finally:
        conn.close()
    lock["status"] = terminal
    lock["finished_at"] = now
    return lock


def release_active_page_gen_lock(user_id: str) -> bool:
    uid = str(user_id or "").strip()
    if not uid:
        return False
    ensure_page_generation_lock_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM tc_user_page_generation_lock WHERE user_id = %s AND status = 'running'",
                (uid,),
            )
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    finally:
        conn.close()


def release_stale_page_gen_locks(max_age_seconds: int = 900) -> int:
    ensure_page_generation_lock_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM tc_user_page_generation_lock
                WHERE status = 'running'
                  AND updated_at < DATE_SUB(NOW(), INTERVAL %s SECOND)
                """,
                (max(60, int(max_age_seconds)),),
            )
            return int(cur.rowcount or 0)
    finally:
        conn.close()
