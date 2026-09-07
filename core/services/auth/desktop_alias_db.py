"""桌面应用别名词典表（服务器主数据）。"""
from __future__ import annotations

from core.services.test_cases.mysql_db import get_connection

_RULES_SQL = """
CREATE TABLE IF NOT EXISTS hub_desktop_alias_rules (
    id CHAR(32) NOT NULL PRIMARY KEY,
    scope VARCHAR(16) NOT NULL DEFAULT 'global',
    tenant_id CHAR(32) NOT NULL DEFAULT '',
    user_id CHAR(32) NOT NULL DEFAULT '',
    terms_json TEXT NOT NULL,
    prefer_json TEXT NOT NULL,
    exclude_json TEXT NOT NULL,
    category VARCHAR(32) NOT NULL DEFAULT 'general',
    exe_hints_json TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'published',
    source VARCHAR(32) NOT NULL DEFAULT 'ops',
    version BIGINT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_hub_desktop_alias_scope (scope, status, version),
    INDEX idx_hub_desktop_alias_user (user_id, status),
    INDEX idx_hub_desktop_alias_tenant (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_LEARN_SQL = """
CREATE TABLE IF NOT EXISTS hub_desktop_alias_learn (
    id CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(32) NOT NULL,
    device_id CHAR(32) NOT NULL DEFAULT '',
    raw_goal VARCHAR(512) NOT NULL DEFAULT '',
    matched_term VARCHAR(128) NOT NULL DEFAULT '',
    prefer_json TEXT NOT NULL,
    exclude_json TEXT NOT NULL,
    category VARCHAR(32) NOT NULL DEFAULT 'general',
    resolved_launch VARCHAR(256) NOT NULL DEFAULT '',
    resolved_display VARCHAR(256) NOT NULL DEFAULT '',
    exe_name VARCHAR(128) NOT NULL DEFAULT '',
    exe_path_hash VARCHAR(32) NOT NULL DEFAULT '',
    job_id VARCHAR(64) NOT NULL DEFAULT '',
    verify_passed TINYINT NOT NULL DEFAULT 0,
    confidence DECIMAL(4,3) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_hub_desktop_alias_learn_user (user_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_META_SQL = """
CREATE TABLE IF NOT EXISTS hub_desktop_alias_meta (
    k VARCHAR(64) NOT NULL PRIMARY KEY,
    v VARCHAR(256) NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_ready = False


def ensure_desktop_alias_tables() -> None:
    global _ready
    if _ready:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_RULES_SQL)
            cur.execute(_LEARN_SQL)
            cur.execute(_META_SQL)
        conn.commit()
    finally:
        conn.close()
    _ready = True
