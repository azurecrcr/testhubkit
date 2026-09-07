"""协作评审：分享快照与评论业务逻辑。"""
from __future__ import annotations

import json
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from core.services.test_cases.share_db import (
    count_recent_comments_by_ip,
    ensure_share_tables,
)
from core.services.test_cases.stash_db import get_connection
from core.services.test_cases.stash_session import validate_stash_payload

SHARE_TITLE_MAX_LEN = 200
SHARE_COMMENT_MAX_LEN = 2000
SHARE_AUTHOR_NAME_MAX_LEN = 64
SHARE_RATE_LIMIT_PER_MINUTE = 5
SHARE_DEFAULT_EXPIRES_DAYS = 30
SHARE_MAX_EXPIRES_DAYS = 90
_STASH_ID_RE = re.compile(r"^[a-f0-9]{32}$")


class ShareNotFoundError(Exception):
    pass


class ShareGoneError(Exception):
    """已过期或已作废。"""


class ShareRateLimitError(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new_id() -> str:
    return uuid.uuid4().hex


def _new_token() -> str:
    return secrets.token_urlsafe(32)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat(timespec="seconds")
    return str(dt)


def _parse_dt(val: Any) -> Optional[datetime]:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(str(val).replace("Z", "+00:00")).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def _row_to_snapshot(row: dict) -> dict:
    payload = row.get("payload")
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {}
    return {
        "id": row["id"],
        "token": row["token"],
        "user_id": row["user_id"],
        "title": row["title"],
        "payload": payload if isinstance(payload, dict) else {},
        "expires_at": _iso(row.get("expires_at")),
        "comment_enabled": bool(row.get("comment_enabled")),
        "revoked_at": _iso(row.get("revoked_at")),
        "created_at": _iso(row.get("created_at")),
    }


def _validate_stash_id_optional(stash_id: Optional[str]) -> Optional[str]:
    if stash_id is None:
        return None
    sid = str(stash_id).strip()
    if not sid:
        return None
    if not _STASH_ID_RE.match(sid):
        raise ValueError("无效的暂存标识")
    return sid


def _assert_stash_owned(user_id: str, stash_id: str) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM test_case_stashes
                WHERE user_id = %s AND id = %s
                LIMIT 1
                """,
                (user_id, stash_id),
            )
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        raise ValueError("关联的暂存不存在或已删除")


def delete_shares_for_stash(user_id: str, stash_id: str) -> int:
    """删除与指定暂存关联的分享及其评论。"""
    ensure_share_tables()
    sid = _validate_stash_id_optional(stash_id)
    if not sid:
        return 0
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM tc_share_snapshots
                WHERE user_id = %s AND stash_id = %s
                """,
                (user_id, sid),
            )
            share_rows = cur.fetchall() or []
            share_ids = [r["id"] for r in share_rows if r.get("id")]
            if share_ids:
                placeholders = ",".join(["%s"] * len(share_ids))
                cur.execute(
                    f"DELETE FROM tc_share_comments WHERE share_id IN ({placeholders})",
                    tuple(share_ids),
                )
            cur.execute(
                """
                DELETE FROM tc_share_snapshots
                WHERE user_id = %s AND stash_id = %s
                """,
                (user_id, sid),
            )
            deleted = int(cur.rowcount or 0)
        conn.commit()
        return deleted
    finally:
        conn.close()


def _is_share_active(row: dict, now: Optional[datetime] = None) -> bool:
    now = now or _now()
    if row.get("revoked_at"):
        return False
    exp = _parse_dt(row.get("expires_at"))
    if exp and exp < now:
        return False
    return True


def create_share(
    user_id: str,
    *,
    title: str,
    payload: dict,
    stash_id: Optional[str] = None,
    expires_days: Optional[int] = None,
    comment_enabled: bool = True,
) -> dict:
    ensure_share_tables()
    title = (title or "").strip()
    if not title:
        raise ValueError("请填写分享标题")
    if len(title) > SHARE_TITLE_MAX_LEN:
        raise ValueError(f"标题不能超过 {SHARE_TITLE_MAX_LEN} 字")
    ok, err = validate_stash_payload(payload)
    if not ok:
        raise ValueError(err or "无效的表格数据")

    sid = _validate_stash_id_optional(stash_id)
    if not sid:
        raise ValueError("请指定关联的暂存")
    _assert_stash_owned(user_id, sid)

    days = SHARE_DEFAULT_EXPIRES_DAYS
    if expires_days is not None:
        try:
            days = max(1, min(int(expires_days), SHARE_MAX_EXPIRES_DAYS))
        except (TypeError, ValueError):
            days = SHARE_DEFAULT_EXPIRES_DAYS

    share_id = _new_id()
    token = _new_token()
    now = _now()
    expires_at = now + timedelta(days=days)
    payload_json = json.dumps(payload, ensure_ascii=False)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_share_snapshots
                    (id, token, user_id, stash_id, title, payload, expires_at,
                     comment_enabled, revoked_at, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, %s)
                """,
                (
                    share_id,
                    token,
                    user_id,
                    sid,
                    title,
                    payload_json,
                    expires_at,
                    1 if comment_enabled else 0,
                    now,
                ),
            )
        conn.commit()
    finally:
        conn.close()

    return {
        "id": share_id,
        "token": token,
        "stash_id": sid,
        "title": title,
        "expires_at": _iso(expires_at),
        "comment_enabled": bool(comment_enabled),
        "created_at": _iso(now),
    }


def list_user_shares(user_id: str) -> list[dict]:
    ensure_share_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT s.id, s.token, s.title, s.expires_at, s.comment_enabled,
                       s.revoked_at, s.created_at,
                       (SELECT COUNT(*) FROM tc_share_comments c WHERE c.share_id = s.id) AS comment_count
                FROM tc_share_snapshots s
                WHERE s.user_id = %s
                ORDER BY s.created_at DESC
                LIMIT 100
                """,
                (user_id,),
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()

    now = _now()
    items = []
    for row in rows:
        active = _is_share_active(row, now)
        items.append(
            {
                "id": row["id"],
                "token": row["token"],
                "title": row["title"],
                "expires_at": _iso(row.get("expires_at")),
                "comment_enabled": bool(row.get("comment_enabled")),
                "revoked": bool(row.get("revoked_at")),
                "expired": not active and not row.get("revoked_at"),
                "active": active,
                "comment_count": int(row.get("comment_count") or 0),
                "created_at": _iso(row.get("created_at")),
            }
        )
    return items


def revoke_share(user_id: str, share_id: str) -> bool:
    ensure_share_tables()
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tc_share_snapshots
                SET revoked_at = %s
                WHERE id = %s AND user_id = %s AND revoked_at IS NULL
                """,
                (now, share_id, user_id),
            )
            updated = int(cur.rowcount or 0) > 0
        conn.commit()
        return updated
    finally:
        conn.close()


def _load_share_by_token(token: str) -> dict:
    ensure_share_tables()
    token = (token or "").strip()
    if not token or len(token) > 64:
        raise ShareNotFoundError("分享不存在")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, token, user_id, title, payload, expires_at,
                       comment_enabled, revoked_at, created_at
                FROM tc_share_snapshots
                WHERE token = %s
                LIMIT 1
                """,
                (token,),
            )
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        raise ShareNotFoundError("分享不存在")
    if not _is_share_active(row):
        raise ShareGoneError("链接已过期或已作废")
    return row


def get_public_snapshot(token: str) -> dict:
    row = _load_share_by_token(token)
    snap = _row_to_snapshot(row)
    payload = snap.get("payload") or {}
    payload = payload if isinstance(payload, dict) else {}
    template_id = str(payload.get("template_id") or "").strip()
    template_name = str(payload.get("template_name") or "").strip()
    return {
        "title": snap["title"],
        "columns": payload.get("columns") or [],
        "rows": payload.get("rows") or [],
        "template_id": template_id,
        "template_name": template_name,
        "comment_enabled": snap["comment_enabled"],
        "expires_at": snap["expires_at"],
        "created_at": snap["created_at"],
    }


def _load_share_owned(user_id: str, share_id: str) -> dict:
    ensure_share_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, token, user_id, title, payload, expires_at,
                       comment_enabled, revoked_at, created_at
                FROM tc_share_snapshots
                WHERE id = %s AND user_id = %s
                LIMIT 1
                """,
                (share_id, user_id),
            )
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        raise ShareNotFoundError("分享不存在")
    return row


def list_comments_public(token: str) -> list[dict]:
    row = _load_share_by_token(token)
    return _list_comments_for_share(row["id"])


def list_comments_owned(user_id: str, share_id: str) -> list[dict]:
    row = _load_share_owned(user_id, share_id)
    return _list_comments_for_share(row["id"])


def get_owned_share_comments_context(user_id: str, share_id: str) -> dict:
    """评论列表 + 分享快照表头/行，供作者侧按用例名称展示行标签。"""
    row = _load_share_owned(user_id, share_id)
    snap = _row_to_snapshot(row)
    payload = snap.get("payload") or {}
    columns = payload.get("columns")
    rows = payload.get("rows")
    return {
        "comments": _list_comments_for_share(row["id"]),
        "columns": columns if isinstance(columns, list) else [],
        "rows": rows if isinstance(rows, list) else [],
    }


def _list_comments_for_share(share_id: str) -> list[dict]:
    ensure_share_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, share_id, row_index, author_name, user_id, content, created_at
                FROM tc_share_comments
                WHERE share_id = %s
                ORDER BY created_at ASC
                LIMIT 500
                """,
                (share_id,),
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()
    return [
        {
            "id": r["id"],
            "row_index": r["row_index"],
            "author_name": r["author_name"],
            "content": r["content"],
            "created_at": _iso(r.get("created_at")),
        }
        for r in rows
    ]


def add_comment(
    token: str,
    *,
    author_name: str,
    content: str,
    row_index: Optional[int] = None,
    user_id: Optional[str] = None,
    client_ip: str = "",
) -> dict:
    row = _load_share_by_token(token)
    if not row.get("comment_enabled"):
        raise ValueError("该分享未开放评论")

    name = (author_name or "").strip()
    if not name:
        raise ValueError("请填写昵称")
    if len(name) > SHARE_AUTHOR_NAME_MAX_LEN:
        raise ValueError(f"昵称不能超过 {SHARE_AUTHOR_NAME_MAX_LEN} 字")

    text = (content or "").strip()
    if not text:
        raise ValueError("请填写评论内容")
    if len(text) > SHARE_COMMENT_MAX_LEN:
        raise ValueError(f"评论不能超过 {SHARE_COMMENT_MAX_LEN} 字")

    if row_index is not None:
        try:
            row_index = int(row_index)
        except (TypeError, ValueError):
            raise ValueError("无效的行号")
        if row_index < 0:
            raise ValueError("无效的行号")

    ip_val = (client_ip or "unknown").strip()[:45] or "unknown"
    since = _now() - timedelta(minutes=1)
    recent = count_recent_comments_by_ip(row["id"], ip_val, since)
    if recent >= SHARE_RATE_LIMIT_PER_MINUTE:
        raise ShareRateLimitError(
            f"提交过于频繁，每分钟最多 {SHARE_RATE_LIMIT_PER_MINUTE} 条评论，请稍后再试"
        )

    comment_id = _new_id()
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_share_comments
                    (id, share_id, row_index, author_name, user_id, content, client_ip, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    comment_id,
                    row["id"],
                    row_index,
                    name,
                    user_id,
                    text,
                    ip_val,
                    now,
                ),
            )
        conn.commit()
    finally:
        conn.close()

    return {
        "id": comment_id,
        "row_index": row_index,
        "author_name": name,
        "content": text,
        "created_at": _iso(now),
    }
