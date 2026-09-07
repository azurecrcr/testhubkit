"""认证/安全审计日志留存清理（守护线程，默认每日 4 点；保留不少于 180 天）。"""

from __future__ import annotations

import datetime
import threading
import time

from core.config.auth_security_log_retention import (
    retention_days,
    retention_enabled,
    retention_hour,
)
from core.services.auth.auth_security_log_retention_db import purge_expired_auth_security_logs


def run_auth_security_log_retention_once() -> dict:
    return purge_expired_auth_security_logs()


def cleanup_auth_security_log_retention_loop() -> None:
    while True:
        now = datetime.datetime.now()
        hour = retention_hour()
        target_time = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if now >= target_time:
            target_time += datetime.timedelta(days=1)

        wait_time = (target_time - now).total_seconds()
        time.sleep(wait_time)

        if not retention_enabled():
            print("安全日志留存清理跳过：AUTH_SECURITY_LOG_RETENTION_ENABLED=0")
            continue

        try:
            stats = run_auth_security_log_retention_once()
            if stats.get("lock_skipped"):
                print(
                    "安全日志留存清理跳过：其他 worker 持有锁 %s"
                    % time.strftime("%Y-%m-%d %H:%M:%S")
                )
                continue
            print(
                "安全日志留存清理完成：retention=%s deleted=%s batches=%s "
                "stopped_by=%s elapsed=%ss per_table=%s %s"
                % (
                    stats.get("retention_days") or retention_days(),
                    stats.get("deleted") or 0,
                    stats.get("batches") or 0,
                    stats.get("stopped_by") or "-",
                    stats.get("elapsed_sec") or 0,
                    stats.get("deleted_per_table") or {},
                    time.strftime("%Y-%m-%d %H:%M:%S"),
                )
            )
        except Exception as exc:  # noqa: BLE001
            print("安全日志留存清理出错：%s" % exc)


def start_auth_security_log_retention_thread() -> None:
    if not retention_enabled():
        print(
            "安全日志留存清理线程未启动：AUTH_SECURITY_LOG_RETENTION_ENABLED=0"
            "（政策仍写明留存不少于 %s 天）" % retention_days()
        )
        return
    thread = threading.Thread(target=cleanup_auth_security_log_retention_loop, daemon=True)
    thread.start()
    print(
        "安全日志留存清理线程已启动（每日 %s 点，保留 ≥%s 天）"
        % (retention_hour(), retention_days()),
        flush=True,
    )
