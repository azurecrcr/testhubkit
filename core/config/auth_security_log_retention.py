"""认证/安全审计日志留存配置（独立于业务 cleanup，默认不少于 180 天）。"""

from __future__ import annotations

import os

_MIN_RETENTION_DAYS = 180


def _flag(name: str, default: str = "true") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


def retention_enabled() -> bool:
    """是否启用超期清理；关闭后不删库，仍保持书面留存不少于 180 天。"""
    return _flag("AUTH_SECURITY_LOG_RETENTION_ENABLED", "true")


def retention_days() -> int:
    """留存天数；下限钳制为 180，防止误配导致审核不合格。"""
    try:
        days = int(os.environ.get("AUTH_SECURITY_LOG_RETENTION_DAYS", str(_MIN_RETENTION_DAYS)))
    except ValueError:
        days = _MIN_RETENTION_DAYS
    return max(_MIN_RETENTION_DAYS, min(days, 3650))


def retention_hour() -> int:
    try:
        hour = int(os.environ.get("AUTH_SECURITY_LOG_RETENTION_HOUR", "4"))
    except ValueError:
        hour = 4
    return max(0, min(hour, 23))


def cleanup_batch_size() -> int:
    try:
        size = int(os.environ.get("AUTH_SECURITY_LOG_RETENTION_BATCH_SIZE", "500"))
    except ValueError:
        size = 500
    return max(1, min(size, 5000))


def cleanup_max_batches() -> int:
    try:
        n = int(os.environ.get("AUTH_SECURITY_LOG_RETENTION_MAX_BATCHES", "100"))
    except ValueError:
        n = 100
    return max(1, min(n, 1000))


def cleanup_batch_sleep_ms() -> int:
    try:
        ms = int(os.environ.get("AUTH_SECURITY_LOG_RETENTION_BATCH_SLEEP_MS", "50"))
    except ValueError:
        ms = 50
    return max(0, min(ms, 5000))


def cleanup_max_runtime_sec() -> int:
    try:
        sec = int(os.environ.get("AUTH_SECURITY_LOG_RETENTION_MAX_RUNTIME_SEC", "300"))
    except ValueError:
        sec = 300
    return max(30, min(sec, 3600))


LOCK_NAME = "auth_sec_log_retention"
MIN_RETENTION_DAYS = _MIN_RETENTION_DAYS
