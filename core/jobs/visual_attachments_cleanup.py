"""视觉附件定时清理（守护线程，每日 0 点）。"""
from __future__ import annotations

import datetime
import os
import threading
import time

from core.services.visual_attachments.cleanup_service import purge_all_expired_visual_attachments


def _cleanup_enabled() -> bool:
    raw = os.environ.get("VISUAL_ATTACH_CLEANUP_ENABLED", "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def run_visual_attachments_cleanup_once() -> dict[str, int]:
    return purge_all_expired_visual_attachments()


def cleanup_expired_visual_attachments_loop() -> None:
    while True:
        now = datetime.datetime.now()
        target_time = now.replace(hour=0, minute=0, second=0, microsecond=0)
        if now >= target_time:
            target_time += datetime.timedelta(days=1)

        wait_time = (target_time - now).total_seconds()
        time.sleep(wait_time)

        if not _cleanup_enabled():
            print("视觉附件清理跳过：VISUAL_ATTACH_CLEANUP_ENABLED=0")
            continue

        try:
            stats = run_visual_attachments_cleanup_once()
            print(
                "视觉附件清理完成：删除 assets=%s contexts=%s %s"
                % (stats.get("assets", 0), stats.get("contexts", 0), time.strftime("%Y-%m-%d %H:%M:%S"))
            )
        except Exception as exc:
            print("视觉附件清理出错：%s" % exc)


def start_visual_attachments_cleanup_thread() -> None:
    if not _cleanup_enabled():
        print("视觉附件清理线程未启动：VISUAL_ATTACH_CLEANUP_ENABLED=0")
        return
    thread = threading.Thread(target=cleanup_expired_visual_attachments_loop, daemon=True)
    thread.start()
    print("视觉附件清理线程已启动（每日 0 点）")
