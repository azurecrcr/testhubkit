"""管理员：用户 AI 每日增额授予 API（独立蓝图，不影响其它 admin 接口）。"""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.auth.admin_guard import get_admin_user
from core.services.auth.auth_session import get_current_user_id


def _require_admin():
    if not get_current_user_id():
        return jsonify({"error": "请先登录", "code": "AUTH_REQUIRED"}), 401
    if not get_admin_user():
        return jsonify({"error": "需要管理员权限", "code": "ADMIN_REQUIRED"}), 403
    return None


def register_routes(bp: Blueprint) -> None:
    @bp.post("/admin/ai-quota-bonus")
    def admin_ai_quota_bonus_create():
        denied = _require_admin()
        if denied:
            return denied
        data = request.get_json(silent=True) or {}
        admin = get_admin_user() or {}
        try:
            from core.services.ai.user_ai_quota_bonus_service import (
                create_grant,
                preview_quota_for_user,
            )

            grant = create_grant(
                account=str(data.get("account") or data.get("user_id") or "").strip(),
                bonus_text=data.get("bonus_text", 0),
                bonus_vision=data.get("bonus_vision", 0),
                bonus_cursor=data.get("bonus_cursor", 0),
                start_date=str(data.get("start_date") or "").strip(),
                end_date=str(data.get("end_date") or "").strip(),
                note=str(data.get("note") or "").strip(),
                created_by=str(admin.get("id") or "").strip() or None,
            )
            preview = preview_quota_for_user(str(grant.get("user_id") or ""))
            return jsonify({"error": None, "grant": grant, "preview": preview})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": f"创建失败: {exc}"}), 500

    @bp.get("/admin/ai-quota-bonus")
    def admin_ai_quota_bonus_list():
        denied = _require_admin()
        if denied:
            return denied
        try:
            page = int(request.args.get("page") or 1)
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.args.get("page_size") or 20)
        except (TypeError, ValueError):
            page_size = 20
        account = str(request.args.get("account") or request.args.get("user_id") or "").strip()
        status = str(request.args.get("status") or "all").strip()
        try:
            from core.services.ai.user_ai_quota_bonus_service import list_grants_admin

            data = list_grants_admin(
                account=account or None,
                status=status,
                page=page,
                page_size=page_size,
            )
            return jsonify({"error": None, **data})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": f"查询失败: {exc}"}), 500

    @bp.get("/admin/ai-quota-bonus/preview")
    def admin_ai_quota_bonus_preview():
        denied = _require_admin()
        if denied:
            return denied
        account = str(request.args.get("account") or request.args.get("user_id") or "").strip()
        if not account:
            return jsonify({"error": "请输入账号"}), 400
        try:
            from core.services.ai.user_ai_quota_bonus_service import preview_quota_for_user

            data = preview_quota_for_user(account)
            return jsonify({"error": None, **data})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": f"预览失败: {exc}"}), 500

    @bp.post("/admin/ai-quota-bonus/<grant_id>/revoke")
    def admin_ai_quota_bonus_revoke(grant_id: str):
        denied = _require_admin()
        if denied:
            return denied
        admin = get_admin_user() or {}
        try:
            from core.services.ai.user_ai_quota_bonus_service import (
                preview_quota_for_user,
                revoke_grant,
            )

            grant = revoke_grant(
                grant_id,
                revoked_by=str(admin.get("id") or "").strip() or None,
            )
            preview = preview_quota_for_user(str(grant.get("user_id") or ""))
            return jsonify({"error": None, "grant": grant, "preview": preview})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": f"撤销失败: {exc}"}), 500
