"""用例管理站内消息（邀请确认等）。"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Optional

from core.services.test_cases.mysql_db import get_connection

_MESSAGES_READY = False

# 每位用户站内消息保留上限（超出后删除最旧记录）
MAX_MESSAGES_PER_USER = 99

_MESSAGES_SQL = (
    "CREATE TABLE IF NOT EXISTS cm_user_messages ("
    " id CHAR(32) NOT NULL PRIMARY KEY,"
    " user_id CHAR(32) NOT NULL,"
    " msg_type VARCHAR(32) NOT NULL,"
    " title VARCHAR(200) NOT NULL,"
    " body VARCHAR(1000) NOT NULL DEFAULT '',"
    " ref_type VARCHAR(32) NULL,"
    " ref_id CHAR(32) NULL,"
    " status VARCHAR(16) NOT NULL DEFAULT 'unread',"
    " payload_json LONGTEXT NULL,"
    " created_at DATETIME NOT NULL,"
    " read_at DATETIME NULL,"
    " acted_at DATETIME NULL,"
    " deleted_at DATETIME NULL,"
    " INDEX idx_cm_msg_user_status_time (user_id, status, created_at),"
    " INDEX idx_cm_msg_ref (ref_type, ref_id),"
    " INDEX idx_cm_msg_user_deleted (user_id, deleted_at)"
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
)


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _new_id() -> str:
    return uuid.uuid4().hex


def ensure_message_tables(cur=None) -> None:
    global _MESSAGES_READY
    if _MESSAGES_READY and cur is None:
        return
    if cur is not None:
        cur.execute(_MESSAGES_SQL)
        _ensure_deleted_at_column(cur)
        return
    conn = get_connection()
    try:
        with conn.cursor() as c:
            c.execute(_MESSAGES_SQL)
            _ensure_deleted_at_column(c)
        _MESSAGES_READY = True
    finally:
        conn.close()


def _ensure_deleted_at_column(cur) -> None:
    """存量表补齐软删除字段（幂等）。"""
    try:
        cur.execute("SHOW COLUMNS FROM cm_user_messages LIKE 'deleted_at'")
        if cur.fetchone():
            return
        cur.execute(
            "ALTER TABLE cm_user_messages "
            "ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL, "
            "ADD INDEX idx_cm_msg_user_deleted (user_id, deleted_at)"
        )
    except Exception:  # noqa: BLE001
        pass


def _trim_user_messages_cap(cur, user_id: str, *, keep: int = MAX_MESSAGES_PER_USER) -> int:
    """将用户未删除消息裁剪到 keep 条（软删除最旧）。返回处理条数。"""
    uid = str(user_id or "").strip()
    limit = max(1, int(keep or MAX_MESSAGES_PER_USER))
    if not uid:
        return 0
    cur.execute(
        "SELECT COUNT(*) AS c FROM cm_user_messages "
        "WHERE user_id = %s AND deleted_at IS NULL",
        (uid,),
    )
    total = int((cur.fetchone() or {}).get("c") or 0)
    overflow = total - limit
    if overflow <= 0:
        return 0
    now = _now()
    cur.execute(
        "UPDATE cm_user_messages SET deleted_at = %s "
        "WHERE user_id = %s AND deleted_at IS NULL AND id IN ("
        "  SELECT id FROM ("
        "    SELECT id FROM cm_user_messages "
        "    WHERE user_id = %s AND deleted_at IS NULL "
        "    ORDER BY created_at ASC, id ASC LIMIT %s"
        "  ) AS old_msgs"
        ")",
        (now, uid, uid, overflow),
    )
    return int(cur.rowcount or 0)


def create_message(
    *,
    user_id: str,
    msg_type: str,
    title: str,
    body: str = "",
    ref_type: str | None = None,
    ref_id: str | None = None,
    payload: dict[str, Any] | None = None,
    conn=None,
) -> dict[str, Any]:
    uid = str(user_id or "").strip()
    if not uid:
        raise ValueError("缺少收件人")
    ensure_message_tables()
    mid = _new_id()
    now = _now()
    payload_json = json.dumps(payload or {}, ensure_ascii=False)
    own = conn is None
    if own:
        conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO cm_user_messages "
                "(id, user_id, msg_type, title, body, ref_type, ref_id, status, "
                "payload_json, created_at, read_at, acted_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,'unread',%s,%s,NULL,NULL)",
                (
                    mid,
                    uid,
                    str(msg_type or "").strip()[:32],
                    str(title or "").strip()[:200],
                    str(body or "").strip()[:1000],
                    (str(ref_type).strip()[:32] if ref_type else None),
                    (str(ref_id).strip()[:32] if ref_id else None),
                    payload_json,
                    now,
                ),
            )
            _trim_user_messages_cap(cur, uid, keep=MAX_MESSAGES_PER_USER)
        return {
            "id": mid,
            "user_id": uid,
            "msg_type": msg_type,
            "title": title,
            "body": body,
            "ref_type": ref_type,
            "ref_id": ref_id,
            "status": "unread",
            "payload": payload or {},
            "created_at": now,
        }
    finally:
        if own:
            conn.close()


def mark_messages_acted_by_ref(
    *,
    ref_type: str,
    ref_id: str,
    user_id: str | None = None,
    conn=None,
) -> int:
    """将关联消息标为已处理。"""
    ensure_message_tables()
    now = _now()
    own = conn is None
    if own:
        conn = get_connection()
    try:
        with conn.cursor() as cur:
            if user_id:
                cur.execute(
                    "UPDATE cm_user_messages "
                    "SET status = 'acted', acted_at = %s, "
                    "read_at = COALESCE(read_at, %s) "
                    "WHERE ref_type = %s AND ref_id = %s AND user_id = %s "
                    "AND status IN ('unread','read')",
                    (now, now, ref_type, ref_id, user_id),
                )
            else:
                cur.execute(
                    "UPDATE cm_user_messages "
                    "SET status = 'acted', acted_at = %s, "
                    "read_at = COALESCE(read_at, %s) "
                    "WHERE ref_type = %s AND ref_id = %s "
                    "AND status IN ('unread','read')",
                    (now, now, ref_type, ref_id),
                )
            return int(cur.rowcount or 0)
    finally:
        if own:
            conn.close()


def mark_message_read(user_id: str, message_id: str) -> dict[str, Any]:
    uid = str(user_id or "").strip()
    mid = str(message_id or "").strip()
    if not uid or not mid:
        raise ValueError("参数不完整")
    ensure_message_tables()
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cm_user_messages SET status = 'read', read_at = %s "
                "WHERE id = %s AND user_id = %s AND status = 'unread' AND deleted_at IS NULL",
                (now, mid, uid),
            )
            cur.execute(
                "SELECT * FROM cm_user_messages WHERE id = %s AND user_id = %s "
                "AND deleted_at IS NULL LIMIT 1",
                (mid, uid),
            )
            row = cur.fetchone()
        if not row:
            raise ValueError("消息不存在")
        return _serialize(row)
    finally:
        conn.close()


def mark_all_messages_read(user_id: str) -> dict[str, Any]:
    uid = str(user_id or "").strip()
    if not uid:
        raise ValueError("参数不完整")
    ensure_message_tables()
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cm_user_messages SET status = 'read', read_at = %s "
                "WHERE user_id = %s AND status = 'unread' AND deleted_at IS NULL",
                (now, uid),
            )
            updated = int(cur.rowcount or 0)
        return {"updated": updated, "unread_count": 0}
    finally:
        conn.close()


def list_messages(
    user_id: str,
    *,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    """原列表接口（行为不变）。Inbox 分页/未读筛选请用 list_messages_inbox。"""
    return list_messages_inbox(
        user_id, page=page, page_size=page_size, status=None
    )


def list_messages_inbox(
    user_id: str,
    *,
    page: int = 1,
    page_size: int = 15,
    status: str | None = None,
) -> dict[str, Any]:
    """Inbox 专用列表：支持分页与 status=unread 筛选（不影响其它调用方语义）。"""
    uid = str(user_id or "").strip()
    if not uid:
        return {
            "items": [],
            "total": 0,
            "page": 1,
            "page_size": page_size,
            "unread_count": 0,
            "page_count": 0,
        }
    ensure_message_tables()
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 15), 50))
    st = str(status or "").strip().lower()
    status_filter = st if st in ("unread", "read", "acted") else ""
    offset = (page - 1) * page_size
    where = "user_id = %s AND deleted_at IS NULL"
    params: list[Any] = [uid]
    if status_filter:
        where += " AND status = %s"
        params.append(status_filter)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_user_messages WHERE " + where,
                tuple(params),
            )
            total = int((cur.fetchone() or {}).get("c") or 0)
            page_count = (total + page_size - 1) // page_size if total else 0
            if page_count and page > page_count:
                page = page_count
                offset = (page - 1) * page_size
            cur.execute(
                "SELECT * FROM cm_user_messages WHERE "
                + where
                + " ORDER BY created_at DESC LIMIT %s OFFSET %s",
                tuple(params + [page_size, offset]),
            )
            rows = cur.fetchall() or []
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_user_messages "
                "WHERE user_id = %s AND status = 'unread' AND deleted_at IS NULL",
                (uid,),
            )
            unread = int((cur.fetchone() or {}).get("c") or 0)
        return {
            "items": [_serialize(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "page_count": page_count,
            "unread_count": unread,
        }
    finally:
        conn.close()


def get_message(user_id: str, message_id: str) -> Optional[dict[str, Any]]:
    uid = str(user_id or "").strip()
    mid = str(message_id or "").strip()
    if not uid or not mid:
        return None
    ensure_message_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM cm_user_messages WHERE id = %s AND user_id = %s "
                "AND deleted_at IS NULL LIMIT 1",
                (mid, uid),
            )
            row = cur.fetchone()
        return _serialize(row) if row else None
    finally:
        conn.close()


def _serialize(row: dict[str, Any]) -> dict[str, Any]:
    payload = {}
    raw = row.get("payload_json")
    if raw:
        try:
            payload = json.loads(raw) if isinstance(raw, str) else (raw or {})
        except Exception:  # noqa: BLE001
            payload = {}
    return {
        "id": str(row.get("id") or ""),
        "user_id": str(row.get("user_id") or ""),
        "msg_type": str(row.get("msg_type") or ""),
        "title": str(row.get("title") or ""),
        "body": str(row.get("body") or ""),
        "ref_type": str(row.get("ref_type") or "") or None,
        "ref_id": str(row.get("ref_id") or "") or None,
        "status": str(row.get("status") or "unread"),
        "payload": payload if isinstance(payload, dict) else {},
        "created_at": str(row.get("created_at") or ""),
        "read_at": str(row.get("read_at") or "") or None,
        "acted_at": str(row.get("acted_at") or "") or None,
        "deleted_at": str(row.get("deleted_at") or "") or None,
    }


def soft_delete_messages_inbox(
    user_id: str,
    *,
    message_ids: list[str] | None = None,
    delete_all: bool = False,
    status: str | None = None,
) -> dict[str, Any]:
    """
    Inbox 软删除（新方法）：写入 deleted_at，不物理删除。
    - message_ids：按 id 批量
    - delete_all：删除当前用户全部可见消息（可配合 status=unread）
    """
    uid = str(user_id or "").strip()
    if not uid:
        raise ValueError("参数不完整")
    ensure_message_tables()
    now = _now()
    st = str(status or "").strip().lower()
    status_filter = st if st in ("unread", "read", "acted") else ""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if delete_all:
                where = "user_id = %s AND deleted_at IS NULL"
                params: list[Any] = [uid]
                if status_filter:
                    where += " AND status = %s"
                    params.append(status_filter)
                cur.execute(
                    "UPDATE cm_user_messages SET deleted_at = %s WHERE " + where,
                    tuple([now] + params),
                )
                updated = int(cur.rowcount or 0)
            else:
                ids = [
                    str(x).strip()
                    for x in (message_ids or [])
                    if str(x or "").strip()
                ]
                if not ids:
                    return {"updated": 0, "unread_count": 0}
                # 安全上限，避免异常超大请求
                ids = ids[:200]
                placeholders = ",".join(["%s"] * len(ids))
                cur.execute(
                    "UPDATE cm_user_messages SET deleted_at = %s "
                    "WHERE user_id = %s AND deleted_at IS NULL "
                    "AND id IN (" + placeholders + ")",
                    tuple([now, uid] + ids),
                )
                updated = int(cur.rowcount or 0)
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_user_messages "
                "WHERE user_id = %s AND status = 'unread' AND deleted_at IS NULL",
                (uid,),
            )
            unread = int((cur.fetchone() or {}).get("c") or 0)
        return {"updated": updated, "unread_count": unread}
    finally:
        conn.close()
