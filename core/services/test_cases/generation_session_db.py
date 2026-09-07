"""流式生成会话表。"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from core.services.test_cases.mysql_db import get_connection

_EVENTS_SQL = """
CREATE TABLE IF NOT EXISTS tc_generation_session_events (
    session_id CHAR(32) NOT NULL,
    seq INT NOT NULL,
    event_type VARCHAR(32) NOT NULL DEFAULT '',
    payload_json MEDIUMTEXT NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (session_id, seq),
    INDEX idx_tc_gen_evt_session (session_id, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_SESSIONS_SQL = """
CREATE TABLE IF NOT EXISTS tc_generation_sessions (
    id CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(32) NULL,
    mode VARCHAR(16) NOT NULL DEFAULT 'list',
    merge_mode VARCHAR(16) NOT NULL DEFAULT 'overwrite',
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    columns_json MEDIUMTEXT NULL,
    parsed_rows INT NOT NULL DEFAULT 0,
    error_message TEXT NULL,
    duration_ms INT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    cancelled_at DATETIME NULL,
    output_text MEDIUMTEXT NULL,
    INDEX idx_tc_gen_session_user (user_id, created_at),
    INDEX idx_tc_gen_session_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_STALE_SESSION_MSG = "流式生成会话已超时或异常中断，请重新发起"


def _ensure_session_output_text_column(cur) -> None:
    cur.execute(
        """
        SELECT COUNT(*) AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tc_generation_sessions'
          AND COLUMN_NAME = 'output_text'
        """
    )
    row = cur.fetchone() or {}
    if int(row.get("c") or 0) == 0:
        cur.execute(
            "ALTER TABLE tc_generation_sessions ADD COLUMN output_text MEDIUMTEXT NULL AFTER cancelled_at"
        )


def ensure_generation_session_tables() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_SESSIONS_SQL)
            cur.execute(_EVENTS_SQL)
            _ensure_session_output_text_column(cur)
    finally:
        conn.close()


def _json_dump(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False)


def _json_load(raw: str | None, default: Any = None) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return default


def insert_session(
    *,
    session_id: str,
    user_id: str | None,
    mode: str,
    merge_mode: str,
    columns: list[str] | None,
) -> None:
    now = datetime.now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_generation_sessions
                (id, user_id, mode, merge_mode, status, columns_json,
                 parsed_rows, created_at, updated_at)
                VALUES (%s, %s, %s, %s, 'pending', %s, 0, %s, %s)
                """,
                (
                    session_id,
                    user_id,
                    mode,
                    merge_mode,
                    _json_dump(columns or []),
                    now,
                    now,
                ),
            )
    finally:
        conn.close()


def get_session(session_id: str) -> dict[str, Any] | None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM tc_generation_sessions WHERE id = %s",
                (session_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return _row_to_dict(row)
    finally:
        conn.close()


def _dt_iso(val: Any) -> str | None:
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _row_to_dict(row: dict) -> dict[str, Any]:
    return {
        "id": row["id"],
        "user_id": row.get("user_id"),
        "mode": row.get("mode") or "list",
        "merge_mode": row.get("merge_mode") or "overwrite",
        "status": row.get("status") or "pending",
        "columns": _json_load(row.get("columns_json"), []),
        "parsed_rows": int(row.get("parsed_rows") or 0),
        "error_message": row.get("error_message"),
        "duration_ms": row.get("duration_ms"),
        "created_at": _dt_iso(row.get("created_at")),
        "updated_at": _dt_iso(row.get("updated_at")),
        "cancelled_at": _dt_iso(row.get("cancelled_at")),
        "output_text": row.get("output_text") or "",
    }


def update_session(
    session_id: str,
    *,
    status: str | None = None,
    parsed_rows: int | None = None,
    error_message: str | None = None,
    duration_ms: int | None = None,
    output_text: str | None = None,
) -> None:
    fields: list[str] = []
    values: list[Any] = []
    now = datetime.now()
    if status is not None:
        fields.append("status = %s")
        values.append(status)
        if status == "cancelled":
            fields.append("cancelled_at = %s")
            values.append(now)
    if parsed_rows is not None:
        fields.append("parsed_rows = %s")
        values.append(parsed_rows)
    if error_message is not None:
        fields.append("error_message = %s")
        values.append(error_message)
    if duration_ms is not None:
        fields.append("duration_ms = %s")
        values.append(duration_ms)
    if output_text is not None:
        fields.append("output_text = %s")
        values.append(output_text)
    if not fields:
        return
    fields.append("updated_at = %s")
    values.append(now)
    values.append(session_id)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE tc_generation_sessions SET {', '.join(fields)} WHERE id = %s",
                tuple(values),
            )
    finally:
        conn.close()


def is_session_cancelled(session_id: str) -> bool:
    session = get_session(session_id)
    if not session:
        return True
    return session["status"] == "cancelled"


def cancel_session(session_id: str) -> bool:
    session = get_session(session_id)
    if not session:
        return False
    if session["status"] in ("done", "error", "cancelled"):
        return False
    update_session(session_id, status="cancelled")
    return True


def append_session_event(session_id: str, event: dict[str, Any]) -> int:
    """写入一条 SSE 事件，返回 seq（跨 worker 可见）。"""
    now = datetime.now()
    event_type = str(event.get("type") or "")
    slim = dict(event)
    if slim.get("type") in ("thinking", "delta", "chunk") and isinstance(slim.get("text"), str):
        txt = slim["text"]
        if len(txt) > 12000:
            slim["text"] = txt[-12000:]
    payload = _json_dump(slim) or "{}" 
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM tc_generation_session_events WHERE session_id = %s",
                (session_id,),
            )
            row = cur.fetchone() or {}
            seq = int(row.get("next_seq") or 1)
            cur.execute(
                """
                INSERT INTO tc_generation_session_events
                (session_id, seq, event_type, payload_json, created_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (session_id, seq, event_type, payload, now),
            )
            return seq
    finally:
        conn.close()


def get_session_events_since(
    session_id: str, after_seq: int
) -> tuple[list[dict[str, Any]], int]:
    """读取 seq > after_seq 的事件，返回 (events, latest_seq)。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT seq, payload_json
                FROM tc_generation_session_events
                WHERE session_id = %s AND seq > %s
                ORDER BY seq ASC
                """,
                (session_id, after_seq),
            )
            rows = cur.fetchall() or []
            events: list[dict[str, Any]] = []
            latest = after_seq
            for row in rows:
                seq = int(row.get("seq") or 0)
                latest = max(latest, seq)
                loaded = _json_load(row.get("payload_json"), {})
                if isinstance(loaded, dict):
                    events.append(loaded)
            return events, latest
    finally:
        conn.close()


def clear_session_events(session_id: str) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM tc_generation_session_events WHERE session_id = %s",
                (session_id,),
            )
    finally:
        conn.close()


def mark_stale_active_generation_sessions(
    max_age_seconds: int = 900,
    user_id: str | None = None,
) -> int:
    if max_age_seconds < 60:
        max_age_seconds = 60
    ensure_generation_session_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            sql = """
                UPDATE tc_generation_sessions
                SET status = 'error',
                    error_message = %s,
                    updated_at = NOW()
                WHERE status IN ('pending', 'running')
                  AND updated_at < DATE_SUB(NOW(), INTERVAL %s SECOND)
            """
            params: list[Any] = [_STALE_SESSION_MSG, max_age_seconds]
            if user_id:
                sql += " AND user_id = %s"
                params.append(user_id)
            cur.execute(sql, tuple(params))
            return int(cur.rowcount or 0)
    finally:
        conn.close()




def list_active_generation_session_ids_for_user(user_id: str | None) -> list[str]:
    if not user_id:
        return []
    ensure_generation_session_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM tc_generation_sessions
                WHERE user_id = %s AND status IN ('pending', 'running')
                ORDER BY updated_at DESC
                """,
                (user_id,),
            )
            rows = cur.fetchall() or []
            return [str(r.get("id") or "") for r in rows if r.get("id")]
    finally:
        conn.close()


def cancel_active_generation_sessions_for_user(user_id: str | None) -> int:
    """取消用户所有进行中的流式生成会话，便于重新发起生成。"""
    from core.services.test_cases.page_generation_lock_service import finish_page_gen_lock_for_session

    cancelled = 0
    for session_id in list_active_generation_session_ids_for_user(user_id):
        if cancel_session(session_id):
            cancelled += 1
        try:
            finish_page_gen_lock_for_session(session_id, "cancelled")
        except Exception:
            pass
    return cancelled


def count_active_generation_sessions_for_user(user_id: str | None) -> int:
    if not user_id:
        return 0
    ensure_generation_session_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS c FROM tc_generation_sessions
                WHERE user_id = %s AND status IN ('pending', 'running')
                """,
                (user_id,),
            )
            return int((cur.fetchone() or {}).get("c") or 0)
    finally:
        conn.close()
