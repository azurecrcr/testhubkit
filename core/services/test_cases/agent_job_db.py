"""Agent 多步生成任务表。"""
from __future__ import annotations

import json
import threading
from datetime import datetime
from typing import Any

from core.services.test_cases.mysql_db import get_connection

_JOBS_SQL = """
CREATE TABLE IF NOT EXISTS tc_agent_jobs (
    id CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(32) NULL,
    mode VARCHAR(32) NOT NULL DEFAULT 'full_pipeline',
    user_intent TEXT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    requirements_summary MEDIUMTEXT NULL,
    columns_json MEDIUMTEXT NOT NULL,
    existing_rows_json MEDIUMTEXT NULL,
    options_json MEDIUMTEXT NULL,
    result_json MEDIUMTEXT NULL,
    error_message TEXT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    cancelled_at DATETIME NULL,
    INDEX idx_tc_agent_job_user (user_id, created_at),
    INDEX idx_tc_agent_job_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_STEPS_SQL = """
CREATE TABLE IF NOT EXISTS tc_agent_steps (
    id CHAR(32) NOT NULL PRIMARY KEY,
    job_id CHAR(32) NOT NULL,
    step_key VARCHAR(32) NOT NULL,
    step_index INT NOT NULL,
    label VARCHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    input_json MEDIUMTEXT NULL,
    output_json MEDIUMTEXT NULL,
    error_message TEXT NULL,
    retry_count INT NOT NULL DEFAULT 0,
    started_at DATETIME NULL,
    finished_at DATETIME NULL,
    INDEX idx_tc_agent_step_job (job_id, step_index),
    CONSTRAINT fk_tc_agent_step_job FOREIGN KEY (job_id)
        REFERENCES tc_agent_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


_tables_ready = False
_tables_lock = threading.Lock()


def ensure_agent_job_tables() -> None:
    global _tables_ready
    if _tables_ready:
        return
    with _tables_lock:
        if _tables_ready:
            return
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(_JOBS_SQL)
                cur.execute(_STEPS_SQL)
            _tables_ready = True
        finally:
            conn.close()



def touch_job_heartbeat(job_id: str, now: datetime | None = None) -> None:
    """仅刷新任务 updated_at，供长步骤执行期间防误判为孤儿任务。"""
    now = now or datetime.now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE tc_agent_jobs SET updated_at = %s WHERE id = %s AND status = 'running'",
                (now, job_id),
            )
    finally:
        conn.close()


def reset_agent_steps_for_retry(job_id: str) -> None:
    """重试时：已完成步骤保留，失败/未完成步骤重置为 pending。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tc_agent_steps
                SET status = 'pending', output_json = NULL, error_message = NULL,
                    started_at = NULL, finished_at = NULL
                WHERE job_id = %s AND status IN ('error', 'running', 'pending')
                """,
                (job_id,),
            )
    finally:
        conn.close()


def list_stale_running_jobs(max_age_seconds: int = 1800) -> list[dict[str, Any]]:
    """返回当前 running 步骤长时间无进展的孤儿任务（基于步骤 started_at）。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT j.id, j.updated_at,
                       (SELECT MAX(s.started_at) FROM tc_agent_steps s
                        WHERE s.job_id = j.id AND s.status = 'running') AS step_started
                FROM tc_agent_jobs j
                WHERE j.status = 'running'
                  AND (
                    SELECT MAX(s.started_at) FROM tc_agent_steps s
                    WHERE s.job_id = j.id AND s.status = 'running'
                  ) IS NOT NULL
                  AND (
                    SELECT MAX(s.started_at) FROM tc_agent_steps s
                    WHERE s.job_id = j.id AND s.status = 'running'
                  ) < DATE_SUB(NOW(), INTERVAL %s SECOND)
                ORDER BY step_started ASC
                LIMIT 20
                """,
                (max(300, int(max_age_seconds)),),
            )
            rows = cur.fetchall() or []
        out: list[dict[str, Any]] = []
        for row in rows:
            if isinstance(row, dict):
                out.append(row)
            else:
                out.append({"id": row[0], "updated_at": row[1], "step_started": row[2]})
        return out
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


def insert_job(
    *,
    job_id: str,
    user_id: str | None,
    mode: str,
    user_intent: str,
    columns: list[str],
    existing_rows: list[list[str]] | None,
    options: dict[str, Any] | None,
    steps: list[dict[str, Any]],
    now: datetime,
) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_agent_jobs
                    (id, user_id, mode, user_intent, status, columns_json,
                     existing_rows_json, options_json, created_at, updated_at)
                VALUES (%s, %s, %s, %s, 'pending', %s, %s, %s, %s, %s)
                """,
                (
                    job_id,
                    user_id,
                    mode,
                    user_intent,
                    _json_dump(columns),
                    _json_dump(existing_rows or []),
                    _json_dump(options or {}),
                    now,
                    now,
                ),
            )
            for step in steps:
                cur.execute(
                    """
                    INSERT INTO tc_agent_steps
                        (id, job_id, step_key, step_index, label, status)
                    VALUES (%s, %s, %s, %s, %s, 'pending')
                    """,
                    (
                        step["id"],
                        job_id,
                        step["step_key"],
                        step["step_index"],
                        step["label"],
                    ),
                )
    finally:
        conn.close()


def get_job(job_id: str) -> dict[str, Any] | None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM tc_agent_jobs WHERE id = %s", (job_id,))
            row = cur.fetchone()
            if not row:
                return None
            steps = list_job_steps(job_id, cur=cur)
            return _job_row_to_dict(row, steps)
    finally:
        conn.close()


def list_job_steps(job_id: str, *, cur=None) -> list[dict[str, Any]]:
    own_conn = cur is None
    conn = get_connection() if own_conn else None
    try:
        cursor = cur or conn.cursor()
        cursor.execute(
            """
            SELECT * FROM tc_agent_steps
            WHERE job_id = %s ORDER BY step_index ASC
            """,
            (job_id,),
        )
        rows = cursor.fetchall()
        return [_step_row_to_dict(r) for r in rows]
    finally:
        if own_conn and conn:
            conn.close()


def _job_row_to_dict(row: dict[str, Any], steps: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "user_id": row.get("user_id"),
        "mode": row["mode"],
        "user_intent": row["user_intent"],
        "status": row["status"],
        "requirements_summary": row.get("requirements_summary") or "",
        "columns": _json_load(row.get("columns_json"), []),
        "existing_rows": _json_load(row.get("existing_rows_json"), []),
        "options": _json_load(row.get("options_json"), {}),
        "result": _json_load(row.get("result_json")),
        "error_message": row.get("error_message"),
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
        "steps": steps,
    }


def _step_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "job_id": row["job_id"],
        "step_key": row["step_key"],
        "step_index": row["step_index"],
        "label": row["label"],
        "status": row["status"],
        "input": _json_load(row.get("input_json")),
        "output": _json_load(row.get("output_json")),
        "error_message": row.get("error_message"),
        "retry_count": row.get("retry_count") or 0,
        "started_at": row["started_at"].isoformat() if row.get("started_at") else None,
        "finished_at": row["finished_at"].isoformat() if row.get("finished_at") else None,
    }




def patch_job_options(job_id: str, patch: dict) -> None:
    """合并更新 job options_json（如写入 ai_quota 元数据）。"""
    ensure_agent_job_tables()
    job = get_job(job_id)
    if not job:
        return
    opts = dict(job.get("options") or {})
    opts.update(patch or {})
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE tc_agent_jobs SET options_json = %s, updated_at = %s WHERE id = %s",
                (_json_dump(opts), datetime.now(), job_id),
            )
    finally:
        conn.close()


def update_job_status(
    job_id: str,
    status: str,
    *,
    requirements_summary: str | None = None,
    result: dict[str, Any] | None = None,
    error_message: str | None = None,
    now: datetime | None = None,
) -> None:
    now = now or datetime.now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            fields = ["status = %s", "updated_at = %s"]
            params: list[Any] = [status, now]
            if requirements_summary is not None:
                fields.append("requirements_summary = %s")
                params.append(requirements_summary)
            if result is not None:
                fields.append("result_json = %s")
                params.append(_json_dump(result))
            if error_message is not None:
                fields.append("error_message = %s")
                params.append(error_message)
            if status == "cancelled":
                fields.append("cancelled_at = %s")
                params.append(now)
            params.append(job_id)
            cur.execute(
                f"UPDATE tc_agent_jobs SET {', '.join(fields)} WHERE id = %s",
                tuple(params),
            )
    finally:
        conn.close()


def update_step(
    step_id: str,
    status: str,
    *,
    output: dict[str, Any] | None = None,
    error_message: str | None = None,
    started_at: datetime | None = None,
    finished_at: datetime | None = None,
) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            fields = ["status = %s"]
            params: list[Any] = [status]
            if output is not None:
                fields.append("output_json = %s")
                params.append(_json_dump(output))
            if error_message is not None:
                fields.append("error_message = %s")
                params.append(error_message)
            if started_at is not None:
                fields.append("started_at = %s")
                params.append(started_at)
            if finished_at is not None:
                fields.append("finished_at = %s")
                params.append(finished_at)
            params.append(step_id)
            cur.execute(
                f"UPDATE tc_agent_steps SET {', '.join(fields)} WHERE id = %s",
                tuple(params),
            )
    finally:
        conn.close()


def is_job_cancelled(job_id: str) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM tc_agent_jobs WHERE id = %s", (job_id,))
            row = cur.fetchone()
            return bool(row and row["status"] == "cancelled")
    finally:
        conn.close()


def cancel_job(job_id: str, now: datetime | None = None) -> bool:
    now = now or datetime.now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tc_agent_jobs
                SET status = 'cancelled', cancelled_at = %s, updated_at = %s
                WHERE id = %s AND status IN ('pending', 'running')
                """,
                (now, now, job_id),
            )
            return cur.rowcount > 0
    finally:
        conn.close()


_STALE_JOB_MSG = "任务已超时或异常中断，请重新发起"


def mark_stale_active_agent_jobs(
    max_age_seconds: int = 900,
    user_id: str | None = None,
) -> int:
    """将长时间无更新的 pending/running Agent 任务标记为 error（进程已不在内存时兜底）。"""
    if max_age_seconds < 60:
        max_age_seconds = 60
    ensure_agent_job_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            sql = """
                UPDATE tc_agent_jobs
                SET status = 'error',
                    error_message = %s,
                    updated_at = NOW()
                WHERE status IN ('pending', 'running')
                  AND updated_at < DATE_SUB(NOW(), INTERVAL %s SECOND)
            """
            params: list[Any] = [_STALE_JOB_MSG, max_age_seconds]
            if user_id:
                sql += " AND user_id = %s"
                params.append(user_id)
            cur.execute(sql, tuple(params))
            return int(cur.rowcount or 0)
    finally:
        conn.close()


def count_active_agent_jobs_for_user(user_id: str | None) -> int:
    if not user_id:
        return 0
    ensure_agent_job_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS c FROM tc_agent_jobs
                WHERE user_id = %s AND status IN ('pending', 'running')
                """,
                (user_id,),
            )
            return int((cur.fetchone() or {}).get("c") or 0)
    finally:
        conn.close()


def clear_job_step_streaming_outputs(job_id: str) -> None:
    """任务结束后移除步骤 output 中的流式思考内容，避免落库膨胀与刷新后残留。"""
    job_id = str(job_id or "").strip()
    if not job_id:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, output_json FROM tc_agent_steps
                WHERE job_id = %s AND output_json IS NOT NULL
                """,
                (job_id,),
            )
            rows = cur.fetchall() or []
            for row in rows:
                raw = row.get("output_json")
                if not raw:
                    continue
                try:
                    loaded = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if not isinstance(loaded, dict):
                    continue
                changed = False
                cleaned = dict(loaded)
                if "reasoning_text" in cleaned:
                    cleaned.pop("reasoning_text", None)
                    changed = True
                if "module_thinking_slots" in cleaned:
                    cleaned.pop("module_thinking_slots", None)
                    changed = True
                if not changed:
                    continue
                cur.execute(
                    "UPDATE tc_agent_steps SET output_json = %s WHERE id = %s",
                    (_json_dump(cleaned) if cleaned else None, row["id"]),
                )
    finally:
        conn.close()


