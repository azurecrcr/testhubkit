"""协作评审：分享快照与评论表。"""
from __future__ import annotations

from core.services.test_cases.mysql_db import get_connection

_SNAPSHOTS_SQL = """
CREATE TABLE IF NOT EXISTS tc_share_snapshots (
    id CHAR(32) NOT NULL PRIMARY KEY,
    token VARCHAR(64) NOT NULL,
    user_id CHAR(32) NOT NULL,
    title VARCHAR(200) NOT NULL,
    payload JSON NOT NULL,
    expires_at DATETIME NULL,
    comment_enabled TINYINT(1) NOT NULL DEFAULT 1,
    revoked_at DATETIME NULL,
    deleted_at DATETIME NULL,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uq_share_token (token),
    INDEX idx_share_user (user_id, created_at),
    INDEX idx_share_user_active (user_id, deleted_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_COMMENTS_SQL = """
CREATE TABLE IF NOT EXISTS tc_share_comments (
    id CHAR(32) NOT NULL PRIMARY KEY,
    share_id CHAR(32) NOT NULL,
    row_index INT NULL,
    author_name VARCHAR(64) NOT NULL,
    user_id CHAR(32) NULL,
    content VARCHAR(2000) NOT NULL,
    client_ip VARCHAR(45) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL,
    INDEX idx_share_comments_share (share_id, created_at),
    INDEX idx_share_comments_ip (share_id, client_ip, created_at),
    CONSTRAINT fk_share_comments_snapshot FOREIGN KEY (share_id)
        REFERENCES tc_share_snapshots(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def ensure_share_tables() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_SNAPSHOTS_SQL)
            cur.execute(_COMMENTS_SQL)
            _migrate_snapshots_deleted_at(cur)
            _migrate_comments_cascade_fk(cur)
        conn.commit()
    finally:
        conn.close()


def _migrate_snapshots_deleted_at(cur) -> None:
    cur.execute(
        """
        SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tc_share_snapshots'
          AND COLUMN_NAME = 'deleted_at'
        """
    )
    row = cur.fetchone()
    if row and int(row.get("n") or 0) > 0:
        return
    try:
        cur.execute(
            """
            ALTER TABLE tc_share_snapshots
            ADD COLUMN deleted_at DATETIME NULL AFTER revoked_at,
            ADD INDEX idx_share_user_active (user_id, deleted_at, created_at)
            """
        )
    except Exception:
        try:
            cur.execute(
                """
                ALTER TABLE tc_share_snapshots
                ADD COLUMN deleted_at DATETIME NULL AFTER revoked_at
                """
            )
        except Exception:
            pass


def _migrate_comments_cascade_fk(cur) -> None:
    cur.execute(
        """
        SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tc_share_comments'
          AND CONSTRAINT_NAME = 'fk_share_comments_snapshot'
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        """
    )
    row = cur.fetchone()
    if row and int(row.get("n") or 0) > 0:
        return
    try:
        cur.execute(
            """
            ALTER TABLE tc_share_comments
            ADD CONSTRAINT fk_share_comments_snapshot
            FOREIGN KEY (share_id) REFERENCES tc_share_snapshots(id)
            ON DELETE CASCADE
            """
        )
    except Exception:
        pass


def count_recent_comments_by_ip(
    share_id: str, client_ip: str, since: "datetime"
) -> int:
    from datetime import datetime

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS n FROM tc_share_comments
                WHERE share_id = %s AND client_ip = %s AND created_at >= %s
                """,
                (share_id, client_ip, since),
            )
            row = cur.fetchone()
            return int((row or {}).get("n") or 0)
    finally:
        conn.close()
