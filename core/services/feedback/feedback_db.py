from __future__ import annotations

import threading
from typing import Any, Dict

import pymysql
from pymysql.cursors import DictCursor

from core.config.database import (
    MYSQL_DATABASE,
    MYSQL_HOST,
    MYSQL_PASSWORD,
    MYSQL_PORT,
    MYSQL_USER,
)

_FEEDBACK_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS system_feedback (
    id CHAR(32) NOT NULL PRIMARY KEY,
    content TEXT NOT NULL,
    contact VARCHAR(120) NOT NULL DEFAULT '',
    page_url VARCHAR(500) NOT NULL DEFAULT '',
    user_agent VARCHAR(500) NOT NULL DEFAULT '',
    client_ip VARCHAR(45) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL,
    hub_user_id CHAR(32) NULL DEFAULT NULL,
    email_sent TINYINT(1) NOT NULL DEFAULT 0,
    INDEX idx_created (created_at),
    INDEX idx_client_ip_created (client_ip, created_at),
    INDEX idx_hub_user_created (hub_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def get_connection():
    return pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DATABASE,
        charset="utf8mb4",
        cursorclass=DictCursor,
        autocommit=True,
    )


def _ensure_client_ip_column(cur) -> None:
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_feedback' AND COLUMN_NAME = 'client_ip'"
    )
    row = cur.fetchone()
    if row and row.get("n"):
        return
    cur.execute(
        "ALTER TABLE system_feedback ADD COLUMN client_ip VARCHAR(45) NOT NULL DEFAULT '' AFTER user_agent"
    )
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_feedback' AND INDEX_NAME = 'idx_client_ip_created'"
    )
    idx = cur.fetchone()
    if not idx or not idx.get("n"):
        cur.execute(
            "CREATE INDEX idx_client_ip_created ON system_feedback (client_ip, created_at)"
        )




def _ensure_hub_user_id_column(cur) -> None:
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_feedback' AND COLUMN_NAME = 'hub_user_id'"
    )
    row = cur.fetchone()
    if row and row.get("n"):
        return
    cur.execute(
        "ALTER TABLE system_feedback ADD COLUMN hub_user_id CHAR(32) NULL DEFAULT NULL AFTER client_ip"
    )
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_feedback' AND INDEX_NAME = 'idx_hub_user_created'"
    )
    idx = cur.fetchone()
    if not idx or not idx.get("n"):
        cur.execute(
            "CREATE INDEX idx_hub_user_created ON system_feedback (hub_user_id, created_at)"
        )


def _ensure_sms_sent_column(cur) -> None:
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_feedback' AND COLUMN_NAME = 'sms_sent'"
    )
    row = cur.fetchone()
    if row and row.get("n"):
        return
    cur.execute(
        "ALTER TABLE system_feedback "
        "ADD COLUMN sms_sent TINYINT(1) NOT NULL DEFAULT 0 AFTER email_sent"
    )


_feedback_table_ready = False
_feedback_table_lock = threading.Lock()


def ensure_feedback_table() -> None:
    global _feedback_table_ready
    if _feedback_table_ready:
        return
    with _feedback_table_lock:
        if _feedback_table_ready:
            return
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(_FEEDBACK_TABLE_SQL)
                _ensure_client_ip_column(cur)
                _ensure_hub_user_id_column(cur)
                _ensure_sms_sent_column(cur)
            _feedback_table_ready = True
        finally:
            conn.close()


def count_recent_by_ip(client_ip: str, window_minutes: int = 1) -> int:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt FROM system_feedback
                WHERE client_ip = %s AND created_at >= (NOW() - INTERVAL %s MINUTE)
                """,
                (client_ip, window_minutes),
            )
            row = cur.fetchone()
            return int(row["cnt"]) if row else 0
    finally:
        conn.close()


def insert_feedback(row: Dict[str, Any]) -> None:
    ensure_feedback_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO system_feedback
                    (id, content, contact, page_url, user_agent, client_ip, hub_user_id, created_at, email_sent, sms_sent)
                VALUES
                    (%(id)s, %(content)s, %(contact)s, %(page_url)s, %(user_agent)s, %(client_ip)s, %(hub_user_id)s, %(created_at)s, %(email_sent)s, %(sms_sent)s)
                """,
                row,
            )
    finally:
        conn.close()


def mark_email_sent(feedback_id: str) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE system_feedback SET email_sent = 1 WHERE id = %s",
                (feedback_id,),
            )
    finally:
        conn.close()


def mark_sms_sent(feedback_id: str) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE system_feedback SET sms_sent = 1 WHERE id = %s",
                (feedback_id,),
            )
    finally:
        conn.close()


def count_recent_sms_sent(window_minutes: int = 1) -> int:
    """统计近期成功发出的管理员通知短信条数（全站，用于防刷）。"""
    ensure_feedback_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt FROM system_feedback
                WHERE sms_sent = 1 AND created_at >= (NOW() - INTERVAL %s MINUTE)
                """,
                (window_minutes,),
            )
            row = cur.fetchone()
            return int(row["cnt"]) if row else 0
    finally:
        conn.close()


def count_all_feedback() -> int:
    ensure_feedback_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS cnt FROM system_feedback")
            row = cur.fetchone()
            return int(row["cnt"]) if row else 0
    finally:
        conn.close()


def list_feedback_for_admin(*, page: int = 1, page_size: int = 20) -> list[Dict[str, Any]]:
    """管理员查看投稿列表（按时间倒序）。独立查询，不影响投稿写入。"""
    ensure_feedback_table()
    page = max(1, int(page or 1))
    page_size = max(1, min(50, int(page_size or 20)))
    offset = (page - 1) * page_size
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, content, contact, page_url, user_agent, client_ip,
                       hub_user_id, created_at, email_sent, sms_sent
                FROM system_feedback
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (page_size, offset),
            )
            rows = cur.fetchall() or []
            return [dict(r) for r in rows]
    finally:
        conn.close()


def get_feedback_by_id(feedback_id: str) -> Dict[str, Any] | None:
    """按 id 取单条投稿（管理端详情用，不影响列表查询）。"""
    fid = str(feedback_id or "").strip()
    if not fid:
        return None
    ensure_feedback_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, content, contact, page_url, user_agent, client_ip,
                       hub_user_id, created_at, email_sent, sms_sent
                FROM system_feedback
                WHERE id = %s
                LIMIT 1
                """,
                (fid,),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()
