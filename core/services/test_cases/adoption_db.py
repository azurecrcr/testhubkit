"""用例生成批次与采纳反馈表。"""
from __future__ import annotations

from core.services.test_cases.mysql_db import get_connection

_BATCHES_SQL = """
CREATE TABLE IF NOT EXISTS tc_generation_batches (
    id CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(32) NULL,
    session_key VARCHAR(64) NULL,
    mode VARCHAR(16) NOT NULL DEFAULT 'list',
    ai_mode VARCHAR(16) NOT NULL DEFAULT 'preset',
    rag_used TINYINT(1) NOT NULL DEFAULT 0,
    row_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    closed_at DATETIME NULL,
    INDEX idx_tc_batch_user (user_id, created_at),
    INDEX idx_tc_batch_session (session_key, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_FEEDBACK_SQL = """
CREATE TABLE IF NOT EXISTS tc_generation_feedback (
    id CHAR(32) NOT NULL PRIMARY KEY,
    batch_id CHAR(32) NOT NULL,
    row_index INT NOT NULL,
    action VARCHAR(24) NOT NULL,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uq_batch_row (batch_id, row_index),
    INDEX idx_tc_feedback_batch (batch_id),
    CONSTRAINT fk_tc_feedback_batch FOREIGN KEY (batch_id)
        REFERENCES tc_generation_batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def ensure_adoption_tables() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_BATCHES_SQL)
            cur.execute(_FEEDBACK_SQL)
    finally:
        conn.close()
