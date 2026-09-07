"""桌面客户端设备 / Token / 审计表（与网页 Session 分离）。"""
from __future__ import annotations

from core.services.test_cases.mysql_db import get_connection

_DEVICES_SQL = """
CREATE TABLE IF NOT EXISTS hub_desktop_devices (
    id CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(32) NOT NULL,
    device_name VARCHAR(128) NOT NULL DEFAULT '',
    public_key TEXT NOT NULL,
    fingerprint VARCHAR(128) NOT NULL DEFAULT '',
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    last_seen_at DATETIME NULL,
    INDEX idx_hub_desktop_devices_user (user_id, status),
    INDEX idx_hub_desktop_devices_fp (fingerprint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_TOKENS_SQL = """
CREATE TABLE IF NOT EXISTS hub_desktop_tokens (
    id CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(32) NOT NULL,
    device_id CHAR(32) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    created_at DATETIME NOT NULL,
    last_seen_at DATETIME NULL,
    client_ip VARCHAR(45) NOT NULL DEFAULT '',
    user_agent VARCHAR(512) NOT NULL DEFAULT '',
    UNIQUE KEY uk_hub_desktop_token_hash (token_hash),
    INDEX idx_hub_desktop_tokens_user (user_id),
    INDEX idx_hub_desktop_tokens_device (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_AUDIT_SQL = """
CREATE TABLE IF NOT EXISTS hub_desktop_audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(32) NULL,
    device_id CHAR(32) NULL,
    event VARCHAR(64) NOT NULL,
    detail VARCHAR(512) NOT NULL DEFAULT '',
    client_ip VARCHAR(45) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL,
    INDEX idx_hub_desktop_audit_user (user_id, created_at),
    INDEX idx_hub_desktop_audit_event (event, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_ready = False


def ensure_desktop_auth_tables() -> None:
    global _ready
    if _ready:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_DEVICES_SQL)
            cur.execute(_TOKENS_SQL)
            cur.execute(_AUDIT_SQL)
        conn.commit()
    finally:
        conn.close()
    _ready = True
