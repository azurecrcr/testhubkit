"""管理员站点日报推送（守护线程，每日 0 点推送「昨天」数据）。"""
from __future__ import annotations

import datetime
import os
import threading
import time


def _push_enabled() -> bool:
    raw = os.environ.get("ADMIN_DAILY_STATS_PUSH", "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def run_admin_daily_stats_push_once(*, force: bool = False) -> dict:
    from core.services.auth.admin_daily_stats_notify import run_admin_daily_stats_push

    return run_admin_daily_stats_push(force=force)


def admin_daily_stats_push_loop() -> None:
    while True:
        now = datetime.datetime.now()
        target_time = now.replace(hour=0, minute=0, second=0, microsecond=0)
        if now >= target_time:
            target_time += datetime.timedelta(days=1)

        wait_time = (target_time - now).total_seconds()
        time.sleep(wait_time)

        if not _push_enabled():
            print("管理员站点日报推送跳过：ADMIN_DAILY_STATS_PUSH=0")
            continue

        # 稍等片刻，避开整点其它清理任务尖峰
        time.sleep(8)
        try:
            result = run_admin_daily_stats_push_once(force=False)
            if result.get("skipped"):
                print(
                    "管理员站点日报推送跳过（幂等）：%s %s"
                    % (result.get("stat_date"), time.strftime("%Y-%m-%d %H:%M:%S"))
                )
            elif result.get("ok"):
                stats = result.get("stats") or {}
                print(
                    "管理员站点日报推送完成：date=%s login=%s/%s anon=%s/%s sent=%s/%s %s"
                    % (
                        result.get("stat_date"),
                        stats.get("login_dau_unique"),
                        stats.get("login_dau_total"),
                        stats.get("anon_uv_unique"),
                        stats.get("anon_uv_total"),
                        result.get("sent"),
                        result.get("manager_count"),
                        time.strftime("%Y-%m-%d %H:%M:%S"),
                    )
                )
            else:
                print(
                    "管理员站点日报推送失败：%s %s"
                    % (result.get("error"), time.strftime("%Y-%m-%d %H:%M:%S"))
                )
        except Exception as exc:  # noqa: BLE001
            print("管理员站点日报推送出错：%s" % exc)


def start_admin_daily_stats_push_thread() -> None:
    if not _push_enabled():
        print("管理员站点日报推送线程未启动：ADMIN_DAILY_STATS_PUSH=0")
        return
    thread = threading.Thread(target=admin_daily_stats_push_loop, daemon=True)
    thread.start()
    print("管理员站点日报推送线程已启动（每日 0 点，推送昨日数据）")
