"""用例工作台 AI 生成表单：按用户 + 模式持久化配置。"""
from __future__ import annotations

import json
import time
from typing import Any, Optional

from core.services.test_cases.mysql_db import get_connection

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS tc_ai_form_prefs (
    user_id CHAR(32) NOT NULL,
    mode VARCHAR(16) NOT NULL,
    config_json MEDIUMTEXT NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (user_id, mode),
    INDEX idx_tc_ai_form_prefs_user (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_PRESET_KEYS = frozenset({"lanhu_cookie", "lanhu_url", "prompt"})
_CUSTOM_KEYS = frozenset({
    "base_url", "api_key", "model", "temperature",
    "lanhu_cookie", "lanhu_url", "prompt", "images",
})
_MAX_CONFIG_BYTES = 6 * 1024 * 1024


def ensure_ai_form_prefs_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
    finally:
        conn.close()


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _normalize_mode(mode: str) -> str:
    m = (mode or "").strip().lower()
    if m not in ("preset", "custom"):
        raise ValueError("mode 须为 preset 或 custom")
    return m


def _sanitize_config(mode: str, config: object) -> dict[str, Any]:
    if not isinstance(config, dict):
        raise ValueError("config 必须是对象")
    allowed = _PRESET_KEYS if mode == "preset" else _CUSTOM_KEYS
    out: dict[str, Any] = {}
    for key in allowed:
        if key not in config:
            continue
        val = config[key]
        if key == "images":
            if not isinstance(val, dict):
                continue
            imgs: dict[str, str] = {}
            for slot, data in val.items():
                sk = str(slot)
                if sk not in ("1", "2", "3", "4"):
                    continue
                if isinstance(data, str) and data.startswith("data:"):
                    imgs[sk] = data
            out["images"] = imgs
        elif val is None:
            out[key] = ""
        elif isinstance(val, (str, int, float)):
            out[key] = str(val)
        else:
            out[key] = str(val)
    raw = json.dumps(out, ensure_ascii=False)
    if len(raw.encode("utf-8")) > _MAX_CONFIG_BYTES:
        raise ValueError("配置数据过大，请减少提示词或图片数量后再保存")
    return out


def get_ai_form_pref(user_id: str, mode: str) -> Optional[dict[str, Any]]:
    ensure_ai_form_prefs_table()
    mode = _normalize_mode(mode)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT config_json FROM tc_ai_form_prefs WHERE user_id = %s AND mode = %s LIMIT 1",
                (user_id, mode),
            )
            row = cur.fetchone()
        if not row:
            return None
        data = json.loads(row["config_json"] or "{}")
        return data if isinstance(data, dict) else None
    finally:
        conn.close()


def get_all_ai_form_prefs(user_id: str) -> dict[str, Optional[dict[str, Any]]]:
    return {
        "preset": get_ai_form_pref(user_id, "preset"),
        "custom": get_ai_form_pref(user_id, "custom"),
    }


def save_ai_form_pref(user_id: str, mode: str, config: object, *, merge: bool = False) -> dict[str, Any]:
    ensure_ai_form_prefs_table()
    mode = _normalize_mode(mode)
    clean = _sanitize_config(mode, config)
    if merge:
        existing = get_ai_form_pref(user_id, mode) or {}
        if isinstance(existing, dict):
            merged = dict(existing)
            merged.update(clean)
            clean = _sanitize_config(mode, merged)
    payload = json.dumps(clean, ensure_ascii=False)
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_ai_form_prefs (user_id, mode, config_json, updated_at)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE config_json = VALUES(config_json), updated_at = VALUES(updated_at)
                """,
                (user_id, mode, payload, now),
            )
        conn.commit()
    finally:
        conn.close()
    return {"mode": mode, "config": clean, "updated_at": now}
