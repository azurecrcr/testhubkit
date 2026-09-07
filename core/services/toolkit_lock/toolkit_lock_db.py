"""统一功能锁开关：单行配置，控制工作台敏感按钮是否上锁。"""

from __future__ import annotations

import copy
import os
import time
from datetime import datetime
from typing import Any, Dict

from core.services.feedback.feedback_db import get_connection

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS toolkit_lock_switch (
    id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
    is_locked TINYINT(1) NOT NULL DEFAULT 1,
    prompt_cards_blur TINYINT(1) NOT NULL DEFAULT 1,
    uia_run_blocked TINYINT(1) NOT NULL DEFAULT 1,
    label VARCHAR(120) NOT NULL DEFAULT '敏感功能统一上锁',
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def _ensure_column(cur, name: str, ddl: str) -> None:
    cur.execute(
        """
        SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'toolkit_lock_switch'
          AND COLUMN_NAME = %s
        """,
        (name,),
    )
    row = cur.fetchone()
    if row and int(row.get("n") or 0) > 0:
        return
    cur.execute(ddl)


def _drop_lanhu_column_if_exists(cur) -> None:
    cur.execute(
        """
        SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'toolkit_lock_switch'
          AND COLUMN_NAME = 'lanhu_mcp_blur'
        """
    )
    row = cur.fetchone()
    if row and int(row.get("n") or 0) > 0:
        cur.execute("ALTER TABLE toolkit_lock_switch DROP COLUMN lanhu_mcp_blur")


def _ensure_extra_columns(cur) -> None:
    _drop_lanhu_column_if_exists(cur)
    _ensure_column(
        cur,
        "prompt_cards_blur",
        """
        ALTER TABLE toolkit_lock_switch
        ADD COLUMN prompt_cards_blur TINYINT(1) NOT NULL DEFAULT 1
        COMMENT '1=提示词库卡片蒙层锁定，0=可点击查看复制'
        AFTER is_locked
        """,
    )
    _ensure_column(
        cur,
        "uia_run_blocked",
        """
        ALTER TABLE toolkit_lock_switch
        ADD COLUMN uia_run_blocked TINYINT(1) NOT NULL DEFAULT 1
        COMMENT '1=运行场景暂不可用弹窗 0=全站可运行'
        AFTER prompt_cards_blur
        """,
    )
    _ensure_column(
        cur,
        "uia_global_exclusive",
        """
        ALTER TABLE toolkit_lock_switch
        ADD COLUMN uia_global_exclusive TINYINT(1) NOT NULL DEFAULT 1
        COMMENT '1=全站仅一名用户可运行 0=各用户可并行运行'
        AFTER uia_run_blocked
        """,
    )
    _ensure_column(
        cur,
        "uia_tunnel_mcp_pool",
        """
        ALTER TABLE toolkit_lock_switch
        ADD COLUMN uia_tunnel_mcp_pool TINYINT(1) NOT NULL DEFAULT 1
        COMMENT '1=隧道MCP保温池开启 0=每任务结束关闭'
        AFTER uia_global_exclusive
        """,
    )
    _ensure_column(
        cur,
        "uia_tunnel_mcp_pool_max",
        """
        ALTER TABLE toolkit_lock_switch
        ADD COLUMN uia_tunnel_mcp_pool_max INT NOT NULL DEFAULT 3
        COMMENT 'idle隧道MCP保温上限'
        AFTER uia_tunnel_mcp_pool
        """,
    )
    _ensure_column(
        cur,
        "uia_tunnel_mcp_pool_ttl_sec",
        """
        ALTER TABLE toolkit_lock_switch
        ADD COLUMN uia_tunnel_mcp_pool_ttl_sec INT NOT NULL DEFAULT 1800
        COMMENT '隧道MCP保温TTL秒'
        AFTER uia_tunnel_mcp_pool_max
        """,
    )


def ensure_toolkit_lock_switch_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
            _ensure_extra_columns(cur)
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur.execute(
                """
                INSERT IGNORE INTO toolkit_lock_switch
                    (id, is_locked, prompt_cards_blur, label, updated_at)
                VALUES (1, 0, 1, '敏感功能统一上锁', %s)
                """,
                (now,),
            )
    finally:
        conn.close()


def get_toolkit_lock_status() -> Dict[str, Any]:
    """返回 is_locked：True=统一上锁（需密码或不可用），False=全部开放。"""
    ensure_toolkit_lock_switch_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT is_locked, prompt_cards_blur, uia_run_blocked, uia_global_exclusive, uia_tunnel_mcp_pool, uia_tunnel_mcp_pool_max, uia_tunnel_mcp_pool_ttl_sec, label, updated_at
                FROM toolkit_lock_switch
                WHERE id = 1
                LIMIT 1
                """
            )
            row = cur.fetchone()
            if not row:
                return {
                    "is_locked": True,
                    "prompt_cards_blur": True,
                    "uia_run_blocked": True,
                    "uia_global_exclusive": True,
                    "uia_tunnel_mcp_pool": True,
                    "uia_tunnel_mcp_pool_max": 3,
                    "uia_tunnel_mcp_pool_ttl_sec": 1800,
                    "label": "",
                    "updated_at": "",
                }
            updated = row["updated_at"]
            return {
                "is_locked": bool(row["is_locked"]),
                "prompt_cards_blur": bool(row.get("prompt_cards_blur", 1)),
                "uia_run_blocked": bool(row.get("uia_run_blocked", 1)),
                "uia_global_exclusive": bool(row.get("uia_global_exclusive", 1)),
                "uia_tunnel_mcp_pool": bool(row.get("uia_tunnel_mcp_pool", 1)),
                "uia_tunnel_mcp_pool_max": int(row.get("uia_tunnel_mcp_pool_max") or 3),
                "uia_tunnel_mcp_pool_ttl_sec": int(row.get("uia_tunnel_mcp_pool_ttl_sec") or 1800),
                "label": row["label"] or "",
                "updated_at": (
                    updated.strftime("%Y-%m-%d %H:%M:%S")
                    if hasattr(updated, "strftime")
                    else str(updated or "")
                ),
            }
    finally:
        conn.close()


_TOOLKIT_LOCK_API_CACHE: Dict[str, Any] | None = None
_TOOLKIT_LOCK_API_CACHE_AT: float = 0.0
_TOOLKIT_LOCK_API_CACHE_TTL_SEC = float(
    os.environ.get("TOOLKIT_LOCK_API_CACHE_TTL_SEC", "8")
)


def _invalidate_toolkit_lock_api_cache() -> None:
    global _TOOLKIT_LOCK_API_CACHE, _TOOLKIT_LOCK_API_CACHE_AT
    _TOOLKIT_LOCK_API_CACHE = None
    _TOOLKIT_LOCK_API_CACHE_AT = 0.0


def get_toolkit_lock_status_for_api() -> Dict[str, Any]:
    """GET /api/toolkit-lock 专用：短 TTL 缓存，避免首屏重复查库。"""
    global _TOOLKIT_LOCK_API_CACHE, _TOOLKIT_LOCK_API_CACHE_AT
    now = time.time()
    if (
        _TOOLKIT_LOCK_API_CACHE is not None
        and now - _TOOLKIT_LOCK_API_CACHE_AT < _TOOLKIT_LOCK_API_CACHE_TTL_SEC
    ):
        return copy.copy(_TOOLKIT_LOCK_API_CACHE)
    status = get_toolkit_lock_status()
    _TOOLKIT_LOCK_API_CACHE = status
    _TOOLKIT_LOCK_API_CACHE_AT = now
    return copy.copy(status)


def toolkit_is_locked() -> bool:
    return bool(get_toolkit_lock_status()["is_locked"])


def prompt_cards_are_blurred() -> bool:
    """True=提示词库卡片蒙层（暂未开发）；False=可点击查看与复制。"""
    return bool(get_toolkit_lock_status()["prompt_cards_blur"])


def set_prompt_cards_blur(blurred: bool) -> bool:
    """设置提示词库卡片蒙层状态，返回设置后的 blur 状态（True=蒙层锁定）。"""
    ensure_toolkit_lock_switch_table()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    new_blur = 1 if blurred else 0
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE toolkit_lock_switch
                SET prompt_cards_blur = %s, updated_at = %s
                WHERE id = 1
                """,
                (new_blur, now),
            )
            _invalidate_toolkit_lock_api_cache()
            return bool(new_blur)
    finally:
        conn.close()


def toggle_prompt_cards_blur() -> bool:
    """切换提示词库卡片蒙层，返回切换后的 blur 状态（True=蒙层锁定）。"""
    ensure_toolkit_lock_switch_table()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT prompt_cards_blur FROM toolkit_lock_switch WHERE id = 1 LIMIT 1"
            )
            row = cur.fetchone()
            current = bool(row.get("prompt_cards_blur", 1)) if row else True
            new_blur = 0 if current else 1
            cur.execute(
                """
                UPDATE toolkit_lock_switch
                SET prompt_cards_blur = %s, updated_at = %s
                WHERE id = 1
                """,
                (new_blur, now),
            )
            _invalidate_toolkit_lock_api_cache()
            return bool(new_blur)
    finally:
        conn.close()


def set_toolkit_switches(
    is_locked=None,
    prompt_cards_blur=None,
    uia_run_blocked=None,
    uia_global_exclusive=None,
    uia_tunnel_mcp_pool=None,
    uia_tunnel_mcp_pool_max=None,
    uia_tunnel_mcp_pool_ttl_sec=None,
):
    ensure_toolkit_lock_switch_table()
    current = get_toolkit_lock_status()
    new_locked = bool(is_locked) if is_locked is not None else bool(current["is_locked"])
    new_prompt = (
        bool(prompt_cards_blur)
        if prompt_cards_blur is not None
        else bool(current["prompt_cards_blur"])
    )
    new_uia_run_blocked = (
        bool(uia_run_blocked)
        if uia_run_blocked is not None
        else bool(current.get("uia_run_blocked", True))
    )
    new_uia_global_exclusive = (
        bool(uia_global_exclusive)
        if uia_global_exclusive is not None
        else bool(current.get("uia_global_exclusive", True))
    )
    new_uia_tunnel_mcp_pool = (
        bool(uia_tunnel_mcp_pool)
        if uia_tunnel_mcp_pool is not None
        else bool(current.get("uia_tunnel_mcp_pool", True))
    )
    try:
        new_uia_tunnel_mcp_pool_max = int(
            uia_tunnel_mcp_pool_max
            if uia_tunnel_mcp_pool_max is not None
            else current.get("uia_tunnel_mcp_pool_max", 3)
        )
    except (TypeError, ValueError):
        new_uia_tunnel_mcp_pool_max = 3
    new_uia_tunnel_mcp_pool_max = max(1, min(20, new_uia_tunnel_mcp_pool_max))
    try:
        new_uia_tunnel_mcp_pool_ttl_sec = int(
            uia_tunnel_mcp_pool_ttl_sec
            if uia_tunnel_mcp_pool_ttl_sec is not None
            else current.get("uia_tunnel_mcp_pool_ttl_sec", 1800)
        )
    except (TypeError, ValueError):
        new_uia_tunnel_mcp_pool_ttl_sec = 1800
    new_uia_tunnel_mcp_pool_ttl_sec = max(60, min(86400, new_uia_tunnel_mcp_pool_ttl_sec))
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE toolkit_lock_switch SET is_locked=%s, prompt_cards_blur=%s, uia_run_blocked=%s, uia_global_exclusive=%s, uia_tunnel_mcp_pool=%s, uia_tunnel_mcp_pool_max=%s, uia_tunnel_mcp_pool_ttl_sec=%s, updated_at=%s WHERE id=1",
                (1 if new_locked else 0, 1 if new_prompt else 0, 1 if new_uia_run_blocked else 0, 1 if new_uia_global_exclusive else 0, 1 if new_uia_tunnel_mcp_pool else 0, new_uia_tunnel_mcp_pool_max, new_uia_tunnel_mcp_pool_ttl_sec, now),
            )
    finally:
        conn.close()
    result = {"is_locked": new_locked, "prompt_cards_blur": new_prompt, "uia_run_blocked": new_uia_run_blocked, "uia_global_exclusive": new_uia_global_exclusive, "uia_tunnel_mcp_pool": new_uia_tunnel_mcp_pool, "uia_tunnel_mcp_pool_max": new_uia_tunnel_mcp_pool_max, "uia_tunnel_mcp_pool_ttl_sec": new_uia_tunnel_mcp_pool_ttl_sec}
    try:
        from core.services.ui_automation.uia_tunnel_pool_runtime_sync import sync_uia_tunnel_pool_runtime_file
        sync_uia_tunnel_pool_runtime_file(result)
    except Exception:
        pass
    _invalidate_toolkit_lock_api_cache()
    return result



def uia_global_exclusive_enabled() -> bool:
    """True=全站仅一名用户可同时运行；False=各用户可并行运行。"""
    return bool(get_toolkit_lock_status().get("uia_global_exclusive", True))
