"""内网预设 AI 连接配置（MySQL 单例行，覆盖环境变量默认值）。"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from core.services.feedback.feedback_db import get_connection

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS builtin_ai_config (
    id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
    base_url VARCHAR(500) NOT NULL,
    api_key VARCHAR(500) NOT NULL,
    model VARCHAR(200) NOT NULL,
    temperature DECIMAL(4, 2) NOT NULL DEFAULT 0.10,
    image_model VARCHAR(200) NOT NULL DEFAULT 'dall-e-3',
    vision_api_base_url VARCHAR(500) NOT NULL DEFAULT '',
    vision_api_key VARCHAR(500) NOT NULL DEFAULT '',
    vision_model VARCHAR(200) NOT NULL DEFAULT 'gpt-4o',
    locator_vision_fallback TINYINT(1) NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_EXTRA_COLUMNS: tuple[tuple[str, str], ...] = (
    (
        "image_model",
        """
        ALTER TABLE builtin_ai_config
        ADD COLUMN image_model VARCHAR(200) NOT NULL DEFAULT 'dall-e-3'
        AFTER temperature
        """,
    ),
    (
        "vision_api_base_url",
        """
        ALTER TABLE builtin_ai_config
        ADD COLUMN vision_api_base_url VARCHAR(500) NOT NULL DEFAULT ''
        AFTER image_model
        """,
    ),
    (
        "vision_api_key",
        """
        ALTER TABLE builtin_ai_config
        ADD COLUMN vision_api_key VARCHAR(500) NOT NULL DEFAULT ''
        AFTER vision_api_base_url
        """,
    ),
    (
        "vision_model",
        """
        ALTER TABLE builtin_ai_config
        ADD COLUMN vision_model VARCHAR(200) NOT NULL DEFAULT 'gpt-4o'
        AFTER vision_api_key
        """,
    ),
    (
        "locator_vision_fallback",
        """
        ALTER TABLE builtin_ai_config
        ADD COLUMN locator_vision_fallback TINYINT(1) NOT NULL DEFAULT 1
        AFTER vision_model
        """,
    ),
    (
        "cursor_api_key",
        """
        ALTER TABLE builtin_ai_config
        ADD COLUMN cursor_api_key VARCHAR(512) NOT NULL DEFAULT ''
        AFTER locator_vision_fallback
        """,
    ),
    (
        "agent_model",
        """
        ALTER TABLE builtin_ai_config
        ADD COLUMN agent_model VARCHAR(128) NOT NULL DEFAULT ''
        AFTER cursor_api_key
        """,
    ),
)


def _ensure_column(cur, name: str, ddl: str) -> None:
    cur.execute(
        """
        SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'builtin_ai_config'
          AND COLUMN_NAME = %s
        """,
        (name,),
    )
    row = cur.fetchone()
    if row and int(row.get("cnt") or 0) == 0:
        cur.execute(ddl)


def ensure_builtin_ai_config_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
            for name, ddl in _EXTRA_COLUMNS:
                _ensure_column(cur, name, ddl)
    finally:
        conn.close()
    try:
        from core.services.ai.builtin_ai_text_presets_db import ensure_text_presets_table

        ensure_text_presets_table()
    except Exception:
        pass


def _row_to_ai_config(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "base_url": (row["base_url"] or "").strip(),
        "api_key": (row["api_key"] or "").strip(),
        "model": (row["model"] or "").strip(),
        "temperature": float(row["temperature"]),
        "image_model": (row.get("image_model") or "dall-e-3").strip() or "dall-e-3",
    }


def _row_to_vision_config(row: dict[str, Any]) -> dict[str, Any]:
    from core.services.ai.omniflow_vision_config import with_auto_locator_vision_fallback

    return with_auto_locator_vision_fallback(
        {
            "vision_api_base_url": (row.get("vision_api_base_url") or "").strip(),
            "vision_api_key": (row.get("vision_api_key") or "").strip(),
            "vision_model": (row.get("vision_model") or "gpt-4o").strip() or "gpt-4o",
            "source": "database",
        }
    )


def get_stored_builtin_ai_config() -> Optional[Dict[str, Any]]:
    text_cfg: Optional[Dict[str, Any]] = None
    try:
        from core.services.ai.builtin_ai_text_presets_db import (
            get_active_text_config_for_runtime,
        )

        text_cfg = get_active_text_config_for_runtime()
    except Exception:
        text_cfg = None

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT base_url, api_key, model, temperature, image_model
                FROM builtin_ai_config
                WHERE id = 1
                LIMIT 1
                """
            )
            row = cur.fetchone()
            if text_cfg:
                return {
                    "base_url": text_cfg["base_url"],
                    "api_key": text_cfg["api_key"],
                    "model": text_cfg["model"],
                    "temperature": text_cfg["temperature"],
                    "image_model": (row.get("image_model") if row else "dall-e-3")
                    or "dall-e-3",
                }
            if not row:
                return None
            return _row_to_ai_config(row)
    finally:
        conn.close()


def get_stored_builtin_cursor_agent_config() -> dict[str, str]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT cursor_api_key, agent_model
                FROM builtin_ai_config
                WHERE id = 1
                LIMIT 1
                """
            )
            row = cur.fetchone() or {}
            return {
                "cursor_api_key": str(row.get("cursor_api_key") or "").strip(),
                "agent_model": str(row.get("agent_model") or "").strip(),
            }
    finally:
        conn.close()


def get_stored_omniflow_vision_config() -> Optional[Dict[str, Any]]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT vision_api_base_url, vision_api_key, vision_model
                FROM builtin_ai_config
                WHERE id = 1
                LIMIT 1
                """
            )
            row = cur.fetchone()
            if not row:
                return None
            return _row_to_vision_config(row)
    finally:
        conn.close()


_vision_seed_checked = False


def ensure_vision_seeded_from_env() -> None:
    """DB 已有文本 AI 行但视觉 URL/Key 为空时，从 /omniflow/.env 回填一次。

    进程内只检查一次：热路径（attachments/status、builtin-ai GET）不应反复扫库/读 env。
    """
    global _vision_seed_checked
    if _vision_seed_checked:
        return
    stored = get_stored_builtin_ai_config()
    if not stored:
        _vision_seed_checked = True
        return
    vision = get_stored_omniflow_vision_config()
    if vision and (
        (vision.get("vision_api_base_url") or "").strip()
        or (vision.get("vision_api_key") or "").strip()
    ):
        _vision_seed_checked = True
        return
    try:
        from core.config.ai_preset import get_env_image_model
        from core.services.ai.omniflow_vision_config import get_env_omniflow_vision_config

        env = get_env_omniflow_vision_config()
    except Exception:
        _vision_seed_checked = True
        return
    if not (env.get("vision_api_base_url") or env.get("vision_api_key")):
        _vision_seed_checked = True
        return
    save_builtin_ai_config(
        base_url=stored["base_url"],
        api_key=stored["api_key"],
        model=stored["model"],
        temperature=float(stored["temperature"]),
        image_model=stored.get("image_model") or get_env_image_model(),
        vision_api_base_url=env.get("vision_api_base_url") or "",
        vision_api_key=env.get("vision_api_key") or "",
        vision_model=env.get("vision_model") or "gpt-4o",
    )
    _vision_seed_checked = True


def save_builtin_ai_config(
    *,
    base_url: str,
    api_key: str,
    model: str,
    temperature: float,
    image_model: str,
    vision_api_base_url: str | None = None,
    vision_api_key: str | None = None,
    vision_model: str | None = None,
    cursor_api_key: str | None = None,
    agent_model: str | None = None,
) -> Dict[str, Any]:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    image_model = (image_model or "dall-e-3").strip() or "dall-e-3"

    existing_vision = get_stored_omniflow_vision_config()
    env_vision = None
    if not existing_vision:
        try:
            from core.services.ai.omniflow_vision_config import get_env_omniflow_vision_config

            env_vision = get_env_omniflow_vision_config()
        except Exception:
            env_vision = None
    fallback_vision = existing_vision or env_vision or {}
    if vision_api_base_url is None:
        vision_api_base_url = fallback_vision.get("vision_api_base_url") or ""
    if vision_api_key is None:
        vision_api_key = fallback_vision.get("vision_api_key") or ""
    if vision_model is None:
        vision_model = fallback_vision.get("vision_model") or "gpt-4o"

    vision_api_base_url = (vision_api_base_url or "").strip()
    vision_api_key = (vision_api_key or "").strip()
    vision_model = (vision_model or "gpt-4o").strip() or "gpt-4o"

    existing_cursor = get_stored_builtin_cursor_agent_config()
    if cursor_api_key is None:
        cursor_api_key = existing_cursor.get("cursor_api_key") or ""
    if agent_model is None:
        agent_model = existing_cursor.get("agent_model") or ""
    cursor_api_key = str(cursor_api_key or "").strip()
    agent_model = str(agent_model or "").strip()
    if not cursor_api_key:
        agent_model = ""
    try:
        from core.services.ai.omniflow_vision_config import is_omniflow_vision_configured

        fallback_int = 1 if is_omniflow_vision_configured(
            {
                "vision_api_base_url": vision_api_base_url,
                "vision_api_key": vision_api_key,
                "vision_model": vision_model,
            }
        ) else 0
    except Exception:
        fallback_int = 0

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for name, ddl in _EXTRA_COLUMNS:
                _ensure_column(cur, name, ddl)
            cur.execute(
                """
                INSERT INTO builtin_ai_config
                    (id, base_url, api_key, model, temperature, image_model,
                     vision_api_base_url, vision_api_key, vision_model,
                     locator_vision_fallback, cursor_api_key, agent_model, updated_at)
                VALUES (1, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    base_url = VALUES(base_url),
                    api_key = VALUES(api_key),
                    model = VALUES(model),
                    temperature = VALUES(temperature),
                    image_model = VALUES(image_model),
                    vision_api_base_url = VALUES(vision_api_base_url),
                    vision_api_key = VALUES(vision_api_key),
                    vision_model = VALUES(vision_model),
                    locator_vision_fallback = VALUES(locator_vision_fallback),
                    cursor_api_key = VALUES(cursor_api_key),
                    agent_model = VALUES(agent_model),
                    updated_at = VALUES(updated_at)
                """,
                (
                    base_url,
                    api_key,
                    model,
                    temperature,
                    image_model,
                    vision_api_base_url,
                    vision_api_key,
                    vision_model,
                    fallback_int,
                    cursor_api_key,
                    agent_model,
                    now,
                ),
            )
    finally:
        conn.close()

    try:
        from core.services.ai.builtin_ai_text_presets_db import (
            get_active_text_slot,
            save_text_preset,
        )

        save_text_preset(
            get_active_text_slot(),
            base_url=base_url,
            api_key=api_key,
            model=model,
            temperature=temperature,
        )
    except Exception:
        pass

    result = {
        "base_url": base_url,
        "api_key": api_key,
        "model": model,
        "temperature": temperature,
        "image_model": image_model,
    }
    result.update(
        {
            "vision_api_base_url": vision_api_base_url,
            "vision_api_key": vision_api_key,
            "vision_model": vision_model,
            "cursor_api_key": cursor_api_key,
            "agent_model": agent_model,
        }
    )
    return result
