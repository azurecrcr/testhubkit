"""uploads 目录定时清理（守护线程）。"""

from __future__ import annotations

import datetime
import os
import threading
import time


def _max_age_seconds() -> float:
    hours = float(os.environ.get("UPLOAD_CLEANUP_MAX_AGE_HOURS", "24"))
    if hours <= 0:
        hours = 24.0
    return hours * 3600.0


def cleanup_old_files(uploads_dir: str) -> None:
    while True:
        now = datetime.datetime.now()
        target_time = now.replace(hour=0, minute=0, second=0, microsecond=0)
        if now >= target_time:
            target_time += datetime.timedelta(days=1)

        wait_time = (target_time - now).total_seconds()
        time.sleep(wait_time)

        cutoff_time = time.time() - _max_age_seconds()
        try:
            for filename in os.listdir(uploads_dir):
                filepath = os.path.join(uploads_dir, filename)
                if os.path.isfile(filepath):
                    file_time = os.path.getmtime(filepath)
                    if file_time < cutoff_time:
                        os.remove(filepath)
            print(f"清理完成：{time.strftime('%Y-%m-%d %H:%M:%S')}")
        except Exception as exc:
            print(f"清理文件时出错：{exc}")


def start_cleanup_thread(uploads_dir: str) -> None:
    cleanup_thread = threading.Thread(
        target=cleanup_old_files, args=(uploads_dir,), daemon=True
    )
    cleanup_thread.start()
    print("定时清理线程已启动")
