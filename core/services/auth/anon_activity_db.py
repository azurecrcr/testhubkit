"""匿名访客按日 UV 埋点（cookie visitor_id；失败静默）。"""
from __future__ import annotations

import time
from typing import Any, Dict, List

from core.services.test_cases.mysql_db import get_connection

_DAILY_SQL = """
CREATE TABLE IF NOT EXISTS hub_anon_uv_daily (
    visitor_id CHAR(32) NOT NULL COMMENT '匿名访客ID（cookie）',
    active_date DATE NOT NULL COMMENT '活跃自然日',
    first_seen_at DATETIME NOT NULL COMMENT '当日首次访问',
    last_seen_at DATETIME NOT NULL COMMENT '当日最近访问',
    hit_count INT NOT NULL DEFAULT 1 COMMENT '当日写入次数（限流后）',
    client_ip VARCHAR(45) NOT NULL DEFAULT '' COMMENT '最近客户端IP（仅辅助，不参与去重）',
    last_path VARCHAR(255) NOT NULL DEFAULT '' COMMENT '最近请求路径',
    PRIMARY KEY (visitor_id, active_date),
    INDEX idx_hub_anon_uv_daily_date (active_date),
    INDEX idx_hub_anon_uv_daily_last (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='匿名访客按日UV（cookie去重，非IP）'
"""

_table_ready = False


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _today_str() -> str:
    return time.strftime("%Y-%m-%d", time.localtime())


def ensure_anon_activity_tables() -> None:
    global _table_ready
    if _table_ready:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_DAILY_SQL)
        _table_ready = True
    finally:
        conn.close()


def touch_anon_activity(
    visitor_id: str,
    *,
    client_ip: str = "",
    path: str = "",
) -> None:
    """记录一次匿名访客活跃；任何异常均吞掉。"""
    try:
        vid = (visitor_id or "").strip().lower()
        if not (len(vid) == 32 and all(c in "0123456789abcdef" for c in vid)):
            return
        ensure_anon_activity_tables()
        now = _now_str()
        day = _today_str()
        ip = (client_ip or "").strip()[:45]
        last_path = (path or "").strip()[:255]
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO hub_anon_uv_daily
                        (visitor_id, active_date, first_seen_at, last_seen_at, hit_count, client_ip, last_path)
                    VALUES (%s, %s, %s, %s, 1, %s, %s)
                    ON DUPLICATE KEY UPDATE
                        last_seen_at = VALUES(last_seen_at),
                        hit_count = hit_count + 1,
                        client_ip = VALUES(client_ip),
                        last_path = VALUES(last_path)
                    """,
                    (vid, day, now, now, ip, last_path),
                )
        finally:
            conn.close()
    except Exception:
        return


def count_anon_uv_by_date(active_date: str) -> int:
    """按日统计匿名 UV；失败返回 0。"""
    try:
        ensure_anon_activity_tables()
        day = (active_date or "").strip()[:10]
        if not day:
            return 0
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COUNT(*) AS cnt
                    FROM hub_anon_uv_daily
                    WHERE active_date = %s
                    """,
                    (day,),
                )
                row = cur.fetchone() or {}
                return int(row.get("cnt") or 0)
        finally:
            conn.close()
    except Exception:
        return 0


def list_anon_uv_by_date(active_date: str) -> List[Dict[str, Any]]:
    """按日列出匿名访客明细；失败返回空列表。"""
    try:
        ensure_anon_activity_tables()
        day = (active_date or "").strip()[:10]
        if not day:
            return []
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT visitor_id, first_seen_at, last_seen_at, hit_count, client_ip, last_path
                    FROM hub_anon_uv_daily
                    WHERE active_date = %s
                    ORDER BY last_seen_at DESC
                    """,
                    (day,),
                )
                return list(cur.fetchall() or [])
        finally:
            conn.close()
    except Exception:
        return []
