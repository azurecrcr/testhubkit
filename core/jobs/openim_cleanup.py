"""OpenIM（MinIO）多媒体对象定时清理（守护线程）。"""

from __future__ import annotations

import datetime
import threading
import time

from core.config import openim_storage as cfg
from core.services.storage import get_openim_storage, is_openim_storage_enabled


def _max_age_hours() -> float:
    hours = cfg.OPENIM_CLEANUP_MAX_AGE_HOURS
    if hours <= 0:
        hours = 24.0
    return hours


def cleanup_openim_media_objects() -> None:
    while True:
        now = datetime.datetime.now()
        target_time = now.replace(hour=0, minute=0, second=0, microsecond=0)
        if now >= target_time:
            target_time += datetime.timedelta(days=1)

        wait_time = (target_time - now).total_seconds()
        time.sleep(wait_time)

        if not is_openim_storage_enabled():
            print("OpenIM 清理跳过：未配置 MinIO")
            continue

        try:
            storage = get_openim_storage()
            deleted = storage.cleanup_older_than(_max_age_hours())
            print(
                f"OpenIM 媒体清理完成：删除 {deleted} 个对象，"
                f"{time.strftime('%Y-%m-%d %H:%M:%S')}"
            )
        except Exception as exc:
            print(f"OpenIM 媒体清理出错：{exc}")


def start_openim_cleanup_thread() -> None:
    if not is_openim_storage_enabled():
        print("OpenIM 清理线程未启动：未配置 MinIO")
        return
    thread = threading.Thread(target=cleanup_openim_media_objects, daemon=True)
    thread.start()
    print("OpenIM 媒体清理线程已启动")
