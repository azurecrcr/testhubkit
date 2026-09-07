# -*- coding: utf-8 -*-
"""压测造数 JMeter AI 对话落库（DB，与用例工作台会话隔离）。"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta
from typing import Any

from core.services.test_cases.mysql_db import get_connection

RETENTION_DAYS = 30
MAX_TURNS_PER_USER = 100
MAX_JSON_CHARS = 512_000

_SESSIONS_SQL = """
CREATE TABLE IF NOT EXISTS jms_ai_chat_sessions (
    id CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(32) NOT NULL,
    client_session_id VARCHAR(64) NOT NULL,
    title VARCHAR(128) NOT NULL DEFAULT '',
    tg_name VARCHAR(64) NOT NULL DEFAULT '',
    turn_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_jms_ai_chat_sess_user_client (user_id, client_session_id),
    INDEX idx_jms_ai_chat_sess_user_updated (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_TURNS_SQL = """
CREATE TABLE IF NOT EXISTS jms_ai_chat_turns (
    id CHAR(32) NOT NULL PRIMARY KEY,
    session_id CHAR(32) NOT NULL,
    user_id CHAR(32) NOT NULL,
    client_turn_id VARCHAR(64) NOT NULL,
    turn_index INT NOT NULL DEFAULT 0,
    user_prompt MEDIUMTEXT NULL,
    route_mode VARCHAR(32) NOT NULL DEFAULT '',
    plan_summary MEDIUMTEXT NULL,
    plan_targets_json MEDIUMTEXT NULL,
    edit_summary MEDIUMTEXT NULL,
    operations_json MEDIUMTEXT NULL,
    error_text MEDIUMTEXT NULL,
    apply_result_json MEDIUMTEXT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_jms_ai_chat_turn_client (user_id, client_turn_id),
    INDEX idx_jms_ai_chat_turn_session (session_id, turn_index),
    INDEX idx_jms_ai_chat_turn_user_updated (user_id, updated_at),
    CONSTRAINT fk_jms_ai_chat_turn_session FOREIGN KEY (session_id)
        REFERENCES jms_ai_chat_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_tables_ready = False


def _new_id() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.utcnow()


def ensure_jms_ai_chat_tables() -> None:
    global _tables_ready
    if _tables_ready:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_SESSIONS_SQL)
            cur.execute(_TURNS_SQL)
        _tables_ready = True
    finally:
        conn.close()


def dumps_truncated(obj: Any, *, limit: int = MAX_JSON_CHARS) -> str | None:
    if obj is None:
        return None
    try:
        text = json.dumps(obj, ensure_ascii=False, default=str)
    except Exception:
        text = json.dumps({"_error": "serialize_failed", "repr": str(obj)[:2000]}, ensure_ascii=False)
    if len(text) <= limit:
        return text
    return json.dumps(
        {"truncated": True, "original_chars": len(text), "preview": text[: max(0, limit - 120)]},
        ensure_ascii=False,
    )


def begin_or_get_session(
    *,
    user_id: str,
    client_session_id: str,
    title: str = "",
    tg_name: str = "",
) -> dict[str, Any]:
    ensure_jms_ai_chat_tables()
    uid = str(user_id or "").strip()
    csid = str(client_session_id or "").strip() or _new_id()
    if not uid:
        raise ValueError("missing user_id")
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM jms_ai_chat_sessions WHERE user_id=%s AND client_session_id=%s LIMIT 1",
                (uid, csid),
            )
            row = cur.fetchone()
            if row:
                updates = []
                params: list[Any] = []
                if tg_name and str(tg_name) != str(row.get("tg_name") or ""):
                    updates.append("tg_name=%s")
                    params.append(str(tg_name)[:64])
                if title and not row.get("title"):
                    updates.append("title=%s")
                    params.append(str(title)[:128])
                if updates:
                    updates.append("updated_at=%s")
                    params.append(now)
                    params.extend([uid, csid])
                    cur.execute(
                        f"UPDATE jms_ai_chat_sessions SET {', '.join(updates)} "
                        "WHERE user_id=%s AND client_session_id=%s",
                        params,
                    )
                    cur.execute(
                        "SELECT * FROM jms_ai_chat_sessions WHERE user_id=%s AND client_session_id=%s LIMIT 1",
                        (uid, csid),
                    )
                    row = cur.fetchone()
                return row
            sid = _new_id()
            cur.execute(
                """
                INSERT INTO jms_ai_chat_sessions
                (id, user_id, client_session_id, title, tg_name, turn_count, created_at, updated_at)
                VALUES (%s,%s,%s,%s,%s,0,%s,%s)
                """,
                (sid, uid, csid, str(title or "")[:128], str(tg_name or "")[:64], now, now),
            )
            cur.execute("SELECT * FROM jms_ai_chat_sessions WHERE id=%s LIMIT 1", (sid,))
            return cur.fetchone()
    finally:
        conn.close()


def _next_turn_index(cur, session_id: str) -> int:
    cur.execute(
        "SELECT COALESCE(MAX(turn_index), 0) AS m FROM jms_ai_chat_turns WHERE session_id=%s",
        (session_id,),
    )
    row = cur.fetchone() or {}
    return int(row.get("m") or 0) + 1


def _bump_session(cur, session_id: str, now: datetime) -> None:
    cur.execute(
        """
        UPDATE jms_ai_chat_sessions
        SET turn_count = (SELECT COUNT(1) FROM jms_ai_chat_turns WHERE session_id=%s),
            updated_at=%s
        WHERE id=%s
        """,
        (session_id, now, session_id),
    )


def find_turn_by_client_turn_id(*, user_id: str, client_turn_id: str) -> dict[str, Any] | None:
    ensure_jms_ai_chat_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM jms_ai_chat_turns WHERE user_id=%s AND client_turn_id=%s LIMIT 1",
                (str(user_id), str(client_turn_id)),
            )
            return cur.fetchone()
    finally:
        conn.close()


def find_recent_open_turn_fallback(
    *,
    user_id: str,
    user_prompt: str,
    within_seconds: int = 180,
) -> dict[str, Any] | None:
    """前端漏传 client_turn_id 时：同用户+同提示词+短时间窗兜底。"""
    ensure_jms_ai_chat_tables()
    prompt = str(user_prompt or "").strip()
    if not prompt:
        return None
    since = _now() - timedelta(seconds=max(30, within_seconds))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM jms_ai_chat_turns
                WHERE user_id=%s AND user_prompt=%s AND created_at >= %s
                  AND status IN ('pending','planned','error')
                ORDER BY updated_at DESC LIMIT 1
                """,
                (str(user_id), prompt, since),
            )
            return cur.fetchone()
    finally:
        conn.close()


def upsert_plan_result(
    *,
    user_id: str,
    client_session_id: str,
    client_turn_id: str,
    user_prompt: str,
    route_mode: str = "two_pass",
    tg_name: str = "",
    plan_summary: str | None = None,
    plan_targets: Any = None,
    error_text: str | None = None,
) -> dict[str, Any]:
    ensure_jms_ai_chat_tables()
    sess = begin_or_get_session(
        user_id=user_id,
        client_session_id=client_session_id,
        title=(user_prompt or "")[:80],
        tg_name=tg_name,
    )
    now = _now()
    status = "error" if error_text else "planned"
    targets_json = dumps_truncated(plan_targets)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM jms_ai_chat_turns WHERE user_id=%s AND client_turn_id=%s LIMIT 1",
                (user_id, client_turn_id),
            )
            row = cur.fetchone()
            if row:
                cur.execute(
                    """
                    UPDATE jms_ai_chat_turns SET
                        user_prompt=COALESCE(NULLIF(%s,''), user_prompt),
                        route_mode=%s,
                        plan_summary=%s,
                        plan_targets_json=%s,
                        error_text=CASE WHEN %s IS NULL OR %s='' THEN error_text ELSE %s END,
                        status=%s,
                        updated_at=%s
                    WHERE id=%s
                    """,
                    (
                        user_prompt,
                        str(route_mode or "")[:32],
                        plan_summary,
                        targets_json,
                        error_text,
                        error_text,
                        error_text,
                        status if error_text else (row.get("status") if row.get("status") == "done" else status),
                        now,
                        row["id"],
                    ),
                )
                tid = row["id"]
            else:
                tid = _new_id()
                tidx = _next_turn_index(cur, sess["id"])
                cur.execute(
                    """
                    INSERT INTO jms_ai_chat_turns (
                        id, session_id, user_id, client_turn_id, turn_index, user_prompt, route_mode,
                        plan_summary, plan_targets_json, error_text, status, created_at, updated_at
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (
                        tid,
                        sess["id"],
                        user_id,
                        client_turn_id,
                        tidx,
                        user_prompt,
                        str(route_mode or "")[:32],
                        plan_summary,
                        targets_json,
                        error_text,
                        status,
                        now,
                        now,
                    ),
                )
            _bump_session(cur, sess["id"], now)
            cur.execute("SELECT * FROM jms_ai_chat_turns WHERE id=%s LIMIT 1", (tid,))
            out = cur.fetchone()
        prune_user_turns(user_id)
        return out
    finally:
        conn.close()


def upsert_edit_result(
    *,
    user_id: str,
    client_session_id: str,
    client_turn_id: str,
    user_prompt: str,
    route_mode: str = "two_pass",
    tg_name: str = "",
    edit_summary: str | None = None,
    operations: Any = None,
    error_text: str | None = None,
) -> dict[str, Any]:
    ensure_jms_ai_chat_tables()
    sess = begin_or_get_session(
        user_id=user_id,
        client_session_id=client_session_id,
        title=(user_prompt or "")[:80],
        tg_name=tg_name,
    )
    now = _now()
    ops_json = dumps_truncated(operations)
    status = "error" if error_text else "done"
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM jms_ai_chat_turns WHERE user_id=%s AND client_turn_id=%s LIMIT 1",
                (user_id, client_turn_id),
            )
            row = cur.fetchone()
            if not row:
                # 兜底合并：同 prompt 近期 pending/planned
                cur.execute(
                    """
                    SELECT * FROM jms_ai_chat_turns
                    WHERE user_id=%s AND user_prompt=%s AND created_at >= %s
                      AND status IN ('pending','planned')
                    ORDER BY updated_at DESC LIMIT 1
                    """,
                    (user_id, user_prompt, now - timedelta(seconds=180)),
                )
                row = cur.fetchone()
            if row:
                cur.execute(
                    """
                    UPDATE jms_ai_chat_turns SET
                        client_turn_id=%s,
                        route_mode=%s,
                        edit_summary=%s,
                        operations_json=%s,
                        error_text=CASE WHEN %s IS NULL OR %s='' THEN NULL ELSE %s END,
                        status=%s,
                        updated_at=%s
                    WHERE id=%s
                    """,
                    (
                        client_turn_id,
                        str(route_mode or row.get("route_mode") or "")[:32],
                        edit_summary,
                        ops_json,
                        error_text,
                        error_text,
                        error_text,
                        status,
                        now,
                        row["id"],
                    ),
                )
                tid = row["id"]
            else:
                tid = _new_id()
                tidx = _next_turn_index(cur, sess["id"])
                cur.execute(
                    """
                    INSERT INTO jms_ai_chat_turns (
                        id, session_id, user_id, client_turn_id, turn_index, user_prompt, route_mode,
                        edit_summary, operations_json, error_text, status, created_at, updated_at
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (
                        tid,
                        sess["id"],
                        user_id,
                        client_turn_id,
                        tidx,
                        user_prompt,
                        str(route_mode or "")[:32],
                        edit_summary,
                        ops_json,
                        error_text,
                        status,
                        now,
                        now,
                    ),
                )
            _bump_session(cur, sess["id"], now)
            cur.execute("SELECT * FROM jms_ai_chat_turns WHERE id=%s LIMIT 1", (tid,))
            out = cur.fetchone()
        prune_user_turns(user_id)
        return out
    finally:
        conn.close()


def save_apply_result(
    *,
    user_id: str,
    client_turn_id: str | None = None,
    turn_id: str | None = None,
    apply_result: Any = None,
) -> dict[str, Any] | None:
    ensure_jms_ai_chat_tables()
    now = _now()
    payload = dumps_truncated(apply_result)
    errors = None
    if isinstance(apply_result, dict):
        errors = apply_result.get("errors")
    status = "apply_partial" if errors else "done"
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            row = None
            if turn_id:
                cur.execute(
                    "SELECT * FROM jms_ai_chat_turns WHERE id=%s AND user_id=%s LIMIT 1",
                    (turn_id, user_id),
                )
                row = cur.fetchone()
            if not row and client_turn_id:
                cur.execute(
                    "SELECT * FROM jms_ai_chat_turns WHERE user_id=%s AND client_turn_id=%s LIMIT 1",
                    (user_id, client_turn_id),
                )
                row = cur.fetchone()
            if not row:
                return None
            # 若此前 error，保留 error 优先；否则按 apply 结果
            new_status = row.get("status") if row.get("status") == "error" else status
            cur.execute(
                """
                UPDATE jms_ai_chat_turns
                SET apply_result_json=%s, status=%s, updated_at=%s
                WHERE id=%s
                """,
                (payload, new_status, now, row["id"]),
            )
            cur.execute("SELECT * FROM jms_ai_chat_turns WHERE id=%s LIMIT 1", (row["id"],))
            return cur.fetchone()
    finally:
        conn.close()


def prune_user_turns(user_id: str) -> None:
    ensure_jms_ai_chat_tables()
    uid = str(user_id or "").strip()
    if not uid:
        return
    cutoff = _now() - timedelta(days=RETENTION_DAYS)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM jms_ai_chat_turns WHERE user_id=%s AND created_at < %s",
                (uid, cutoff),
            )
            cur.execute(
                """
                SELECT id FROM jms_ai_chat_turns
                WHERE user_id=%s
                ORDER BY updated_at DESC
                """,
                (uid,),
            )
            rows = cur.fetchall() or []
            if len(rows) > MAX_TURNS_PER_USER:
                drop_ids = [r["id"] for r in rows[MAX_TURNS_PER_USER:]]
                # chunk delete
                for i in range(0, len(drop_ids), 50):
                    chunk = drop_ids[i : i + 50]
                    placeholders = ",".join(["%s"] * len(chunk))
                    cur.execute(
                        f"DELETE FROM jms_ai_chat_turns WHERE id IN ({placeholders})",
                        chunk,
                    )
            # 清理无 turn 的 session
            cur.execute(
                """
                DELETE s FROM jms_ai_chat_sessions s
                LEFT JOIN jms_ai_chat_turns t ON t.session_id = s.id
                WHERE s.user_id=%s AND t.id IS NULL
                """,
                (uid,),
            )
    finally:
        conn.close()


def list_turns_for_user(
    *,
    user_id: str,
    client_session_id: str | None = None,
    limit: int = 30,
    offset: int = 0,
) -> list[dict[str, Any]]:
    ensure_jms_ai_chat_tables()
    lim = max(1, min(int(limit or 30), 100))
    off = max(0, int(offset or 0))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if client_session_id:
                cur.execute(
                    """
                    SELECT t.* FROM jms_ai_chat_turns t
                    INNER JOIN jms_ai_chat_sessions s ON s.id = t.session_id
                    WHERE t.user_id=%s AND s.client_session_id=%s
                    ORDER BY t.updated_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (user_id, client_session_id, lim, off),
                )
            else:
                cur.execute(
                    """
                    SELECT * FROM jms_ai_chat_turns
                    WHERE user_id=%s
                    ORDER BY updated_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (user_id, lim, off),
                )
            return list(cur.fetchall() or [])
    finally:
        conn.close()


def get_turn(*, turn_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    ensure_jms_ai_chat_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if user_id:
                cur.execute(
                    "SELECT * FROM jms_ai_chat_turns WHERE id=%s AND user_id=%s LIMIT 1",
                    (turn_id, user_id),
                )
            else:
                cur.execute("SELECT * FROM jms_ai_chat_turns WHERE id=%s LIMIT 1", (turn_id,))
            return cur.fetchone()
    finally:
        conn.close()


def resolve_user_id_by_email(email: str) -> str | None:
    em = str(email or "").strip().lower()
    if not em:
        return None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM hub_users WHERE email=%s LIMIT 1", (em,))
            row = cur.fetchone()
            return str(row["id"]) if row and row.get("id") else None
    finally:
        conn.close()