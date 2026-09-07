"""管理员站点日报 API（手工补推 / 预览；不影响其它 admin 接口）。"""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.auth.admin_guard import get_admin_user


def register_routes(bp: Blueprint) -> None:
    @bp.post("/admin/daily-stats/push")
    def admin_daily_stats_push():
        if not get_admin_user():
            return jsonify({"error": "需要管理员权限", "code": "ADMIN_REQUIRED"}), 403
        data = request.get_json(silent=True) or {}
        stat_date = str(data.get("stat_date") or "").strip()[:10] or None
        force = bool(data.get("force"))
        from core.services.auth.admin_daily_stats_notify import run_admin_daily_stats_push

        result = run_admin_daily_stats_push(stat_date=stat_date, force=force)
        status = 200 if result.get("ok") else 500
        return jsonify(result), status

    @bp.get("/admin/daily-stats/preview")
    def admin_daily_stats_preview():
        if not get_admin_user():
            return jsonify({"error": "需要管理员权限", "code": "ADMIN_REQUIRED"}), 403
        day = str(request.args.get("stat_date") or "").strip()[:10]
        from core.services.auth.site_daily_stats_db import (
            collect_site_daily_stats,
            list_manager_user_ids_for_daily_stats,
            yesterday_stat_date,
        )

        if not day:
            day = yesterday_stat_date()
        try:
            stats = collect_site_daily_stats(day)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        managers = list_manager_user_ids_for_daily_stats()
        return jsonify(
            {
                "ok": True,
                "stats": stats,
                "manager_count": len(managers),
            }
        )

    @bp.get("/admin/daily-stats/login-users")
    def admin_daily_stats_login_users():
        """站点日报详情：查看某日登录活跃用户列表。"""
        if not get_admin_user():
            return jsonify({"error": "需要管理员权限", "code": "ADMIN_REQUIRED"}), 403
        day = str(request.args.get("stat_date") or "").strip()[:10]
        from core.services.auth.site_daily_stats_db import (
            list_login_users_for_daily_stats,
            normalize_stat_date,
            yesterday_stat_date,
        )

        if not day:
            day = yesterday_stat_date()
        day = normalize_stat_date(day)
        if not day:
            return jsonify({"error": "无效的统计日期"}), 400
        users = list_login_users_for_daily_stats(day)
        return jsonify(
            {
                "ok": True,
                "stat_date": day,
                "count": len(users),
                "users": users,
            }
        )

    @bp.get("/admin/daily-stats/anon-visitors")
    def admin_daily_stats_anon_visitors():
        """站点日报详情：查看某日离线访客（IP + 地区）。"""
        if not get_admin_user():
            return jsonify({"error": "需要管理员权限", "code": "ADMIN_REQUIRED"}), 403
        day = str(request.args.get("stat_date") or "").strip()[:10]
        from core.services.auth.site_daily_stats_db import (
            list_anon_visitors_for_daily_stats,
            normalize_stat_date,
            yesterday_stat_date,
        )

        if not day:
            day = yesterday_stat_date()
        day = normalize_stat_date(day)
        if not day:
            return jsonify({"error": "无效的统计日期"}), 400
        clean_only = str(request.args.get("clean") or "").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        visitors = list_anon_visitors_for_daily_stats(day, clean_only=clean_only)
        return jsonify(
            {
                "ok": True,
                "stat_date": day,
                "count": len(visitors),
                "clean_only": clean_only,
                "visitors": visitors,
            }
        )
