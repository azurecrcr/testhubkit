"""用例质量校验运行记录表。"""
from __future__ import annotations

from core.services.test_cases.mysql_db import get_connection

_VALIDATION_RUNS_SQL = """
CREATE TABLE IF NOT EXISTS tc_validation_runs (
    id CHAR(32) NOT NULL PRIMARY KEY,
    batch_id CHAR(32) NULL,
    user_id CHAR(32) NULL,
    issue_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    INDEX idx_tc_validation_user (user_id, created_at),
    INDEX idx_tc_validation_batch (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_VALIDATION_ISSUES_SQL = """
CREATE TABLE IF NOT EXISTS tc_validation_issues (
    id CHAR(32) NOT NULL PRIMARY KEY,
    run_id CHAR(32) NOT NULL,
    row_index INT NULL,
    issue_type VARCHAR(24) NOT NULL,
    message TEXT NOT NULL,
    dismissed TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    INDEX idx_tc_validation_run (run_id),
    CONSTRAINT fk_tc_validation_run FOREIGN KEY (run_id)
        REFERENCES tc_validation_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def ensure_validation_tables() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_VALIDATION_RUNS_SQL)
            cur.execute(_VALIDATION_ISSUES_SQL)
    finally:
        conn.close()
