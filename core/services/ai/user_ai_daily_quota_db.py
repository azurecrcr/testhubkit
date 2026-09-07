"""用户每日 AI 免费额度用量（按自然日统计，北京时间）。"""
from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from core.services.test_cases.mysql_db import get_connection

_BJ_TZ = ZoneInfo("Asia/Shanghai")

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS user_ai_daily_usage (
    user_id CHAR(32) NOT NULL,
    usage_date DATE NOT NULL,
    text_count INT NOT NULL DEFAULT 0,
    vision_count INT NOT NULL DEFAULT 0,
    cursor_count INT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (user_id, usage_date),
    INDEX idx_user_ai_daily_usage_date (usage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_KIND_COLUMN = {
    "text": "text_count",
    "vision": "vision_count",
    "cursor": "cursor_count",
}


def ensure_user_ai_daily_usage_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
        conn.commit()
    finally:
        conn.close()


def beijing_today() -> date:
    """当前北京时间自然日（额度重置边界）。"""
    return datetime.now(_BJ_TZ).date()


def _today() -> date:
    return beijing_today()


def get_usage_counts(user_id: str, usage_date: date | None = None) -> dict[str, int]:
    uid = str(user_id or "").strip()
    if not uid:
        return {"text": 0, "vision": 0, "cursor": 0}
    ensure_user_ai_daily_usage_table()
    day = usage_date or _today()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT text_count, vision_count, cursor_count
                FROM user_ai_daily_usage
                WHERE user_id = %s AND usage_date = %s
                LIMIT 1
                """,
                (uid, day),
            )
            row = cur.fetchone() or {}
        return {
            "text": int(row.get("text_count") or 0),
            "vision": int(row.get("vision_count") or 0),
            "cursor": int(row.get("cursor_count") or 0),
        }
    finally:
        conn.close()


def increment_usage(user_id: str, kind: str) -> dict[str, int]:
    uid = str(user_id or "").strip()
    col = _KIND_COLUMN.get(kind)
    if not uid or not col:
        raise ValueError("invalid quota kind")
    ensure_user_ai_daily_usage_table()
    day = _today()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_ai_daily_usage
                    (user_id, usage_date, text_count, vision_count, cursor_count, updated_at)
                VALUES (%s, %s, 0, 0, 0, NOW())
                ON DUPLICATE KEY UPDATE updated_at = NOW()
                """,
                (uid, day),
            )
            cur.execute(
                f"""
                UPDATE user_ai_daily_usage
                SET {col} = {col} + 1, updated_at = NOW()
                WHERE user_id = %s AND usage_date = %s
                """,
                (uid, day),
            )
        conn.commit()
    finally:
        conn.close()
    return get_usage_counts(uid, day)
