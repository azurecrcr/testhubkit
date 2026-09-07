"""用户每日活跃 / 最后访问埋点（失败静默，不影响主流程）。"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from core.services.test_cases.mysql_db import get_connection

_DAILY_SQL = """
CREATE TABLE IF NOT EXISTS hub_user_activity_daily (
    user_id CHAR(32) NOT NULL COMMENT '用户ID',
    active_date DATE NOT NULL COMMENT '活跃自然日',
    first_seen_at DATETIME NOT NULL COMMENT '当日首次访问',
    last_seen_at DATETIME NOT NULL COMMENT '当日最近访问',
    hit_count INT NOT NULL DEFAULT 1 COMMENT '当日写入次数（限流后）',
    client_ip VARCHAR(45) NOT NULL DEFAULT '' COMMENT '最近客户端IP',
    last_path VARCHAR(255) NOT NULL DEFAULT '' COMMENT '最近请求路径',
    PRIMARY KEY (user_id, active_date),
    INDEX idx_hub_user_activity_daily_date (active_date),
    INDEX idx_hub_user_activity_daily_last (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='用户按日活跃（登录态访问埋点）'
"""

_LAST_SEEN_SQL = """
CREATE TABLE IF NOT EXISTS hub_user_last_seen (
    user_id CHAR(32) NOT NULL PRIMARY KEY COMMENT '用户ID',
    last_seen_at DATETIME NOT NULL COMMENT '最近访问时间',
    client_ip VARCHAR(45) NOT NULL DEFAULT '' COMMENT '最近客户端IP',
    last_path VARCHAR(255) NOT NULL DEFAULT '' COMMENT '最近请求路径'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='用户最后访问时间'
"""

_table_ready = False


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _today_str() -> str:
    return time.strftime("%Y-%m-%d", time.localtime())


def ensure_user_activity_tables() -> None:
    global _table_ready
    if _table_ready:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_DAILY_SQL)
            cur.execute(_LAST_SEEN_SQL)
        _table_ready = True
    finally:
        conn.close()


def touch_user_activity(
    user_id: str,
    *,
    client_ip: str = "",
    path: str = "",
) -> None:
    """记录一次用户活跃；任何异常均吞掉。"""
    try:
        uid = (user_id or "").strip()
        if not (len(uid) == 32 and uid.isalnum()):
            return
        ensure_user_activity_tables()
        now = _now_str()
        day = _today_str()
        ip = (client_ip or "").strip()[:45]
        last_path = (path or "").strip()[:255]
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO hub_user_activity_daily
                        (user_id, active_date, first_seen_at, last_seen_at, hit_count, client_ip, last_path)
                    VALUES (%s, %s, %s, %s, 1, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        last_seen_at = VALUES(last_seen_at),
                        hit_count = hit_count + 1,
                        client_ip = VALUES(client_ip),
                        last_path = VALUES(last_path)
                    """,
                    (uid, day, now, now, ip, last_path),
                )
                cur.execute(
                    """
                    INSERT INTO hub_user_last_seen
                        (user_id, last_seen_at, client_ip, last_path)
                    VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        last_seen_at = VALUES(last_seen_at),
                        client_ip = VALUES(client_ip),
                        last_path = VALUES(last_path)
                    """,
                    (uid, now, ip, last_path),
                )
        finally:
            conn.close()
    except Exception:
        return


def list_dau_by_date(
    active_date: str,
    *,
    exclude_emails: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """按日查询活跃用户（可选排除邮箱）；失败返回空列表。"""
    try:
        ensure_user_activity_tables()
        day = (active_date or "").strip()[:10]
        if not day:
            return []
        excl = [str(e or "").strip().lower() for e in (exclude_emails or []) if str(e or "").strip()]
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                if excl:
                    placeholders = ", ".join(["%s"] * len(excl))
                    cur.execute(
                        f"""
                        SELECT d.user_id AS user_id, u.email AS email,
                               d.first_seen_at AS first_seen_at, d.last_seen_at AS last_seen_at,
                               d.hit_count AS hit_count, d.last_path AS last_path
                        FROM hub_user_activity_daily d
                        LEFT JOIN hub_users u ON u.id = d.user_id
                        WHERE d.active_date = %s
                          AND LOWER(TRIM(IFNULL(u.email, ''))) NOT IN ({placeholders})
                        ORDER BY d.last_seen_at DESC
                        """,
                        [day] + excl,
                    )
                else:
                    cur.execute(
                        """
                        SELECT d.user_id AS user_id, u.email AS email,
                               d.first_seen_at AS first_seen_at, d.last_seen_at AS last_seen_at,
                               d.hit_count AS hit_count, d.last_path AS last_path
                        FROM hub_user_activity_daily d
                        LEFT JOIN hub_users u ON u.id = d.user_id
                        WHERE d.active_date = %s
                        ORDER BY d.last_seen_at DESC
                        """,
                        (day,),
                    )
                return list(cur.fetchall() or [])
        finally:
            conn.close()
    except Exception:
        return []
