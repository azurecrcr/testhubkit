"""RAG 管理员配置（MySQL 单行）。"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from core.services.test_cases.mysql_db import get_connection

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS rag_admin_settings (
    id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
    auto_enable_for_admin TINYINT(1) NOT NULL DEFAULT 1,
    default_token_budget JSON NULL,
    updated_at DATETIME NOT NULL,
    updated_by VARCHAR(255) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def ensure_rag_admin_settings_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                """
                INSERT IGNORE INTO rag_admin_settings
                    (id, auto_enable_for_admin, default_token_budget, updated_at, updated_by)
                VALUES (1, 1, NULL, %s, '')
                """,
                (now,),
            )
    finally:
        conn.close()


def get_rag_admin_settings_row() -> dict[str, Any]:
    ensure_rag_admin_settings_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT auto_enable_for_admin, default_token_budget, updated_at, updated_by
                FROM rag_admin_settings WHERE id = 1
                """
            )
            row = cur.fetchone() or {}
    finally:
        conn.close()
    budget_raw = row.get("default_token_budget")
    budget = None
    if budget_raw:
        try:
            budget = json.loads(budget_raw) if isinstance(budget_raw, str) else budget_raw
        except (TypeError, json.JSONDecodeError):
            budget = None
    updated_at = row.get("updated_at")
    return {
        "auto_enable_for_admin": bool(row.get("auto_enable_for_admin", 1)),
        "default_token_budget": budget,
        "updated_at": updated_at.isoformat(timespec="seconds")
        if hasattr(updated_at, "isoformat")
        else str(updated_at or ""),
        "updated_by": str(row.get("updated_by") or ""),
    }


def update_rag_admin_settings(
    *,
    auto_enable_for_admin: bool | None = None,
    default_token_budget: dict[str, Any] | None = None,
    updated_by: str = "",
) -> dict[str, Any]:
    ensure_rag_admin_settings_table()
    current = get_rag_admin_settings_row()
    auto = (
        bool(auto_enable_for_admin)
        if auto_enable_for_admin is not None
        else bool(current.get("auto_enable_for_admin"))
    )
    budget = (
        default_token_budget
        if default_token_budget is not None
        else current.get("default_token_budget")
    )
    budget_json = json.dumps(budget, ensure_ascii=False) if budget else None
    now = datetime.now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE rag_admin_settings
                SET auto_enable_for_admin = %s,
                    default_token_budget = %s,
                    updated_at = %s,
                    updated_by = %s
                WHERE id = 1
                """,
                (1 if auto else 0, budget_json, now, str(updated_by or "")[:255]),
            )
    finally:
        conn.close()
    return get_rag_admin_settings_row()


def admin_rag_auto_unlock_enabled() -> bool:
    """管理员是否免密码解锁公共 RAG（全站 AI 配置弹窗开关，存 DB）。"""
    return bool(get_rag_admin_settings_row().get("auto_enable_for_admin", True))


def admin_rag_auto_unlock_enabled() -> bool:
    """管理员是否免密码解锁公共 RAG（全站 AI 配置弹窗开关，存 DB）。"""
    return bool(get_rag_admin_settings_row().get("auto_enable_for_admin", True))
