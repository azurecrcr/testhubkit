from __future__ import annotations

from core.services.test_cases.mysql_db import get_connection

_HUB_USERS_SQL = """
CREATE TABLE IF NOT EXISTS hub_users (
    id CHAR(32) NOT NULL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_hub_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_HUB_CODES_SQL = """
CREATE TABLE IF NOT EXISTS hub_email_verification_codes (
    id CHAR(32) NOT NULL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    purpose VARCHAR(16) NOT NULL,
    code_hash VARCHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL,
    client_ip VARCHAR(45) NOT NULL DEFAULT '',
    INDEX idx_hub_codes_email (email, purpose, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_HUB_SEND_LOG_SQL = """
CREATE TABLE IF NOT EXISTS hub_auth_send_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    client_ip VARCHAR(45) NOT NULL DEFAULT '',
    action VARCHAR(32) NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_hub_send_email (email, created_at),
    INDEX idx_hub_send_ip (client_ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""



def _column_exists(cur, table: str, column: str) -> bool:
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s",
        (table, column),
    )
    row = cur.fetchone() or {}
    return int(row.get("n") or 0) > 0


def _ensure_user_profile_columns(cur) -> None:
    if not _column_exists(cur, "hub_users", "display_name"):
        cur.execute(
            "ALTER TABLE hub_users "
            "ADD COLUMN display_name VARCHAR(64) NULL DEFAULT NULL "
            "COMMENT '用户昵称' AFTER email"
        )
    if not _column_exists(cur, "hub_users", "avatar_path"):
        cur.execute(
            "ALTER TABLE hub_users "
            "ADD COLUMN avatar_path VARCHAR(255) NULL DEFAULT NULL "
            "COMMENT '头像相对路径' AFTER display_name"
        )


def _ensure_user_role_column(cur) -> None:
    if not _column_exists(cur, "hub_users", "role"):
        cur.execute(
            "ALTER TABLE hub_users "
            "ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user' "
            "COMMENT 'user=普通用户 manager=管理员' AFTER avatar_path"
        )


def _index_exists(cur, table: str, index_name: str) -> bool:
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND INDEX_NAME = %s",
        (table, index_name),
    )
    row = cur.fetchone() or {}
    return int(row.get("n") or 0) > 0


def _ensure_user_phone_columns(cur) -> None:
    """手机号注册字段；不影响既有邮箱用户（phone 默认为 NULL）。"""
    try:
        if not _column_exists(cur, "hub_users", "phone"):
            cur.execute(
                "ALTER TABLE hub_users "
                "ADD COLUMN phone VARCHAR(20) NULL DEFAULT NULL "
                "COMMENT '手机号（11位）' AFTER email"
            )
    except Exception as exc:
        if "1060" not in str(exc) and "Duplicate column" not in str(exc):
            raise
    try:
        if not _column_exists(cur, "hub_users", "phone_verified_at"):
            cur.execute(
                "ALTER TABLE hub_users "
                "ADD COLUMN phone_verified_at DATETIME NULL DEFAULT NULL "
                "COMMENT '手机号验证时间' AFTER phone"
            )
    except Exception as exc:
        if "1060" not in str(exc) and "Duplicate column" not in str(exc):
            raise
    try:
        if not _index_exists(cur, "hub_users", "uk_hub_users_phone"):
            cur.execute(
                "CREATE UNIQUE INDEX uk_hub_users_phone ON hub_users (phone)"
            )
    except Exception as exc:
        if "1061" not in str(exc) and "Duplicate" not in str(exc):
            raise


_AUTH_TABLES_READY = False


def ensure_auth_tables() -> None:
    global _AUTH_TABLES_READY
    if _AUTH_TABLES_READY:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_HUB_USERS_SQL)
            cur.execute(_HUB_CODES_SQL)
            cur.execute(_HUB_SEND_LOG_SQL)
            _ensure_user_profile_columns(cur)
            _ensure_user_role_column(cur)
            _ensure_user_phone_columns(cur)
    finally:
        conn.close()
    _AUTH_TABLES_READY = True
