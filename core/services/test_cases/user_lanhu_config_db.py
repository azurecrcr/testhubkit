#!/usr/bin/env python3
"""用户蓝湖配置数据库模块：存储每用户的 Cookie、URL 与生成提示词。"""
from __future__ import annotations

import time
from typing import Any

from core.services.test_cases.stash_db import get_connection


_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS user_lanhu_config (
    user_id CHAR(32) NOT NULL PRIMARY KEY,
    lanhu_cookie TEXT NOT NULL,
    lanhu_url VARCHAR(2048) NOT NULL DEFAULT '',
    prompt TEXT NOT NULL,
    active_lanhu_doc_id CHAR(32) NOT NULL DEFAULT '',
    lanhu_tree_restorable TINYINT(1) NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def _resolve_default_prompt() -> str:
    from core.services.test_cases.system_prompt_db import get_table_generate_default_prompt

    return get_table_generate_default_prompt()


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _column_exists(cur, column: str) -> bool:
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_lanhu_config' AND COLUMN_NAME = %s",
        (column,),
    )
    row = cur.fetchone() or {}
    return int(row.get("n") or 0) > 0


def ensure_user_lanhu_config_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
            if not _column_exists(cur, "active_lanhu_doc_id"):
                cur.execute(
                    "ALTER TABLE user_lanhu_config "
                    "ADD COLUMN active_lanhu_doc_id CHAR(32) NOT NULL DEFAULT '' AFTER prompt"
                )
            if not _column_exists(cur, "lanhu_tree_restorable"):
                cur.execute(
                    "ALTER TABLE user_lanhu_config "
                    "ADD COLUMN lanhu_tree_restorable TINYINT(1) NOT NULL DEFAULT 0 "
                    "AFTER active_lanhu_doc_id"
                )
        conn.commit()
    finally:
        conn.close()


def _default_config() -> dict[str, Any]:
    return {
        "lanhu_cookie": "",
        "lanhu_url": "",
        "prompt": _resolve_default_prompt(),
        "active_lanhu_doc_id": "",
        "lanhu_tree_restorable": False,
        "updated_at": None,
    }


def _row_to_config(row: dict[str, Any] | None) -> dict[str, Any]:
    if not row:
        return _default_config()
    default_prompt = _resolve_default_prompt()
    return {
        "lanhu_cookie": str(row.get("lanhu_cookie") or ""),
        "lanhu_url": str(row.get("lanhu_url") or ""),
        "prompt": str(row.get("prompt") or "") or default_prompt,
        "active_lanhu_doc_id": str(row.get("active_lanhu_doc_id") or ""),
        "lanhu_tree_restorable": bool(int(row.get("lanhu_tree_restorable") or 0)),
        "updated_at": str(row.get("updated_at") or ""),
    }


def get_user_lanhu_config(user_id: str) -> dict[str, Any]:
    """获取用户蓝湖配置。若不存在则返回默认值。"""
    uid = str(user_id or "").strip()
    if not uid:
        return _default_config()
    ensure_user_lanhu_config_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT lanhu_cookie, lanhu_url, prompt, active_lanhu_doc_id, "
                "lanhu_tree_restorable, updated_at "
                "FROM user_lanhu_config WHERE user_id = %s LIMIT 1",
                (uid,),
            )
            row = cur.fetchone()
        return _row_to_config(row)
    finally:
        conn.close()


def save_user_lanhu_config(user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """保存用户蓝湖配置。"""
    uid = str(user_id or "").strip()
    if not uid:
        raise ValueError("请先登录")
    existing = get_user_lanhu_config(uid)
    lanhu_cookie = str(
        data.get("lanhu_cookie") if "lanhu_cookie" in data else existing.get("lanhu_cookie") or ""
    )
    lanhu_url = str(
        data.get("lanhu_url") if "lanhu_url" in data else existing.get("lanhu_url") or ""
    ).strip()
    prompt = str(data.get("prompt") if "prompt" in data else existing.get("prompt") or "").strip()
    if not prompt:
        prompt = _resolve_default_prompt()
    active_doc_id = str(
        data.get("active_lanhu_doc_id")
        if "active_lanhu_doc_id" in data
        else existing.get("active_lanhu_doc_id")
        or ""
    ).strip()
    restorable = data.get("lanhu_tree_restorable")
    if restorable is None:
        restorable = existing.get("lanhu_tree_restorable", False)
    ensure_user_lanhu_config_table()
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_lanhu_config
                (user_id, lanhu_cookie, lanhu_url, prompt, active_lanhu_doc_id,
                 lanhu_tree_restorable, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    lanhu_cookie = VALUES(lanhu_cookie),
                    lanhu_url = VALUES(lanhu_url),
                    prompt = VALUES(prompt),
                    active_lanhu_doc_id = VALUES(active_lanhu_doc_id),
                    lanhu_tree_restorable = VALUES(lanhu_tree_restorable),
                    updated_at = VALUES(updated_at)
                """,
                (
                    uid,
                    lanhu_cookie,
                    lanhu_url,
                    prompt,
                    active_doc_id,
                    1 if restorable else 0,
                    now,
                ),
            )
        conn.commit()
    finally:
        conn.close()
    return {
        "lanhu_cookie": lanhu_cookie,
        "lanhu_url": lanhu_url,
        "prompt": prompt,
        "active_lanhu_doc_id": active_doc_id,
        "lanhu_tree_restorable": bool(restorable),
        "updated_at": now,
    }


def set_lanhu_tree_session(
    user_id: str,
    *,
    doc_id: str,
    cookie: str,
    url: str,
    restorable: bool,
) -> None:
    uid = str(user_id or "").strip()
    if not uid:
        return
    existing = get_user_lanhu_config(uid)
    save_user_lanhu_config(
        uid,
        {
            "lanhu_cookie": cookie,
            "lanhu_url": url,
            "prompt": existing.get("prompt"),
            "active_lanhu_doc_id": doc_id,
            "lanhu_tree_restorable": restorable,
        },
    )


def clear_lanhu_tree_session(user_id: str) -> None:
    """关闭当前登录会话的蓝湖树自动恢复（退出登录 / 删除活动文档）。"""
    uid = str(user_id or "").strip()
    if not uid:
        return
    existing = get_user_lanhu_config(uid)
    save_user_lanhu_config(
        uid,
        {
            "lanhu_cookie": existing.get("lanhu_cookie") or "",
            "lanhu_url": existing.get("lanhu_url") or "",
            "prompt": existing.get("prompt"),
            "active_lanhu_doc_id": "",
            "lanhu_tree_restorable": False,
        },
    )


def clear_user_lanhu_credentials(user_id: str) -> None:
    """清空 Cookie/URL，保留提示词。"""
    uid = str(user_id or "").strip()
    if not uid:
        return
    existing = get_user_lanhu_config(uid)
    save_user_lanhu_config(
        uid,
        {
            "lanhu_cookie": "",
            "lanhu_url": "",
            "prompt": existing.get("prompt"),
            "active_lanhu_doc_id": "",
            "lanhu_tree_restorable": False,
        },
    )
