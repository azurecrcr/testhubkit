"""导出报告审计表（仅存摘要，不存完整用例）。"""
from __future__ import annotations

from core.services.test_cases.mysql_db import get_connection

_EXPORT_REPORTS_SQL = """
CREATE TABLE IF NOT EXISTS tc_export_reports (
    id CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(32) NULL,
    batch_id VARCHAR(64) NULL,
    profile_key VARCHAR(64) NOT NULL,
    summary_json JSON NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_tc_export_reports_user (user_id, created_at),
    INDEX idx_tc_export_reports_batch (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def ensure_export_report_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_EXPORT_REPORTS_SQL)
    finally:
        conn.close()
