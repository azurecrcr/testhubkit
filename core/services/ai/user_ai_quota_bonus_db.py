"""用户 AI 每日增额授予表（独立新表，不影响 user_ai_daily_usage）。"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from core.services.test_cases.mysql_db import get_connection

_BJ_TZ = ZoneInfo("Asia/Shanghai")

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS user_ai_quota_bonus_grant (
    id CHAR(32) NOT NULL,
    user_id CHAR(32) NOT NULL,
    bonus_text INT NOT NULL DEFAULT 0,
    bonus_vision INT NOT NULL DEFAULT 0,
    bonus_cursor INT NOT NULL DEFAULT 0,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    note VARCHAR(500) NOT NULL DEFAULT '',
    created_by CHAR(32) NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    revoked_by CHAR(32) NULL,
    PRIMARY KEY (id),
    INDEX idx_quota_bonus_user_status_dates (user_id, status, start_date, end_date),
    INDEX idx_quota_bonus_end_status (end_date, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def ensure_bonus_grant_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
        conn.commit()
    finally:
        conn.close()


def beijing_today() -> date:
    return datetime.now(_BJ_TZ).date()


def _row_to_dict(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    out = dict(row)
    for key in ("start_date", "end_date"):
        val = out.get(key)
        if hasattr(val, "isoformat"):
            out[key] = val.isoformat()
    for key in ("created_at", "updated_at", "revoked_at"):
        val = out.get(key)
        if hasattr(val, "isoformat"):
            out[key] = val.isoformat(sep=" ", timespec="seconds")
    for key in ("bonus_text", "bonus_vision", "bonus_cursor"):
        out[key] = int(out.get(key) or 0)
    return out


def insert_grant(row: dict[str, Any]) -> dict[str, Any]:
    ensure_bonus_grant_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_ai_quota_bonus_grant (
                    id, user_id, bonus_text, bonus_vision, bonus_cursor,
                    start_date, end_date, status, note, created_by,
                    created_at, updated_at, revoked_at, revoked_by
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    NOW(), NOW(), NULL, NULL
                )
                """,
                (
                    row["id"],
                    row["user_id"],
                    int(row.get("bonus_text") or 0),
                    int(row.get("bonus_vision") or 0),
                    int(row.get("bonus_cursor") or 0),
                    row["start_date"],
                    row["end_date"],
                    str(row.get("status") or "active"),
                    str(row.get("note") or "")[:500],
                    row.get("created_by"),
                ),
            )
        conn.commit()
    finally:
        conn.close()
    got = get_grant(str(row["id"]))
    if not got:
        raise RuntimeError("grant insert failed")
    return got


def get_grant(grant_id: str) -> dict[str, Any] | None:
    gid = str(grant_id or "").strip()
    if not gid:
        return None
    ensure_bonus_grant_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM user_ai_quota_bonus_grant WHERE id = %s LIMIT 1",
                (gid,),
            )
            return _row_to_dict(cur.fetchone())
    finally:
        conn.close()


def mark_revoked(grant_id: str, revoked_by: str | None) -> dict[str, Any] | None:
    gid = str(grant_id or "").strip()
    if not gid:
        return None
    ensure_bonus_grant_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE user_ai_quota_bonus_grant
                SET status = 'revoked',
                    revoked_at = NOW(),
                    revoked_by = %s,
                    updated_at = NOW()
                WHERE id = %s AND status = 'active'
                """,
                (str(revoked_by or "").strip() or None, gid),
            )
        conn.commit()
    finally:
        conn.close()
    return get_grant(gid)


def sum_active_bonuses(user_id: str, day: date | None = None) -> dict[str, int]:
    """汇总某日仍生效的增额（status=active 且日期含当日）。"""
    uid = str(user_id or "").strip()
    empty = {"text": 0, "vision": 0, "cursor": 0}
    if not uid:
        return empty
    ensure_bonus_grant_table()
    usage_day = day or beijing_today()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(bonus_text), 0) AS bonus_text,
                    COALESCE(SUM(bonus_vision), 0) AS bonus_vision,
                    COALESCE(SUM(bonus_cursor), 0) AS bonus_cursor
                FROM user_ai_quota_bonus_grant
                WHERE user_id = %s
                  AND status = 'active'
                  AND start_date <= %s
                  AND end_date >= %s
                """,
                (uid, usage_day, usage_day),
            )
            row = cur.fetchone() or {}
        return {
            "text": int(row.get("bonus_text") or 0),
            "vision": int(row.get("bonus_vision") or 0),
            "cursor": int(row.get("bonus_cursor") or 0),
        }
    finally:
        conn.close()


def list_active_grants_for_user(user_id: str, day: date | None = None) -> list[dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return []
    ensure_bonus_grant_table()
    usage_day = day or beijing_today()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM user_ai_quota_bonus_grant
                WHERE user_id = %s
                  AND status = 'active'
                  AND start_date <= %s
                  AND end_date >= %s
                ORDER BY end_date ASC, created_at ASC
                """,
                (uid, usage_day, usage_day),
            )
            rows = cur.fetchall() or []
        return [_row_to_dict(r) for r in rows if r]
    finally:
        conn.close()


def list_grants_for_user(user_id: str, *, include_revoked: bool = True) -> list[dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return []
    ensure_bonus_grant_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if include_revoked:
                cur.execute(
                    """
                    SELECT * FROM user_ai_quota_bonus_grant
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                    """,
                    (uid,),
                )
            else:
                cur.execute(
                    """
                    SELECT * FROM user_ai_quota_bonus_grant
                    WHERE user_id = %s AND status = 'active'
                    ORDER BY created_at DESC
                    """,
                    (uid,),
                )
            rows = cur.fetchall() or []
        return [_row_to_dict(r) for r in rows if r]
    finally:
        conn.close()


def list_grants_admin(
    *,
    user_id: str | None = None,
    status: str = "all",
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    ensure_bonus_grant_table()
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 20)))
    offset = (page - 1) * page_size
    uid = str(user_id or "").strip() or None
    st = str(status or "all").strip().lower()
    where = ["1=1"]
    params: list[Any] = []
    if uid:
        where.append("user_id = %s")
        params.append(uid)
    if st in {"active", "revoked"}:
        where.append("status = %s")
        params.append(st)
    where_sql = " AND ".join(where)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COUNT(*) AS cnt FROM user_ai_quota_bonus_grant WHERE {where_sql}",
                tuple(params),
            )
            total = int((cur.fetchone() or {}).get("cnt") or 0)
            cur.execute(
                f"""
                SELECT * FROM user_ai_quota_bonus_grant
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                tuple(params + [page_size, offset]),
            )
            rows = cur.fetchall() or []
        items = [_row_to_dict(r) for r in rows if r]
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    finally:
        conn.close()


def max_active_bonus_end_date(user_id: str, day: date | None = None) -> str | None:
    """今日生效授予中最晚的 end_date，供用户侧展示。"""
    uid = str(user_id or "").strip()
    if not uid:
        return None
    ensure_bonus_grant_table()
    usage_day = day or beijing_today()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT MAX(end_date) AS max_end
                FROM user_ai_quota_bonus_grant
                WHERE user_id = %s
                  AND status = 'active'
                  AND start_date <= %s
                  AND end_date >= %s
                """,
                (uid, usage_day, usage_day),
            )
            row = cur.fetchone() or {}
        val = row.get("max_end")
        if hasattr(val, "isoformat"):
            return val.isoformat()
        return str(val) if val else None
    finally:
        conn.close()
