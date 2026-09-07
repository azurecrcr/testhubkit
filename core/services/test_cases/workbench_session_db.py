"""用例工作台对话会话（含质量检查结果）持久化。"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from core.services.test_cases.mysql_db import get_connection

_SESSIONS_SQL = """
CREATE TABLE IF NOT EXISTS tc_workbench_sessions (
    id CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(32) NULL,
    session_key VARCHAR(64) NULL,
    title VARCHAR(200) NOT NULL DEFAULT '',
    plan_context VARCHAR(16) NOT NULL DEFAULT 'edit',
    turn_count INT NOT NULL DEFAULT 0,
    session_prefs_json MEDIUMTEXT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_tc_wb_sess_user (user_id, updated_at),
    INDEX idx_tc_wb_sess_key (session_key, updated_at),
    INDEX idx_tc_wb_sess_ctx (session_key, plan_context, updated_at),
    INDEX idx_tc_wb_sess_user_ctx (user_id, plan_context, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_PLAN_CONTEXTS = frozenset({"edit", "edit_mindmap"})
_LEGACY_PLAN_CONTEXTS = frozenset({"single", "agent", "mindmap"})
_MAX_HISTORY_PER_CONTEXT = 5

_TURNS_SQL = """
CREATE TABLE IF NOT EXISTS tc_workbench_session_turns (
    id CHAR(32) NOT NULL PRIMARY KEY,
    workbench_session_id CHAR(32) NOT NULL,
    turn_index INT NOT NULL,
    user_prompt MEDIUMTEXT NULL,
    user_mode VARCHAR(48) NULL,
    chain_json MEDIUMTEXT NULL,
    validation_json MEDIUMTEXT NULL,
    validate_reasoning MEDIUMTEXT NULL,
    batch_meta_json MEDIUMTEXT NULL,
    lanhu_url VARCHAR(2048) NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_tc_wb_turn (workbench_session_id, turn_index),
    INDEX idx_tc_wb_turn_session (workbench_session_id, turn_index),
    CONSTRAINT fk_tc_wb_turn_session FOREIGN KEY (workbench_session_id)
        REFERENCES tc_workbench_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def normalize_plan_context(value: str | None) -> str:
    ctx = str(value or "edit").strip().lower()
    if ctx not in _PLAN_CONTEXTS:
        return "edit"
    return ctx


def ensure_workbench_session_tables() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_SESSIONS_SQL)
            cur.execute(_TURNS_SQL)
            cur.execute(
                "SHOW COLUMNS FROM tc_workbench_sessions LIKE 'plan_context'"
            )
            if not cur.fetchone():
                cur.execute(
                    """
                    ALTER TABLE tc_workbench_sessions
                    ADD COLUMN plan_context VARCHAR(16) NOT NULL DEFAULT 'edit'
                    AFTER title
                    """
                )
            for idx_sql in (
                """
                CREATE INDEX idx_tc_wb_sess_ctx
                ON tc_workbench_sessions (session_key, plan_context, updated_at)
                """,
                """
                CREATE INDEX idx_tc_wb_sess_user_ctx
                ON tc_workbench_sessions (user_id, plan_context, updated_at)
                """,
            ):
                try:
                    cur.execute(idx_sql)
                except Exception:
                    pass
            cur.execute(
                "SHOW COLUMNS FROM tc_workbench_sessions LIKE 'session_prefs_json'"
            )
            if not cur.fetchone():
                cur.execute(
                    """
                    ALTER TABLE tc_workbench_sessions
                    ADD COLUMN session_prefs_json MEDIUMTEXT NULL
                    AFTER turn_count
                    """
                )
            cur.execute(
                "SHOW COLUMNS FROM tc_workbench_session_turns LIKE 'lanhu_url'"
            )
            if not cur.fetchone():
                cur.execute(
                    """
                    ALTER TABLE tc_workbench_session_turns
                    ADD COLUMN lanhu_url VARCHAR(2048) NULL
                    AFTER batch_meta_json
                    """
                )
            cur.execute(
                "SHOW COLUMNS FROM tc_workbench_session_turns LIKE 'agent_chain_json'"
            )
            if not cur.fetchone():
                cur.execute(
                    """
                    ALTER TABLE tc_workbench_session_turns
                    ADD COLUMN agent_chain_json MEDIUMTEXT NULL
                    AFTER chain_json
                    """
                )
            cur.execute(
                """
                DELETE t FROM tc_workbench_session_turns t
                INNER JOIN tc_workbench_sessions s ON s.id = t.workbench_session_id
                WHERE s.plan_context IN ('single', 'agent', 'mindmap')
                """
            )
            cur.execute(
                """
                DELETE FROM tc_workbench_sessions
                WHERE plan_context IN ('single', 'agent', 'mindmap')
                """
            )
            cur.execute(
                """
                UPDATE tc_workbench_sessions
                SET plan_context = 'edit'
                WHERE plan_context NOT IN ('edit', 'edit_mindmap')
                """
            )
    finally:
        conn.close()


def _new_id() -> str:
    return uuid.uuid4().hex


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


def _strip_ephemeral_chain_fields(chain: dict) -> dict:
    """流式展示专用字段不落库：生成思考、模块拆分思考、质量检查思考。"""
    out = dict(chain)
    out["thinkingText"] = ""
    out["validateThinkingText"] = ""
    mod = out.get("moduleStepThinking")
    if isinstance(mod, dict):
        mod = dict(mod)
        mod["split_modules"] = ""
        mod["generate_modules"] = ""
        mod["module_count"] = 0
        mod["generate_module_slots"] = []
        out["moduleStepThinking"] = mod
    # stream 仅保留最终输出缓冲，不持久化“仅思考可见”状态
    stream = out.get("stream")
    if isinstance(stream, dict):
        stream = dict(stream)
        if not str(stream.get("buffer") or "").strip():
            stream["visible"] = False
        out["stream"] = stream
    return out


def _chain_has_displayable_content(chain: dict | None) -> bool:
    if not isinstance(chain, dict):
        return False
    if str(chain.get("kind") or "").strip() in ("smart_edit", "mindmap_smart_edit"):
        user_atts = chain.get("user_attachments")
        if isinstance(user_atts, list) and user_atts:
            return True
        if str(chain.get("status_hint") or chain.get("summary") or "").strip():
            return True
        status = str(chain.get("status") or "").strip().lower()
        if status in {"done", "cancelled", "error", "pending"}:
            return True
        if str(chain.get("mindmap_text") or "").strip():
            return True
        ops = chain.get("operations")
        if isinstance(ops, list) and ops:
            return True
        return False
    steps = chain.get("steps") or {}
    if any(
        isinstance(row, dict) and row.get("status") not in (None, "", "pending")
        for row in steps.values()
    ):
        return True
    stream = chain.get("stream") or {}
    if str(stream.get("buffer") or "").strip():
        return True
    validate = chain.get("validateSubSteps") or {}
    if any(
        isinstance(row, dict) and row.get("status") not in (None, "", "pending")
        for row in validate.values()
    ):
        return True
    return False


def _agent_chain_has_displayable_content(agent_chain: dict | None) -> bool:
    if not isinstance(agent_chain, dict):
        return False
    steps = agent_chain.get("steps") or {}
    return any(
        isinstance(row, dict) and row.get("status") not in (None, "", "pending")
        for row in steps.values()
    )


def _normalize_persisted_chain(chain: Any) -> dict | None:
    if not isinstance(chain, dict):
        return None
    chain = _strip_ephemeral_chain_fields(chain)
    return chain if _chain_has_displayable_content(chain) else None


def _normalize_persisted_agent_chain(agent_chain: Any) -> dict | None:
    if not isinstance(agent_chain, dict):
        return None
    return agent_chain if _agent_chain_has_displayable_content(agent_chain) else None


def _dt_iso(val: Any) -> str | None:
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _session_row(row: dict) -> dict[str, Any]:
    return {
        "id": row["id"],
        "user_id": row.get("user_id"),
        "session_key": row.get("session_key"),
        "title": row.get("title") or "",
        "plan_context": normalize_plan_context(row.get("plan_context")),
        "turn_count": int(row.get("turn_count") or 0),
        "session_prefs": _json_load(row.get("session_prefs_json"), None),
        "created_at": _dt_iso(row.get("created_at")),
        "updated_at": _dt_iso(row.get("updated_at")),
    }


def _turn_row(row: dict) -> dict[str, Any]:
    return {
        "id": row["id"],
        "workbench_session_id": row["workbench_session_id"],
        "turn_index": int(row.get("turn_index") or 0),
        "user_prompt": row.get("user_prompt") or "",
        "user_mode": row.get("user_mode") or "",
        "chain": _normalize_persisted_chain(_json_load(row.get("chain_json"), None)),
        "agent_chain": _normalize_persisted_agent_chain(_json_load(row.get("agent_chain_json"), None)),
        "validation": _json_load(row.get("validation_json"), None),
        "validate_reasoning": row.get("validate_reasoning") or "",
        "batch_meta": _json_load(row.get("batch_meta_json"), None),
        "lanhu_url": row.get("lanhu_url") or "",
        "created_at": _dt_iso(row.get("created_at")),
        "updated_at": _dt_iso(row.get("updated_at")),
    }


def insert_session(
    *,
    user_id: str | None,
    session_key: str | None,
    title: str,
    plan_context: str = "edit",
    session_prefs: dict | None = None,
) -> dict[str, Any]:
    ensure_workbench_session_tables()
    plan_context = normalize_plan_context(plan_context)
    sid = _new_id()
    now = datetime.now()
    prefs_json = _json_dump(session_prefs) if session_prefs else None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_workbench_sessions
                (id, user_id, session_key, title, plan_context, turn_count,
                 session_prefs_json, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, 0, %s, %s, %s)
                """,
                (sid, user_id, session_key, title[:200], plan_context, prefs_json, now, now),
            )
    finally:
        conn.close()
    return _session_row(
        {
            "id": sid,
            "user_id": user_id,
            "session_key": session_key,
            "title": title[:200],
            "plan_context": plan_context,
            "turn_count": 0,
            "session_prefs_json": prefs_json,
            "created_at": now,
            "updated_at": now,
        }
    )


def get_session(session_id: str) -> dict[str, Any] | None:
    ensure_workbench_session_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM tc_workbench_sessions WHERE id = %s",
                (session_id,),
            )
            row = cur.fetchone()
            return _session_row(row) if row else None
    finally:
        conn.close()


def session_owned_by(
    session_id: str,
    *,
    user_id: str | None,
    session_key: str | None,
) -> bool:
    row = get_session(session_id)
    if not row:
        return False
    if user_id and row.get("user_id") == user_id:
        return True
    if session_key and row.get("session_key") == session_key:
        return True
    return False


def list_sessions(
    *,
    user_id: str | None,
    session_key: str | None,
    limit: int = 30,
    plan_context: str | None = None,
    history_only: bool = False,
) -> list[dict[str, Any]]:
    ensure_workbench_session_tables()
    limit = max(1, min(int(limit or 30), 50))
    ctx = normalize_plan_context(plan_context) if plan_context else None
    history_sql = " AND turn_count > 0" if history_only else ""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if user_id:
                if ctx:
                    cur.execute(
                        f"""
                        SELECT * FROM tc_workbench_sessions
                        WHERE user_id = %s AND plan_context = %s{history_sql}
                        ORDER BY created_at DESC
                        LIMIT %s
                        """,
                        (user_id, ctx, limit),
                    )
                else:
                    cur.execute(
                        f"""
                        SELECT * FROM tc_workbench_sessions
                        WHERE user_id = %s{history_sql}
                        ORDER BY created_at DESC
                        LIMIT %s
                        """,
                        (user_id, limit),
                    )
            elif session_key:
                if ctx:
                    cur.execute(
                        f"""
                        SELECT * FROM tc_workbench_sessions
                        WHERE session_key = %s AND plan_context = %s{history_sql}
                        ORDER BY created_at DESC
                        LIMIT %s
                        """,
                        (session_key, ctx, limit),
                    )
                else:
                    cur.execute(
                        f"""
                        SELECT * FROM tc_workbench_sessions
                        WHERE session_key = %s{history_sql}
                        ORDER BY created_at DESC
                        LIMIT %s
                        """,
                        (session_key, limit),
                    )
            else:
                return []
            return [_session_row(r) for r in (cur.fetchall() or [])]
    finally:
        conn.close()


def list_empty_draft_sessions(
    *,
    user_id: str | None,
    session_key: str | None,
    plan_context: str,
    limit: int = 20,
) -> list[dict[str, Any]]:
    ensure_workbench_session_tables()
    plan_context = normalize_plan_context(plan_context)
    limit = max(1, min(int(limit or 20), 50))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if user_id:
                cur.execute(
                    """
                    SELECT * FROM tc_workbench_sessions
                    WHERE user_id = %s AND plan_context = %s AND turn_count = 0
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (user_id, plan_context, limit),
                )
            elif session_key:
                cur.execute(
                    """
                    SELECT * FROM tc_workbench_sessions
                    WHERE session_key = %s AND plan_context = %s AND turn_count = 0
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (session_key, plan_context, limit),
                )
            else:
                return []
            return [_session_row(r) for r in (cur.fetchall() or [])]
    finally:
        conn.close()


def get_latest_draft_session(
    *,
    user_id: str | None,
    session_key: str | None,
    plan_context: str,
) -> dict[str, Any] | None:
    drafts = list_empty_draft_sessions(
        user_id=user_id,
        session_key=session_key,
        plan_context=plan_context,
        limit=1,
    )
    return drafts[0] if drafts else None


def cleanup_empty_draft_sessions(
    *,
    user_id: str | None,
    session_key: str | None,
    plan_context: str | None = None,
    keep_session_id: str | None = None,
) -> int:
    """删除无对话轮次的草稿会话（保留 keep_session_id）。"""
    ensure_workbench_session_tables()
    ctx = normalize_plan_context(plan_context) if plan_context else None
    keep_session_id = str(keep_session_id or "").strip() or None
    conn = get_connection()
    deleted = 0
    try:
        with conn.cursor() as cur:
            if user_id:
                if ctx:
                    sql = """
                        SELECT id FROM tc_workbench_sessions
                        WHERE user_id = %s AND plan_context = %s AND turn_count = 0
                    """
                    params: list[Any] = [user_id, ctx]
                else:
                    sql = """
                        SELECT id FROM tc_workbench_sessions
                        WHERE user_id = %s AND turn_count = 0
                    """
                    params = [user_id]
            elif session_key:
                if ctx:
                    sql = """
                        SELECT id FROM tc_workbench_sessions
                        WHERE session_key = %s AND plan_context = %s AND turn_count = 0
                    """
                    params = [session_key, ctx]
                else:
                    sql = """
                        SELECT id FROM tc_workbench_sessions
                        WHERE session_key = %s AND turn_count = 0
                    """
                    params = [session_key]
            else:
                return 0
            if keep_session_id:
                sql += " AND id <> %s"
                params.append(keep_session_id)
            cur.execute(sql, tuple(params))
            stale = [row["id"] for row in (cur.fetchall() or [])]
            for sid in stale:
                cur.execute(
                    "DELETE FROM tc_workbench_sessions WHERE id = %s",
                    (sid,),
                )
                deleted += int(cur.rowcount or 0)
    finally:
        conn.close()
    return deleted


def prune_sessions_over_limit(
    *,
    user_id: str | None,
    session_key: str | None,
    plan_context: str,
    keep: int = _MAX_HISTORY_PER_CONTEXT,
) -> None:
    ensure_workbench_session_tables()
    plan_context = normalize_plan_context(plan_context)
    keep = max(1, min(int(keep or _MAX_HISTORY_PER_CONTEXT), 20))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if user_id:
                cur.execute(
                    """
                    SELECT id FROM tc_workbench_sessions
                    WHERE user_id = %s AND plan_context = %s AND turn_count > 0
                    ORDER BY created_at DESC
                    LIMIT 999 OFFSET %s
                    """,
                    (user_id, plan_context, keep),
                )
            elif session_key:
                cur.execute(
                    """
                    SELECT id FROM tc_workbench_sessions
                    WHERE session_key = %s AND plan_context = %s AND turn_count > 0
                    ORDER BY created_at DESC
                    LIMIT 999 OFFSET %s
                    """,
                    (session_key, plan_context, keep),
                )
            else:
                return
            stale = [row["id"] for row in (cur.fetchall() or [])]
            for sid in stale:
                cur.execute(
                    "DELETE FROM tc_workbench_sessions WHERE id = %s",
                    (sid,),
                )
    finally:
        conn.close()


def delete_session(session_id: str) -> bool:
    ensure_workbench_session_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM tc_workbench_sessions WHERE id = %s",
                (session_id,),
            )
            return cur.rowcount > 0
    finally:
        conn.close()


def update_session_title(session_id: str, title: str) -> dict[str, Any] | None:
    ensure_workbench_session_tables()
    title = str(title or "").strip()[:200]
    if not title:
        return get_session(session_id)
    now = datetime.now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tc_workbench_sessions
                SET title = %s, updated_at = %s
                WHERE id = %s
                """,
                (title, now, session_id),
            )
    finally:
        conn.close()
    return get_session(session_id)


def update_session_prefs(
    session_id: str,
    session_prefs: dict | None,
) -> dict[str, Any] | None:
    ensure_workbench_session_tables()
    now = datetime.now()
    prefs_json = _json_dump(session_prefs) if session_prefs is not None else None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tc_workbench_sessions
                SET session_prefs_json = %s, updated_at = %s
                WHERE id = %s
                """,
                (prefs_json, now, session_id),
            )
    finally:
        conn.close()
    return get_session(session_id)


def touch_session(session_id: str, *, turn_count: int | None = None) -> None:
    fields = ["updated_at = %s"]
    values: list[Any] = [datetime.now()]
    if turn_count is not None:
        fields.append("turn_count = %s")
        values.append(int(turn_count))
    values.append(session_id)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE tc_workbench_sessions SET {', '.join(fields)} WHERE id = %s",
                tuple(values),
            )
    finally:
        conn.close()


def list_turns(session_id: str) -> list[dict[str, Any]]:
    ensure_workbench_session_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM tc_workbench_session_turns
                WHERE workbench_session_id = %s
                ORDER BY turn_index ASC
                """,
                (session_id,),
            )
            return [_turn_row(r) for r in (cur.fetchall() or [])]
    finally:
        conn.close()


def get_turn(turn_id: str) -> dict[str, Any] | None:
    ensure_workbench_session_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM tc_workbench_session_turns WHERE id = %s",
                (turn_id,),
            )
            row = cur.fetchone()
            return _turn_row(row) if row else None
    finally:
        conn.close()


def _merge_persisted_chain(existing: Any, incoming: dict | None) -> dict | None:
    if not isinstance(incoming, dict):
        return _normalize_persisted_chain(existing) if isinstance(existing, dict) else None
    base = dict(existing) if isinstance(existing, dict) else {}
    base.update(incoming)
    return _normalize_persisted_chain(base)


def _patch_turn_chain_fields(cur, turn_id: str, chain: dict | None, now: datetime) -> None:
    if not isinstance(chain, dict) or not chain:
        return
    cur.execute(
        "SELECT chain_json FROM tc_workbench_session_turns WHERE id = %s",
        (turn_id,),
    )
    row = cur.fetchone()
    existing = _json_load(row.get("chain_json") if row else None, None)
    merged = _merge_persisted_chain(existing, chain)
    if merged is None:
        return
    cur.execute(
        """
        UPDATE tc_workbench_session_turns
        SET chain_json = %s, updated_at = %s
        WHERE id = %s
        """,
        (_json_dump(merged), now, turn_id),
    )


def upsert_turn(
    *,
    session_id: str,
    turn_index: int,
    user_prompt: str = "",
    user_mode: str = "",
    chain: dict | None = None,
    agent_chain: dict | None = None,
    batch_meta: dict | None = None,
    lanhu_url: str = "",
    turn_id: str | None = None,
) -> dict[str, Any]:
    ensure_workbench_session_tables()
    chain = _normalize_persisted_chain(chain)
    agent_chain = _normalize_persisted_agent_chain(agent_chain)
    now = datetime.now()
    requested_tid = str(turn_id or "").strip()
    tid = requested_tid or _new_id()
    lanhu_url = str(lanhu_url or "").strip()[:2048]
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            def _update_turn(update_id: str) -> str:
                cur.execute(
                    """
                    UPDATE tc_workbench_session_turns
                    SET user_prompt = %s, user_mode = %s, chain_json = %s,
                        agent_chain_json = %s, batch_meta_json = %s, lanhu_url = %s,
                        updated_at = %s
                    WHERE id = %s
                    """,
                    (
                        user_prompt,
                        user_mode[:48] if user_mode else "",
                        _json_dump(chain),
                        _json_dump(agent_chain),
                        _json_dump(batch_meta),
                        lanhu_url,
                        now,
                        update_id,
                    ),
                )
                return update_id

            if requested_tid:
                cur.execute(
                    """
                    SELECT id, workbench_session_id
                    FROM tc_workbench_session_turns
                    WHERE id = %s
                    """,
                    (requested_tid,),
                )
                by_id = cur.fetchone()
                if by_id:
                    existing_sid = str(by_id.get("workbench_session_id") or "").strip()
                    if existing_sid and existing_sid != str(session_id or "").strip():
                        _patch_turn_chain_fields(cur, requested_tid, chain, now)
                        tid = requested_tid
                    else:
                        tid = _update_turn(requested_tid)
                    conn.commit()
                    touch_session(existing_sid or session_id, turn_count=int(turn_index) + 1)
                    row = get_turn(tid)
                    return row or {}

            cur.execute(
                """
                SELECT id FROM tc_workbench_session_turns
                WHERE workbench_session_id = %s AND turn_index = %s
                """,
                (session_id, int(turn_index)),
            )
            existing = cur.fetchone()
            if existing:
                tid = _update_turn(existing["id"])
            else:
                cur.execute(
                    """
                    SELECT id, workbench_session_id
                    FROM tc_workbench_session_turns
                    WHERE id = %s
                    """,
                    (tid,),
                )
                clash = cur.fetchone()
                if clash:
                    clash_sid = str(clash.get("workbench_session_id") or "").strip()
                    if clash_sid and clash_sid != str(session_id or "").strip():
                        _patch_turn_chain_fields(cur, tid, chain, now)
                        conn.commit()
                        row = get_turn(tid)
                        return row or {}
                    tid = _update_turn(clash["id"])
                else:
                    cur.execute(
                        """
                        INSERT INTO tc_workbench_session_turns
                        (id, workbench_session_id, turn_index, user_prompt, user_mode,
                         chain_json, agent_chain_json, validation_json, validate_reasoning,
                         batch_meta_json, lanhu_url, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, NULL, NULL, %s, %s, %s, %s)
                        """,
                        (
                            tid,
                            session_id,
                            int(turn_index),
                            user_prompt,
                            user_mode[:48] if user_mode else "",
                            _json_dump(chain),
                            _json_dump(agent_chain),
                            _json_dump(batch_meta),
                            lanhu_url,
                            now,
                            now,
                        ),
                    )
            conn.commit()
    finally:
        conn.close()
    max_idx = int(turn_index)
    touch_session(session_id, turn_count=max_idx + 1)
    row = get_turn(tid)
    return row or {}




def _validation_has_payload(validation) -> bool:
    if not isinstance(validation, dict):
        return False
    if validation.get("llm_done") or validation.get("llm_skipped"):
        return True
    for key in ("issues", "gap_issues", "over_generated_issues", "format_issues"):
        val = validation.get(key)
        if isinstance(val, list) and val:
            return True
    return bool(validation)


def _turn_batch_validation_keys(turn: dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    for part in (turn.get("chain"), turn.get("batch_meta")):
        if isinstance(part, dict):
            raw = str(part.get("batchValidationKey") or "").strip()
            if raw:
                keys.add(raw)
    tid = str(turn.get("id") or "").strip()
    if tid:
        keys.add(f"turn-{tid}")
    chain = turn.get("chain") if isinstance(turn.get("chain"), dict) else {}
    chain_tid = str(chain.get("turnId") or "").strip()
    if chain_tid:
        keys.add(f"turn-{chain_tid}")
    return keys


def _rows_range_tokens(turn: dict[str, Any]) -> set[str]:
    tokens: set[str] = set()
    for part in (turn.get("batch_meta"), turn.get("chain")):
        if not isinstance(part, dict):
            continue
        start = part.get("batchRowStart")
        count = part.get("batchRowCount")
        if start is None or not count:
            continue
        try:
            tokens.add(f"rows@{int(start)}+{int(count)}")
        except (TypeError, ValueError):
            continue
    for key in _turn_batch_validation_keys(turn):
        if "@rows@" in key:
            tokens.add(key.split("@", 1)[1])
        elif key.startswith("rows@"):
            tokens.add(key)
    return tokens


def _batch_validation_keys_match(
    turn_a: dict[str, Any],
    turn_b: dict[str, Any],
) -> bool:
    keys_a = _turn_batch_validation_keys(turn_a)
    keys_b = _turn_batch_validation_keys(turn_b)
    if keys_a & keys_b:
        return True
    turn_a_id = str(turn_a.get("id") or "").strip()
    turn_b_id = str(turn_b.get("id") or "").strip()
    if turn_a_id and f"turn-{turn_a_id}" in keys_b:
        return True
    if turn_b_id and f"turn-{turn_b_id}" in keys_a:
        return True
    return False


def _validation_score(validation: dict[str, Any]) -> int:
    score = 0
    if validation.get("llm_done") and not validation.get("llm_skipped"):
        score += 100000
    run_id = int(validation.get("validate_run_id") or 0)
    score += run_id * 100
    validated_at = int(validation.get("validated_at") or 0)
    score += validated_at // 1000000
    for key in ("gap_issues", "over_generated_issues", "issues", "format_issues"):
        val = validation.get(key)
        if isinstance(val, list):
            score += len(val) * 10
    return score


def resolve_turn_validation_bundle(turn: dict[str, Any], *, session_turns: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    validation = turn.get("validation")
    reasoning = str(turn.get("validate_reasoning") or "")
    batch_meta = turn.get("batch_meta")
    if _validation_has_payload(validation):
        return {
            "validation": validation,
            "validate_reasoning": reasoning,
            "batch_meta": batch_meta,
        }

    keys = _turn_batch_validation_keys(turn)
    if not keys:
        return {
            "validation": None,
            "validate_reasoning": reasoning,
            "batch_meta": batch_meta,
        }

    if session_turns is None:
        session_id = str(turn.get("workbench_session_id") or "").strip()
        session_turns = list_turns(session_id) if session_id else []

    turn_id = str(turn.get("id") or "").strip()
    best: dict[str, Any] | None = None
    best_score = -1
    for other in session_turns:
        if str(other.get("id") or "") == turn_id:
            continue
        other_validation = other.get("validation")
        if not _validation_has_payload(other_validation):
            continue
        if not _batch_validation_keys_match(turn, other):
            continue
        score = _validation_score(other_validation)
        if score > best_score:
            best = other
            best_score = score

    if best:
        return {
            "validation": best.get("validation"),
            "validate_reasoning": str(best.get("validate_reasoning") or reasoning),
            "batch_meta": best.get("batch_meta") or batch_meta,
        }

    return {
        "validation": None,
        "validate_reasoning": reasoning,
        "batch_meta": batch_meta,
    }



def _llm_validation_step_detail(validation: dict[str, Any] | None) -> str:
    if not isinstance(validation, dict):
        return ""
    if validation.get("llm_pending"):
        return "AI 对照检查进行中…"
    if validation.get("llm_skipped"):
        reason = str(validation.get("llm_skip_reason") or "").strip()
        if reason == "no_lanhu":
            return "格式检查通过（未填写蓝湖 URL，未运行 AI 对照）"
        return "格式检查通过（未运行 AI 对照）"
    over = int(validation.get("over_generated_count") or 0)
    gap = int(validation.get("gap_count") or 0)
    if not gap:
        gap_issues = validation.get("gap_issues")
        if isinstance(gap_issues, list):
            gap = len(gap_issues)
    if not over:
        over_issues = validation.get("over_generated_issues")
        if isinstance(over_issues, list):
            over = len(over_issues)
    total = over + gap
    if not total:
        return "检查通过"
    if over and gap:
        return f"共 {total} 项（过度 {over} · 遗漏 {gap}）"
    if over:
        return f"发现 {over} 项过度生成"
    if gap:
        return f"发现 {gap} 项可能遗漏"
    return "检查通过"


def enrich_turn_for_session_read(turn: dict[str, Any], *, session_turns: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    if not isinstance(turn, dict):
        return turn
    out = dict(turn)
    bundle = resolve_turn_validation_bundle(out, session_turns=session_turns)
    validation = bundle.get("validation")
    if _validation_has_payload(validation):
        out["validation"] = validation
        out["validate_reasoning"] = bundle.get("validate_reasoning") or out.get("validate_reasoning") or ""
        if bundle.get("batch_meta") is not None:
            out["batch_meta"] = bundle.get("batch_meta")
    detail = _llm_validation_step_detail(validation)
    if not detail:
        return out
    chain = dict(out.get("chain") or {}) if isinstance(out.get("chain"), dict) else {}
    validate_sub = dict(chain.get("validateSubSteps") or {}) if isinstance(chain.get("validateSubSteps"), dict) else {}
    llm_sub = dict(validate_sub.get("llm") or {}) if isinstance(validate_sub.get("llm"), dict) else {}
    llm_sub["status"] = "done" if isinstance(validation, dict) and validation.get("llm_done") else (llm_sub.get("status") or "done")
    llm_sub["detail"] = detail
    validate_sub["llm"] = llm_sub
    chain["validateSubSteps"] = validate_sub
    out["chain"] = chain
    return out

def update_turn_validation(
    turn_id: str,
    *,
    validation: dict | None,
    validate_reasoning: str = "",
    batch_meta: dict | None = None,
) -> dict[str, Any] | None:
    ensure_workbench_session_tables()
    now = datetime.now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            fields = ["validation_json = %s", "validate_reasoning = %s", "updated_at = %s"]
            values: list[Any] = [
                _json_dump(validation),
                validate_reasoning or "",
                now,
            ]
            if batch_meta is not None:
                fields.append("batch_meta_json = %s")
                values.append(_json_dump(batch_meta))
            if validation is not None:
                cur.execute(
                    "SELECT chain_json FROM tc_workbench_session_turns WHERE id = %s",
                    (turn_id,),
                )
                chain_row = cur.fetchone()
                chain = _json_load(chain_row.get("chain_json") if chain_row else None, None)
                if isinstance(chain, dict):
                    chain["turnId"] = turn_id
                    batch_key = ""
                    if isinstance(batch_meta, dict):
                        batch_key = str(batch_meta.get("batchValidationKey") or "").strip()
                    if batch_key:
                        chain["batchValidationKey"] = batch_key
                    fields.append("chain_json = %s")
                    values.append(_json_dump(chain))
            values.append(turn_id)
            cur.execute(
                f"UPDATE tc_workbench_session_turns SET {', '.join(fields)} WHERE id = %s",
                tuple(values),
            )
    finally:
        conn.close()
    turn = get_turn(turn_id)
    if turn and turn.get("workbench_session_id"):
        touch_session(turn["workbench_session_id"])
    return turn
