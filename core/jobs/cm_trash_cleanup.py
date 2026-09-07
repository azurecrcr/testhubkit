"""用例回收站过期清理（守护线程，默认每日 3 点）。"""

from __future__ import annotations

import datetime
import os
import threading
import time

from core.services.case_management.trash_cleanup_db import (
    purge_all_expired_trash,
    retention_days,
)


def _cleanup_enabled() -> bool:
    raw = os.environ.get("CM_TRASH_CLEANUP_ENABLED", "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _cleanup_hour() -> int:
    try:
        hour = int(os.environ.get("CM_TRASH_CLEANUP_HOUR", "3"))
    except ValueError:
        hour = 3
    return max(0, min(hour, 23))


def run_cm_trash_cleanup_once() -> dict:
    return purge_all_expired_trash()


def cleanup_expired_cm_trash_loop() -> None:
    while True:
        now = datetime.datetime.now()
        hour = _cleanup_hour()
        target_time = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if now >= target_time:
            target_time += datetime.timedelta(days=1)

        wait_time = (target_time - now).total_seconds()
        time.sleep(wait_time)

        if not _cleanup_enabled():
            print("用例回收站清理跳过：CM_TRASH_CLEANUP_ENABLED=0")
            continue

        try:
            stats = run_cm_trash_cleanup_once()
            if stats.get("lock_skipped"):
                print(
                    "用例回收站清理跳过：其他 worker 持有锁 %s"
                    % time.strftime("%Y-%m-%d %H:%M:%S")
                )
                continue
            print(
                "用例回收站清理完成：retention=%s deleted=%s skipped=%s missing=%s "
                "batches=%s errors=%s stopped_by=%s elapsed=%ss %s"
                % (
                    stats.get("retention_days") or retention_days(),
                    stats.get("deleted") or 0,
                    stats.get("skipped") or 0,
                    stats.get("missing") or 0,
                    stats.get("batches") or 0,
                    len(stats.get("errors") or []),
                    stats.get("stopped_by") or "-",
                    stats.get("elapsed_sec") or 0,
                    time.strftime("%Y-%m-%d %H:%M:%S"),
                )
            )
        except Exception as exc:  # noqa: BLE001
            print("用例回收站清理出错：%s" % exc)


def start_cm_trash_cleanup_thread() -> None:
    if not _cleanup_enabled():
        print("用例回收站清理线程未启动：CM_TRASH_CLEANUP_ENABLED=0")
        return
    thread = threading.Thread(target=cleanup_expired_cm_trash_loop, daemon=True)
    thread.start()
    print(
        "用例回收站清理线程已启动（每日 %s 点，保留 %s 天）"
        % (_cleanup_hour(), retention_days()),
        flush=True,
    )
