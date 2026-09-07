"""统一功能锁开关 API。"""

from flask import Blueprint, jsonify, request

from core.services.auth.auth_session import get_current_user_id
from core.services.auth.prompt_visibility_admin import is_site_manager
from core.services.auth.user_service import get_user_by_id
from core.services.toolkit_lock.toolkit_lock_db import (
    get_toolkit_lock_status,
    get_toolkit_lock_status_for_api,
    set_prompt_cards_blur,
    set_toolkit_switches,
    toggle_prompt_cards_blur,
)


def _require_prompt_visibility_admin():
    uid = get_current_user_id()
    if not uid:
        return None, (jsonify({"error": "请先登录", "code": "AUTH_REQUIRED"}), 401)
    user = get_user_by_id(uid)
    if not user or not is_site_manager(user):
        return None, (jsonify({"error": "无权操作全站公共开关"}), 403)
    return user, None


def register_routes(bp: Blueprint) -> None:
    @bp.route("/toolkit-lock", methods=["GET"])
    def api_toolkit_lock():
        return jsonify(get_toolkit_lock_status_for_api())

    @bp.route("/toolkit-lock/admin-set", methods=["POST"])
    def api_admin_set_toolkit():
        """管理员批量设置全站公共开关（独立接口，不依赖 AI 配置保存）。"""
        _, err = _require_prompt_visibility_admin()
        if err:
            return err
        data = request.get_json(silent=True) or {}
        if not any(k in data for k in ("is_locked", "prompt_cards_blur", "uia_run_blocked", "uia_global_exclusive", "uia_tunnel_mcp_pool", "uia_tunnel_mcp_pool_max", "uia_tunnel_mcp_pool_ttl_sec")):
            return jsonify({"error": "缺少开关参数"}), 400
        try:
            result = set_toolkit_switches(
                is_locked=data.get("is_locked") if "is_locked" in data else None,
                prompt_cards_blur=data.get("prompt_cards_blur")
                if "prompt_cards_blur" in data
                else None,
                uia_run_blocked=data.get("uia_run_blocked")
                if "uia_run_blocked" in data
                else None,
                uia_global_exclusive=data.get("uia_global_exclusive")
                if "uia_global_exclusive" in data
                else None,
                uia_tunnel_mcp_pool=data.get("uia_tunnel_mcp_pool")
                if "uia_tunnel_mcp_pool" in data
                else None,
                uia_tunnel_mcp_pool_max=data.get("uia_tunnel_mcp_pool_max")
                if "uia_tunnel_mcp_pool_max" in data
                else None,
                uia_tunnel_mcp_pool_ttl_sec=data.get("uia_tunnel_mcp_pool_ttl_sec")
                if "uia_tunnel_mcp_pool_ttl_sec" in data
                else None,
            )
            return jsonify(
                {
                    "is_locked": bool(result.get("is_locked")),
                    "prompt_cards_blur": bool(result.get("prompt_cards_blur")),
                    "uia_run_blocked": bool(result.get("uia_run_blocked", True)),
                    "uia_global_exclusive": bool(result.get("uia_global_exclusive", True)),
                    "uia_tunnel_mcp_pool": bool(result.get("uia_tunnel_mcp_pool", True)),
                    "uia_tunnel_mcp_pool_max": int(result.get("uia_tunnel_mcp_pool_max") or 3),
                    "uia_tunnel_mcp_pool_ttl_sec": int(result.get("uia_tunnel_mcp_pool_ttl_sec") or 1800),
                }
            )
        except Exception as exc:
            return jsonify({"error": f"保存开关失败：{exc}"}), 500

    @bp.route("/toolkit-lock/prompt-cards-blur/toggle", methods=["POST"])
    def api_toggle_prompt_cards_blur():
        """管理员切换提示词库卡片蒙层（MySQL prompt_cards_blur，全站生效）。"""
        _, err = _require_prompt_visibility_admin()
        if err:
            return err
        try:
            blurred = toggle_prompt_cards_blur()
            return jsonify({"prompt_cards_blur": blurred})
        except Exception as exc:
            return jsonify({"error": f"切换失败：{exc}"}), 500

    @bp.route("/toolkit-lock/prompt-cards-blur/set", methods=["POST"])
    def api_set_prompt_cards_blur():
        """管理员显式设置提示词库卡片蒙层（全站生效）。"""
        _, err = _require_prompt_visibility_admin()
        if err:
            return err
        data = request.get_json(silent=True) or {}
        if "blurred" not in data:
            return jsonify({"error": "缺少 blurred 参数"}), 400
        try:
            blurred = set_prompt_cards_blur(bool(data.get("blurred")))
            return jsonify({"prompt_cards_blur": blurred})
        except Exception as exc:
            return jsonify({"error": f"设置失败：{exc}"}), 500
