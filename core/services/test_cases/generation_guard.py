"""用例生成：速率限制、并发控制、请求日志。"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta

from core.services.test_cases.agent_job_db import count_active_agent_jobs_for_user
from core.services.test_cases.generation_session_db import count_active_generation_sessions_for_user
from core.services.test_cases.mysql_db import get_connection

_log = logging.getLogger(__name__)

GEN_RATE_PER_MINUTE = int(os.environ.get("TC_GEN_RATE_PER_MIN", "5"))
GEN_RATE_IP_PER_MINUTE = int(os.environ.get("TC_GEN_RATE_IP_PER_MIN", "20"))
STALE_TASK_MAX_AGE_SECONDS = int(os.environ.get("TC_GEN_STALE_MAX_AGE_SEC", "900"))

_LOG_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS tc_generation_request_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(32) NULL,
    client_ip VARCHAR(45) NOT NULL DEFAULT '',
    action VARCHAR(32) NOT NULL,
    mode VARCHAR(32) NOT NULL DEFAULT '',
    prompt_chars INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    INDEX idx_tc_gen_log_user_time (user_id, created_at),
    INDEX idx_tc_gen_log_ip_time (client_ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


class GenerationRateLimitError(ValueError):
    def __init__(self, message: str, retry_after_sec: int = 60):
        super().__init__(message)
        self.retry_after_sec = retry_after_sec


def ensure_generation_guard_tables() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_LOG_TABLE_SQL)
    finally:
        conn.close()


def client_ip_from_request(request) -> str:
    if request is None:
        return ""
    forwarded = (request.headers.get("X-Forwarded-For") or "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    return (request.remote_addr or "").strip()[:45]


def _count_recent_requests(
    *,
    user_id: str | None,
    client_ip: str,
    since: datetime,
) -> tuple[int, int]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            since_str = since.strftime("%Y-%m-%d %H:%M:%S")
            user_count = 0
            if user_id:
                cur.execute(
                    """
                    SELECT COUNT(*) AS c FROM tc_generation_request_log
                    WHERE user_id = %s AND created_at >= %s
                    """,
                    (user_id, since_str),
                )
                user_count = int((cur.fetchone() or {}).get("c") or 0)
            ip_count = 0
            if client_ip:
                cur.execute(
                    """
                    SELECT COUNT(*) AS c FROM tc_generation_request_log
                    WHERE client_ip = %s AND created_at >= %s
                    """,
                    (client_ip, since_str),
                )
                ip_count = int((cur.fetchone() or {}).get("c") or 0)
            return user_count, ip_count
    finally:
        conn.close()


def _insert_request_log(
    *,
    user_id: str | None,
    client_ip: str,
    action: str,
    mode: str,
    prompt_chars: int,
) -> None:
    now = datetime.now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_generation_request_log
                (user_id, client_ip, action, mode, prompt_chars, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    client_ip or "",
                    action[:32],
                    (mode or "")[:32],
                    max(0, int(prompt_chars or 0)),
                    now,
                ),
            )
    finally:
        conn.close()


def reconcile_stale_generation_tasks(user_id: str | None = None) -> dict[str, int]:
    """回收超时/孤儿 Agent 任务与流式生成会话，避免并发检查误拦新任务。"""
    from core.services.test_cases.agent_job_db import mark_stale_active_agent_jobs
    from core.services.test_cases.agent_orchestrator_service import recover_stale_agent_jobs
    from core.services.test_cases.generation_session_db import mark_stale_active_generation_sessions

    max_age = max(60, STALE_TASK_MAX_AGE_SECONDS)
    step_recovered = recover_stale_agent_jobs(max_age_seconds=max_age)
    jobs_marked = mark_stale_active_agent_jobs(max_age_seconds=max_age, user_id=user_id)
    sessions_marked = mark_stale_active_generation_sessions(
        max_age_seconds=max_age, user_id=user_id
    )
    try:
        purge_stale_generation_artifacts(retention_days=3)
    except Exception:
        pass
    total = step_recovered + jobs_marked + sessions_marked
    if total > 0:
        _log.info(
            "tc_gen stale reconcile user=%s agent_step=%s agent_marked=%s sessions=%s",
            user_id or "-",
            step_recovered,
            jobs_marked,
            sessions_marked,
        )
    return {
        "agent_step_recovered": step_recovered,
        "agent_marked": jobs_marked,
        "sessions_marked": sessions_marked,
    }


def assert_generation_allowed(
    *,
    request,
    user_id: str | None,
    action: str,
    prompt: str = "",
    mode: str = "",
    check_agent_concurrency: bool = False,
    check_session_concurrency: bool = False,
) -> None:
    """校验速率与并发；通过后会写入请求日志。"""
    ensure_generation_guard_tables()
    client_ip = client_ip_from_request(request)
    prompt_chars = len(str(prompt or ""))
    since = datetime.now() - timedelta(seconds=60)
    user_count, ip_count = _count_recent_requests(
        user_id=user_id, client_ip=client_ip, since=since
    )

    if user_id and user_count >= GEN_RATE_PER_MINUTE:
        raise GenerationRateLimitError(
            f"生成过于频繁，请 {60} 秒后再试（每用户每分钟最多 {GEN_RATE_PER_MINUTE} 次）",
            retry_after_sec=60,
        )
    if client_ip and ip_count >= GEN_RATE_IP_PER_MINUTE:
        raise GenerationRateLimitError(
            f"当前网络生成请求过于频繁，请稍后再试（每 IP 每分钟最多 {GEN_RATE_IP_PER_MINUTE} 次）",
            retry_after_sec=60,
        )

    if check_agent_concurrency or check_session_concurrency:
        reconcile_stale_generation_tasks(user_id=user_id)

    if check_agent_concurrency and user_id:
        active = count_active_agent_jobs_for_user(user_id)
        if active > 0:
            raise GenerationRateLimitError(
                "已有 Agent 任务正在执行，请等待完成或取消后再启动新任务",
                retry_after_sec=30,
            )

    if check_session_concurrency and user_id:
        active = count_active_generation_sessions_for_user(user_id)
        if active > 0:
            raise GenerationRateLimitError(
                "已有用例生成任务正在进行，请等待完成或取消后再试",
                retry_after_sec=30,
            )

    _insert_request_log(
        user_id=user_id,
        client_ip=client_ip,
        action=action,
        mode=mode,
        prompt_chars=prompt_chars,
    )
    _log.info(
        "tc_gen action=%s user=%s ip=%s mode=%s prompt_chars=%s",
        action,
        user_id or "-",
        client_ip or "-",
        mode or "-",
        prompt_chars,
    )

def purge_stale_generation_artifacts(retention_days: int = 3) -> dict[str, int]:
    """清理过期流式事件与 Agent 步骤输出，避免 InnoDB 膨胀占满磁盘。"""
    from core.services.test_cases.mysql_db import get_connection

    days = max(1, int(retention_days))
    stats = {"session_events": 0, "sessions": 0, "agent_outputs": 0}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE e FROM tc_generation_session_events e
                JOIN tc_generation_sessions s ON s.id = e.session_id
                WHERE s.created_at < DATE_SUB(NOW(), INTERVAL %s DAY)
                """,
                (days,),
            )
            stats["session_events"] = int(cur.rowcount or 0)
            cur.execute(
                """
                DELETE FROM tc_generation_sessions
                WHERE created_at < DATE_SUB(NOW(), INTERVAL %s DAY)
                """,
                (days,),
            )
            stats["sessions"] = int(cur.rowcount or 0)
            cur.execute(
                """
                UPDATE tc_agent_steps
                SET output_json = NULL
                WHERE status IN ('done', 'error', 'cancelled')
                  AND output_json IS NOT NULL
                  AND finished_at IS NOT NULL
                  AND finished_at < DATE_SUB(NOW(), INTERVAL %s DAY)
                """,
                (days,),
            )
            stats["agent_outputs"] = int(cur.rowcount or 0)
    finally:
        conn.close()
    return stats

