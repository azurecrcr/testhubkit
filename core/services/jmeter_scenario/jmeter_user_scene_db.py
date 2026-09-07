"""JMeter 压测 · 用户场景表（按 user_id 隔离，旁路新建）。"""
from __future__ import annotations

from core.services.test_cases.mysql_db import get_connection

_TABLE_READY = False

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS jmeter_user_scenes (
    id CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(32) NOT NULL,
    title VARCHAR(120) NOT NULL,
    payload JSON NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_jms_user_updated (user_id, updated_at),
    INDEX idx_jms_user_id (user_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def ensure_jmeter_user_scenes_table() -> None:
    global _TABLE_READY
    if _TABLE_READY:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
    finally:
        conn.close()
    _TABLE_READY = True
