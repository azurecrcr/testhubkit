"""附件与上下文持久化。"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from typing import Any

from core.services.test_cases.mysql_db import get_connection

_ASSETS_SQL = """
CREATE TABLE IF NOT EXISTS tc_visual_assets (
    id CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(32) NULL,
    session_id CHAR(32) NULL,
    asset_type VARCHAR(24) NOT NULL DEFAULT 'other',
    mime_type VARCHAR(64) NOT NULL DEFAULT '',
    storage_key VARCHAR(512) NOT NULL,
    thumb_key VARCHAR(512) NULL,
    parse_status VARCHAR(24) NOT NULL DEFAULT 'pending',
    parse_result_json MEDIUMTEXT NULL,
    lanhu_page_id VARCHAR(64) NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NULL,
    INDEX idx_tc_visual_assets_user (user_id, created_at),
    INDEX idx_tc_visual_assets_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_CONTEXTS_SQL = """
CREATE TABLE IF NOT EXISTS tc_visual_contexts (
    id CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(32) NULL,
    asset_ids_json TEXT NOT NULL,
    prompt_block MEDIUMTEXT NOT NULL,
    include_in_generation TINYINT(1) NOT NULL DEFAULT 1,
    include_in_validation TINYINT(1) NOT NULL DEFAULT 1,
    meta_json MEDIUMTEXT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NULL,
    INDEX idx_tc_visual_ctx_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def ensure_tables() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_ASSETS_SQL)
            cur.execute(_CONTEXTS_SQL)
    finally:
        conn.close()


def _is_row_expired(row: dict[str, Any] | None) -> bool:
    if not row:
        return True
    exp = row.get("expires_at")
    if not exp:
        return False
    if hasattr(exp, "strftime"):
        exp_dt = exp
    else:
        try:
            exp_dt = datetime.strptime(str(exp)[:19], "%Y-%m-%d %H:%M:%S")
        except Exception:
            return False
    return exp_dt <= datetime.now()


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _expires(days: int = 7) -> str:
    return (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")


def insert_asset(
    *,
    user_id: str | None,
    asset_type: str,
    mime_type: str,
    storage_key: str,
    thumb_key: str | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    ensure_tables()
    asset_id = uuid.uuid4().hex
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_visual_assets
                    (id, user_id, session_id, asset_type, mime_type, storage_key,
                     thumb_key, parse_status, created_at, expires_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s)
                """,
                (
                    asset_id,
                    user_id,
                    session_id,
                    asset_type,
                    mime_type,
                    storage_key,
                    thumb_key,
                    now,
                    _expires(),
                ),
            )
        conn.commit()
    finally:
        conn.close()
    return {
        "id": asset_id,
        "asset_type": asset_type,
        "mime_type": mime_type,
        "storage_key": storage_key,
        "thumb_key": thumb_key,
        "parse_status": "pending",
    }


def update_asset_parse(
    asset_id: str,
    *,
    parse_status: str,
    parse_result: dict[str, Any] | None = None,
    asset_type: str | None = None,
) -> None:
    ensure_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tc_visual_assets
                SET parse_status = %s, parse_result_json = %s, asset_type = COALESCE(%s, asset_type)
                WHERE id = %s
                """,
                (
                    parse_status,
                    json.dumps(parse_result or {}, ensure_ascii=False),
                    asset_type,
                    asset_id,
                ),
            )
        conn.commit()
    finally:
        conn.close()


def get_asset(asset_id: str, user_id: str | None) -> dict[str, Any] | None:
    ensure_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if user_id:
                cur.execute(
                    "SELECT * FROM tc_visual_assets WHERE id = %s AND user_id = %s",
                    (asset_id, user_id),
                )
            else:
                cur.execute("SELECT * FROM tc_visual_assets WHERE id = %s", (asset_id,))
            row = cur.fetchone()
        if not row or _is_row_expired(row):
            return None
        return _row_asset(row)
    finally:
        conn.close()


def delete_asset(asset_id: str, user_id: str | None) -> bool:
    ensure_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if user_id:
                cur.execute(
                    "DELETE FROM tc_visual_assets WHERE id = %s AND user_id = %s",
                    (asset_id, user_id),
                )
            else:
                cur.execute("DELETE FROM tc_visual_assets WHERE id = %s", (asset_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    finally:
        conn.close()


def _row_asset(row: dict[str, Any]) -> dict[str, Any]:
    pr = row.get("parse_result_json")
    parse_result: dict[str, Any] = {}
    if pr:
        try:
            parse_result = json.loads(pr) if isinstance(pr, str) else pr
        except Exception:
            parse_result = {}
    return {
        "id": row.get("id"),
        "user_id": row.get("user_id"),
        "asset_type": row.get("asset_type") or "other",
        "mime_type": row.get("mime_type") or "",
        "storage_key": row.get("storage_key") or "",
        "thumb_key": row.get("thumb_key"),
        "parse_status": row.get("parse_status") or "pending",
        "parse_result": parse_result,
    }


def insert_context(
    *,
    user_id: str | None,
    asset_ids: list[str],
    prompt_block: str,
    include_in_generation: bool = True,
    include_in_validation: bool = True,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ensure_tables()
    ctx_id = uuid.uuid4().hex
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_visual_contexts
                    (id, user_id, asset_ids_json, prompt_block, include_in_generation,
                     include_in_validation, meta_json, created_at, expires_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    ctx_id,
                    user_id,
                    json.dumps(asset_ids),
                    prompt_block,
                    1 if include_in_generation else 0,
                    1 if include_in_validation else 0,
                    json.dumps(meta or {}, ensure_ascii=False),
                    now,
                    _expires(),
                ),
            )
        conn.commit()
    finally:
        conn.close()
    return {
        "id": ctx_id,
        "prompt_block": prompt_block,
        "meta": meta or {},
    }


def get_context(context_id: str, user_id: str | None) -> dict[str, Any] | None:
    ensure_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if user_id:
                cur.execute(
                    "SELECT * FROM tc_visual_contexts WHERE id = %s AND user_id = %s",
                    (context_id, user_id),
                )
            else:
                cur.execute("SELECT * FROM tc_visual_contexts WHERE id = %s", (context_id,))
            row = cur.fetchone()
        if not row:
            return None
        meta = row.get("meta_json")
        try:
            meta_obj = json.loads(meta) if isinstance(meta, str) and meta else {}
        except Exception:
            meta_obj = {}
        asset_ids_raw = row.get("asset_ids_json")
        try:
            asset_ids = json.loads(asset_ids_raw) if asset_ids_raw else []
        except Exception:
            asset_ids = []
        if not isinstance(asset_ids, list):
            asset_ids = []
        return {
            "id": row.get("id"),
            "user_id": row.get("user_id"),
            "asset_ids": [str(x).strip() for x in asset_ids if str(x).strip()],
            "prompt_block": row.get("prompt_block") or "",
            "include_in_generation": bool(row.get("include_in_generation")),
            "include_in_validation": bool(row.get("include_in_validation")),
            "meta": meta_obj,
        }
    finally:
        conn.close()


def list_expired_assets(*, limit: int = 200) -> list[dict[str, Any]]:
    ensure_tables()
    lim = max(1, min(int(limit or 200), 1000))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                '''
                SELECT id, user_id, storage_key, thumb_key
                FROM tc_visual_assets
                WHERE expires_at IS NOT NULL AND expires_at < NOW()
                ORDER BY expires_at ASC
                LIMIT %s
                ''',
                (lim,),
            )
            return list(cur.fetchall() or [])
    finally:
        conn.close()


def list_expired_contexts(*, limit: int = 200) -> list[dict[str, Any]]:
    ensure_tables()
    lim = max(1, min(int(limit or 200), 1000))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                '''
                SELECT id
                FROM tc_visual_contexts
                WHERE expires_at IS NOT NULL AND expires_at < NOW()
                ORDER BY expires_at ASC
                LIMIT %s
                ''',
                (lim,),
            )
            return list(cur.fetchall() or [])
    finally:
        conn.close()


def delete_context(context_id: str) -> bool:
    ensure_tables()
    cid = str(context_id or "").strip()
    if not cid:
        return False
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute('DELETE FROM tc_visual_contexts WHERE id = %s', (cid,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    finally:
        conn.close()
