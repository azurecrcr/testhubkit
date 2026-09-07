"""管理员站点日报站内信推送（独立于 L5 / 缺陷通知）。"""
from __future__ import annotations

from typing import Any, Dict, List

from core.services.auth.site_daily_stats_db import (
    collect_site_daily_stats,
    list_manager_user_ids_for_daily_stats,
    mark_daily_stats_push_done,
    mark_daily_stats_push_failed,
    normalize_stat_date,
    try_claim_daily_stats_push,
)
from core.services.case_management.message_db import create_message

MSG_TYPE_DAILY_STATS = "system_daily_stats"
REF_TYPE_DAILY_STATS = "site_daily_stats"


def _i(stats: Dict[str, Any], *keys: str) -> int:
    for k in keys:
        if k in stats and stats.get(k) is not None:
            return int(stats.get(k) or 0)
    return 0


def build_admin_daily_stats_message(stats: Dict[str, Any]) -> Dict[str, str]:
    """排版友好的纯文本日报（站内信 body 限长，控制在 1000 字内）。"""
    day = str(stats.get("stat_date") or "")
    reg = _i(stats, "register_count")
    login_total = _i(stats, "login_dau_total")
    login_unique = _i(stats, "login_dau_unique", "login_dau")
    anon_total = _i(stats, "anon_uv_total")
    anon_unique = _i(stats, "anon_uv_unique", "anon_uv")
    anon_clean_total = _i(stats, "anon_uv_clean_total")
    anon_clean_unique = _i(stats, "anon_uv_clean_unique")

    title = "站点日报 · %s" % day
    # 等宽对齐，阅读更清晰
    body = (
        "TestHub 站点日报\n"
        "统计日期  {day}\n"
        "────────────────────────\n"
        "【注册用户】\n"
        "  总日活（访问次数）    {login_total}\n"
        "  去重日活（独立用户）  {login_unique}\n"
        "\n"
        "【离线访客】\n"
        "  总日活（访问次数）    {anon_total}\n"
        "  去重日活（独立访客）  {anon_unique}\n"
        "  有效曝光去重（去噪）  {anon_clean_unique}\n"
        "────────────────────────\n"
        "附：当日新注册 {reg} 人\n"
        "说明：总日活为埋点写入次数合计；"
        "去重按账号 / 访客 cookie；"
        "有效曝光已排除纯首页与探测路径噪音。"
    ).format(
        day=day,
        login_total=login_total,
        login_unique=login_unique,
        anon_total=anon_total,
        anon_unique=anon_unique,
        anon_clean_unique=anon_clean_unique,
        reg=reg,
    )
    return {"title": title, "body": body[:1000]}


def push_admin_daily_stats_messages(
    stats: Dict[str, Any],
    manager_ids: List[str],
) -> Dict[str, Any]:
    """向管理员列表各发一条日报消息；不复用 notify_users_l5。"""
    built = build_admin_daily_stats_message(stats)
    day = str(stats.get("stat_date") or "")
    payload = {
        "stat_date": day,
        "register_count": _i(stats, "register_count"),
        "login_dau": _i(stats, "login_dau_unique", "login_dau"),
        "login_dau_unique": _i(stats, "login_dau_unique", "login_dau"),
        "login_dau_total": _i(stats, "login_dau_total"),
        "anon_uv": _i(stats, "anon_uv_unique", "anon_uv"),
        "anon_uv_unique": _i(stats, "anon_uv_unique", "anon_uv"),
        "anon_uv_total": _i(stats, "anon_uv_total"),
        "anon_uv_clean_unique": _i(stats, "anon_uv_clean_unique"),
        "anon_uv_clean_total": _i(stats, "anon_uv_clean_total"),
        "combined_reference": _i(stats, "combined_reference"),
        "generated_at": str(stats.get("generated_at") or ""),
    }
    sent = 0
    errors: List[str] = []
    for uid in manager_ids:
        try:
            create_message(
                user_id=uid,
                msg_type=MSG_TYPE_DAILY_STATS,
                title=built["title"],
                body=built["body"],
                ref_type=REF_TYPE_DAILY_STATS,
                ref_id=day,
                payload=payload,
            )
            sent += 1
        except Exception as exc:  # noqa: BLE001
            errors.append("%s:%s" % (uid[:8], exc))
    return {"sent": sent, "errors": errors[:10], "title": built["title"]}


def run_admin_daily_stats_push(
    *,
    stat_date: str | None = None,
    force: bool = False,
) -> Dict[str, Any]:
    """
    聚合昨日（或指定日）指标并推送给全部 manager。
    force=False 时按 stat_date 幂等；多 worker 仅一个成功占坑。
    """
    day = normalize_stat_date(stat_date or "")
    if not day:
        from core.services.auth.site_daily_stats_db import yesterday_stat_date

        day = yesterday_stat_date()

    claimed = try_claim_daily_stats_push(day, force=force)
    if not claimed:
        return {
            "ok": True,
            "skipped": True,
            "reason": "already_claimed_or_done",
            "stat_date": day,
        }

    try:
        stats = collect_site_daily_stats(day)
        managers = list_manager_user_ids_for_daily_stats()
        push_result = push_admin_daily_stats_messages(stats, managers)
        mark_daily_stats_push_done(
            day,
            register_count=int(stats["register_count"]),
            login_dau=int(stats["login_dau_unique"]),
            anon_uv=int(stats["anon_uv_unique"]),
            recipient_count=int(push_result.get("sent") or 0),
        )
        return {
            "ok": True,
            "skipped": False,
            "stat_date": day,
            "stats": stats,
            "manager_count": len(managers),
            "sent": int(push_result.get("sent") or 0),
            "errors": push_result.get("errors") or [],
        }
    except Exception as exc:  # noqa: BLE001
        mark_daily_stats_push_failed(day, str(exc))
        return {
            "ok": False,
            "skipped": False,
            "stat_date": day,
            "error": str(exc),
        }
