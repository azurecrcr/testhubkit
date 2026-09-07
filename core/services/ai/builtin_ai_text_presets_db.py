"""文本 AI 多预设（Tab）：MySQL 存储 + 全局激活槽位。"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from core.services.feedback.feedback_db import get_connection

PRESET_SLOT_COUNT = 3

_PRESETS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS builtin_ai_text_presets (
    slot TINYINT NOT NULL PRIMARY KEY,
    label VARCHAR(80) NOT NULL DEFAULT '',
    base_url VARCHAR(500) NOT NULL DEFAULT '',
    api_key VARCHAR(500) NOT NULL DEFAULT '',
    model VARCHAR(200) NOT NULL DEFAULT '',
    temperature DECIMAL(4, 2) NOT NULL DEFAULT 0.10,
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def _ensure_active_slot_column(cur) -> None:
    cur.execute(
        """
        SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'builtin_ai_config'
          AND COLUMN_NAME = 'active_text_slot'
        """
    )
    row = cur.fetchone()
    if row and int(row.get("cnt") or 0) == 0:
        cur.execute(
            """
            ALTER TABLE builtin_ai_config
            ADD COLUMN active_text_slot TINYINT NOT NULL DEFAULT 1
            AFTER temperature
            """
        )


def ensure_text_presets_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_PRESETS_TABLE_SQL)
            _ensure_active_slot_column(cur)
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            for slot in range(1, PRESET_SLOT_COUNT + 1):
                cur.execute(
                    """
                    INSERT IGNORE INTO builtin_ai_text_presets
                        (slot, label, base_url, api_key, model, temperature, updated_at)
                    VALUES (%s, %s, '', '', '', 0.10, %s)
                    """,
                    (slot, f"预设 {slot}", now),
                )
    finally:
        conn.close()
    _migrate_legacy_row_to_presets()


def _migrate_legacy_row_to_presets() -> None:
    """将旧版 builtin_ai_config 单行文本字段迁移到预设 1。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT base_url, api_key, model, temperature, active_text_slot
                FROM builtin_ai_config WHERE id = 1 LIMIT 1
                """
            )
            main = cur.fetchone()
            cur.execute(
                """
                SELECT base_url, api_key, model FROM builtin_ai_text_presets
                WHERE slot = 1 LIMIT 1
                """
            )
            p1 = cur.fetchone()
            if not main or not p1:
                return
            has_legacy = bool(
                (main.get("base_url") or "").strip()
                or (main.get("api_key") or "").strip()
                or (main.get("model") or "").strip()
            )
            p1_empty = not (
                (p1.get("base_url") or "").strip()
                or (p1.get("api_key") or "").strip()
                or (p1.get("model") or "").strip()
            )
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            if has_legacy and p1_empty:
                cur.execute(
                    """
                    UPDATE builtin_ai_text_presets
                    SET base_url = %s, api_key = %s, model = %s,
                        temperature = %s, updated_at = %s
                    WHERE slot = 1
                    """,
                    (
                        (main.get("base_url") or "").strip(),
                        (main.get("api_key") or "").strip(),
                        (main.get("model") or "").strip(),
                        float(main.get("temperature") or 0.1),
                        now,
                    ),
                )
            active = int(main.get("active_text_slot") or 1)
            if active < 1 or active > PRESET_SLOT_COUNT:
                active = 1
            cur.execute(
                "UPDATE builtin_ai_config SET active_text_slot = %s WHERE id = 1",
                (active,),
            )
    finally:
        conn.close()


def get_active_text_slot() -> int:
    ensure_text_presets_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT active_text_slot FROM builtin_ai_config WHERE id = 1 LIMIT 1"
            )
            row = cur.fetchone()
            if not row:
                return 1
            slot = int(row.get("active_text_slot") or 1)
            if slot < 1 or slot > PRESET_SLOT_COUNT:
                return 1
            return slot
    finally:
        conn.close()


def set_active_text_slot(slot: int) -> int:
    ensure_text_presets_table()
    slot = max(1, min(PRESET_SLOT_COUNT, int(slot)))
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO builtin_ai_config (id, base_url, api_key, model, temperature,
                    active_text_slot, image_model, updated_at)
                VALUES (1, '', '', '', 0.10, %s, 'dall-e-3', %s)
                ON DUPLICATE KEY UPDATE active_text_slot = VALUES(active_text_slot),
                    updated_at = VALUES(updated_at)
                """,
                (slot, now),
            )
    finally:
        conn.close()
    return slot


def _row_to_preset(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "slot": int(row["slot"]),
        "label": (row.get("label") or "").strip() or f"预设 {row['slot']}",
        "base_url": (row.get("base_url") or "").strip(),
        "api_key": (row.get("api_key") or "").strip(),
        "model": (row.get("model") or "").strip(),
        "temperature": float(row.get("temperature") or 0.1),
    }


def list_text_presets() -> list[dict[str, Any]]:
    ensure_text_presets_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT slot, label, base_url, api_key, model, temperature
                FROM builtin_ai_text_presets
                ORDER BY slot ASC
                """
            )
            rows = cur.fetchall() or []
            presets = [_row_to_preset(r) for r in rows]
            if len(presets) >= PRESET_SLOT_COUNT:
                return presets[:PRESET_SLOT_COUNT]
            by_slot = {p["slot"]: p for p in presets}
            out: list[dict[str, Any]] = []
            for slot in range(1, PRESET_SLOT_COUNT + 1):
                out.append(
                    by_slot.get(slot)
                    or {
                        "slot": slot,
                        "label": f"预设 {slot}",
                        "base_url": "",
                        "api_key": "",
                        "model": "",
                        "temperature": 0.1,
                    }
                )
            return out
    finally:
        conn.close()


def get_active_text_preset() -> dict[str, Any] | None:
    slot = get_active_text_slot()
    for p in list_text_presets():
        if p["slot"] == slot:
            if (p.get("base_url") or p.get("api_key") or p.get("model")):
                return dict(p)
            return None
    return None


def save_text_preset(
    slot: int,
    *,
    base_url: str,
    api_key: str,
    model: str,
    temperature: float,
    label: str | None = None,
) -> dict[str, Any]:
    ensure_text_presets_table()
    slot = max(1, min(PRESET_SLOT_COUNT, int(slot)))
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if label is None:
                cur.execute(
                    "SELECT label FROM builtin_ai_text_presets WHERE slot = %s LIMIT 1",
                    (slot,),
                )
                row = cur.fetchone()
                label = (row.get("label") if row else None) or f"预设 {slot}"
            cur.execute(
                """
                INSERT INTO builtin_ai_text_presets
                    (slot, label, base_url, api_key, model, temperature, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    label = VALUES(label),
                    base_url = VALUES(base_url),
                    api_key = VALUES(api_key),
                    model = VALUES(model),
                    temperature = VALUES(temperature),
                    updated_at = VALUES(updated_at)
                """,
                (
                    slot,
                    (label or f"预设 {slot}").strip() or f"预设 {slot}",
                    base_url.strip(),
                    api_key.strip(),
                    model.strip(),
                    temperature,
                    now,
                ),
            )
    finally:
        conn.close()
    return _row_to_preset(
        {
            "slot": slot,
            "label": label,
            "base_url": base_url,
            "api_key": api_key,
            "model": model,
            "temperature": temperature,
        }
    )


def save_text_presets_batch(
    presets: list[dict[str, Any]], *, active_slot: int | None = None
) -> tuple[list[dict[str, Any]], int]:
    saved: list[dict[str, Any]] = []
    for raw in presets:
        try:
            slot = int(raw.get("slot"))
        except (TypeError, ValueError):
            continue
        if slot < 1 or slot > PRESET_SLOT_COUNT:
            continue
        try:
            temp = float(raw.get("temperature", 0.1))
        except (TypeError, ValueError):
            temp = 0.1
        saved.append(
            save_text_preset(
                slot,
                base_url=str(raw.get("base_url") or ""),
                api_key=str(raw.get("api_key") or ""),
                model=str(raw.get("model") or ""),
                temperature=temp,
                label=str(raw.get("label") or f"预设 {slot}"),
            )
        )
    slot = set_active_text_slot(active_slot) if active_slot is not None else get_active_text_slot()
    return saved, slot


def get_active_text_config_for_runtime() -> dict[str, Any] | None:
    """供 get_stored_builtin_ai_config 使用的当前激活文本预设。"""
    preset = get_active_text_preset()
    if not preset:
        return None
    return {
        "base_url": preset["base_url"],
        "api_key": preset["api_key"],
        "model": preset["model"],
        "temperature": preset["temperature"],
    }
