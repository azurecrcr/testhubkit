"""按用户隔离的 AI 文本 + 视觉模型配置。"""
from __future__ import annotations

import time
from typing import Any, Optional

from core.services.test_cases.mysql_db import get_connection

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS user_ai_config (
    user_id CHAR(32) NOT NULL PRIMARY KEY,
    base_url VARCHAR(512) NOT NULL DEFAULT '',
    api_key VARCHAR(512) NOT NULL DEFAULT '',
    model VARCHAR(256) NOT NULL DEFAULT '',
    temperature DECIMAL(4,2) NOT NULL DEFAULT 0.10,
    vision_api_base_url VARCHAR(512) NOT NULL DEFAULT '',
    vision_api_key VARCHAR(512) NOT NULL DEFAULT '',
    vision_model VARCHAR(256) NOT NULL DEFAULT '',
    updated_at DATETIME NOT NULL,
    INDEX idx_user_ai_config_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def ensure_user_ai_config_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
            _migrate_vision_columns(cur)
            _migrate_cursor_agent_columns(cur)
    finally:
        conn.close()




def _migrate_cursor_agent_columns(cur) -> None:
    cur.execute("SHOW COLUMNS FROM user_ai_config LIKE %s", ("cursor_api_key",))
    if cur.fetchone():
        return
    cur.execute(
        "ALTER TABLE user_ai_config "
        "ADD COLUMN cursor_api_key VARCHAR(512) NOT NULL DEFAULT '' AFTER vision_model, "
        "ADD COLUMN agent_model VARCHAR(128) NOT NULL DEFAULT '' AFTER cursor_api_key"
    )


def _normalize_agent_model(value: Any) -> str:
    model = str(value or "").strip()
    if len(model) > 128:
        raise ValueError("Agent 模型 slug 过长")
    return model


def is_user_cursor_agent_configured(cfg: dict[str, Any] | None) -> bool:
    if not cfg:
        return False
    key = str(cfg.get("cursor_api_key") or "").strip()
    model = str(cfg.get("agent_model") or "").strip()
    return bool(key and model)


def _clear_legacy_cursor_agent_config(user_id: str) -> None:
    uid = str(user_id or "").strip()
    if not uid:
        return
    try:
        from core.services.ui_automation.uia_scenario_config_db import save_uia_scenario_config
        save_uia_scenario_config(uid, {"cursor_api_key": "", "agent_model": ""})
    except Exception:
        pass


def get_user_cursor_agent_settings(user_id: str) -> dict[str, str]:
    uid = str(user_id or "").strip()
    if not uid:
        return {"cursor_api_key": "", "agent_model": ""}
    cfg = get_user_ai_config(uid)
    if cfg is not None:
        return {
            "cursor_api_key": str(cfg.get("cursor_api_key") or "").strip(),
            "agent_model": _normalize_agent_model(cfg.get("agent_model")),
        }
    try:
        from core.services.ui_automation.uia_scenario_config_db import get_uia_scenario_config
        legacy = get_uia_scenario_config(uid) or {}
        return {
            "cursor_api_key": str(legacy.get("cursor_api_key") or "").strip(),
            "agent_model": _normalize_agent_model(legacy.get("agent_model")),
        }
    except Exception:
        return {"cursor_api_key": "", "agent_model": ""}


def _migrate_vision_columns(cur) -> None:
    cur.execute("SHOW COLUMNS FROM user_ai_config LIKE 'vision_api_base_url'")
    if cur.fetchone():
        return
    cur.execute(
        "ALTER TABLE user_ai_config "
        "ADD COLUMN vision_api_base_url VARCHAR(512) NOT NULL DEFAULT '' AFTER temperature, "
        "ADD COLUMN vision_api_key VARCHAR(512) NOT NULL DEFAULT '' AFTER vision_api_base_url, "
        "ADD COLUMN vision_model VARCHAR(256) NOT NULL DEFAULT '' AFTER vision_api_key"
    )


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _normalize_temperature(value: Any) -> float:
    try:
        temp = float(value)
    except (TypeError, ValueError):
        temp = 0.1
    return max(0.0, min(2.0, temp))


def is_user_ai_configured(cfg: dict[str, Any] | None) -> bool:
    if not cfg:
        return False
    return bool(
        str(cfg.get("base_url") or "").strip()
        and str(cfg.get("api_key") or "").strip()
        and str(cfg.get("model") or "").strip()
    )


def is_user_vision_configured(cfg: dict[str, Any] | None) -> bool:
    if not cfg:
        return False
    return bool(
        str(cfg.get("vision_api_base_url") or "").strip()
        and str(cfg.get("vision_api_key") or "").strip()
        and str(cfg.get("vision_model") or "").strip()
    )


def get_user_ai_config(user_id: str) -> Optional[dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return None
    ensure_user_ai_config_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT base_url, api_key, model, temperature,
                       vision_api_base_url, vision_api_key, vision_model,
                       cursor_api_key, agent_model, updated_at
                FROM user_ai_config WHERE user_id = %s LIMIT 1
                """,
                (uid,),
            )
            row = cur.fetchone()
        if not row:
            return None
        result = {
            "base_url": str(row.get("base_url") or "").strip(),
            "api_key": str(row.get("api_key") or "").strip(),
            "model": str(row.get("model") or "").strip(),
            "temperature": float(row.get("temperature") or 0.1),
            "vision_api_base_url": str(row.get("vision_api_base_url") or "").strip(),
            "vision_api_key": str(row.get("vision_api_key") or "").strip(),
            "vision_model": str(row.get("vision_model") or "").strip(),
            "cursor_api_key": str(row.get("cursor_api_key") or "").strip(),
            "agent_model": _normalize_agent_model(row.get("agent_model")),
            "updated_at": row.get("updated_at"),
        }
        if not result["cursor_api_key"]:
            try:
                from core.services.ui_automation.uia_scenario_config_db import get_uia_scenario_config
                legacy = get_uia_scenario_config(uid) or {}
                legacy_key = str(legacy.get("cursor_api_key") or "").strip()
                if legacy_key:
                    result["cursor_api_key"] = legacy_key
                    if not result["agent_model"]:
                        result["agent_model"] = _normalize_agent_model(legacy.get("agent_model"))
            except Exception:
                pass
        return result
    finally:
        conn.close()


def save_user_ai_config(user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    uid = str(user_id or "").strip()
    if not uid:
        raise ValueError("请先登录")
    base_url = str(data.get("base_url") or "").strip()
    api_key = str(data.get("api_key") or "").strip()
    model = str(data.get("model") or "").strip()
    temperature = _normalize_temperature(data.get("temperature", 0.1))
    vision_api_base_url = str(data.get("vision_api_base_url") or "").strip()
    vision_api_key = str(data.get("vision_api_key") or "").strip()
    vision_model = str(data.get("vision_model") or "").strip()
    cursor_api_key = str(data.get("cursor_api_key") or "").strip()
    agent_model = _normalize_agent_model(data.get("agent_model"))
    if cursor_api_key and not agent_model:
        raise ValueError("已填写 Cursor API Key，请选择 Agent 模型")
    if not cursor_api_key:
        agent_model = ""
    ensure_user_ai_config_table()
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_ai_config
                    (user_id, base_url, api_key, model, temperature,
                     vision_api_base_url, vision_api_key, vision_model,
                     cursor_api_key, agent_model, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    base_url = VALUES(base_url),
                    api_key = VALUES(api_key),
                    model = VALUES(model),
                    temperature = VALUES(temperature),
                    vision_api_base_url = VALUES(vision_api_base_url),
                    vision_api_key = VALUES(vision_api_key),
                    vision_model = VALUES(vision_model),
                    cursor_api_key = VALUES(cursor_api_key),
                    agent_model = VALUES(agent_model),
                    updated_at = VALUES(updated_at)
                """,
                (
                    uid,
                    base_url,
                    api_key,
                    model,
                    temperature,
                    vision_api_base_url,
                    vision_api_key,
                    vision_model,
                    cursor_api_key,
                    agent_model,
                    now,
                ),
            )
        conn.commit()
    finally:
        conn.close()
    if not cursor_api_key:
        _clear_legacy_cursor_agent_config(uid)
    saved = {
        "base_url": base_url,
        "api_key": api_key,
        "model": model,
        "temperature": temperature,
        "vision_api_base_url": vision_api_base_url,
        "vision_api_key": vision_api_key,
        "vision_model": vision_model,
        "cursor_api_key": cursor_api_key,
        "agent_model": agent_model,
        "updated_at": now,
        "cursor_agent_configured": is_user_cursor_agent_configured(
            {"cursor_api_key": cursor_api_key, "agent_model": agent_model}
        ),
        "configured": is_user_ai_configured(
            {"base_url": base_url, "api_key": api_key, "model": model}
        ),
        "vision_configured": is_user_vision_configured(
            {
                "vision_api_base_url": vision_api_base_url,
                "vision_api_key": vision_api_key,
                "vision_model": vision_model,
            }
        ),
    }
    return saved
