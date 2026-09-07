"""用户登录日志写入（内部审计，失败静默，不影响登录主流程）。"""
from __future__ import annotations

import time
from typing import Optional

from core.services.auth.rate_limit import normalize_email
from core.services.test_cases.mysql_db import get_connection

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS hub_login_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
    user_id CHAR(32) NULL DEFAULT NULL COMMENT '登录成功后的用户ID，失败时为空',
    email VARCHAR(255) NOT NULL DEFAULT '' COMMENT '登录尝试邮箱',
    login_method VARCHAR(32) NOT NULL DEFAULT '' COMMENT '登录方式：password/code 等',
    success TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否登录成功：1成功 0失败',
    client_ip VARCHAR(45) NOT NULL DEFAULT '' COMMENT '客户端IP',
    user_agent VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'User-Agent',
    failure_reason VARCHAR(255) NULL DEFAULT NULL COMMENT '失败原因摘要',
    created_at DATETIME NOT NULL COMMENT '登录尝试时间',
    INDEX idx_hub_login_log_user (user_id, created_at),
    INDEX idx_hub_login_log_email (email, created_at),
    INDEX idx_hub_login_log_ip (client_ip, created_at),
    INDEX idx_hub_login_log_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='用户登录日志（内部审计，不对外展示）'
"""

_table_ready = False


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _normalize_email_safe(email: str) -> str:
    try:
        return normalize_email(email or "")
    except ValueError:
        return (email or "").strip().lower()[:255]


def _client_ip_from_request() -> str:
    try:
        from flask import has_request_context, request

        if not has_request_context():
            return ""
        forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
        return forwarded or (request.remote_addr or "")
    except Exception:
        return ""


def _user_agent_from_request() -> str:
    try:
        from flask import has_request_context, request

        if not has_request_context():
            return ""
        return (request.headers.get("User-Agent") or "")[:512]
    except Exception:
        return ""


def _resolve_login_method(explicit: str) -> str:
    method = (explicit or "").strip()[:32]
    if method:
        return method
    try:
        from flask import has_request_context, request

        if not has_request_context():
            return "session"
        path = request.path or ""
        if "/auth/login/password" in path:
            return "password"
        if "/auth/login/code" in path:
            return "code"
        if "/auth/register" in path:
            return "register"
    except Exception:
        pass
    return "session"


def ensure_hub_login_log_table() -> None:
    global _table_ready
    if _table_ready:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
        _table_ready = True
    finally:
        conn.close()


def record_login_attempt(
    *,
    email: str,
    login_method: str,
    success: bool,
    user_id: Optional[str] = None,
    client_ip: str = "",
    user_agent: str = "",
    failure_reason: Optional[str] = None,
) -> None:
    """写入一条登录日志；任何异常均被吞掉，不向上抛出。"""
    try:
        ensure_hub_login_log_table()
        norm_email = _normalize_email_safe(email)
        method = (login_method or "").strip()[:32] or "unknown"
        uid = (user_id or "").strip()[:32] or None
        ip = (client_ip or "").strip()[:45]
        ua = (user_agent or "").strip()[:512]
        reason = (failure_reason or "").strip()[:255] or None
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO hub_login_log
                        (user_id, email, login_method, success, client_ip, user_agent, failure_reason, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        uid,
                        norm_email,
                        method,
                        1 if success else 0,
                        ip,
                        ua,
                        reason,
                        _now_str(),
                    ),
                )
        finally:
            conn.close()
    except Exception:
        return


def record_login_success(
    user_id: str,
    *,
    login_method: str = "",
    login_email: str = "",
    client_ip: str = "",
    user_agent: str = "",
) -> None:
    """登录成功后写入日志（供 login_user 调用，失败静默）。"""
    try:
        email = (login_email or "").strip()
        if not email:
            from core.services.auth.user_service import get_user_by_id

            user = get_user_by_id(user_id)
            email = str((user or {}).get("email") or "")
        record_login_attempt(
            email=email,
            login_method=_resolve_login_method(login_method),
            success=True,
            user_id=user_id,
            client_ip=client_ip or _client_ip_from_request(),
            user_agent=user_agent or _user_agent_from_request(),
        )
    except Exception:
        return
