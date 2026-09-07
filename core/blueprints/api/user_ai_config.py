from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.auth.auth_session import get_current_user_id, require_login_api
from core.services.auth.user_ai_config_db import (
    get_user_ai_config,
    is_user_ai_configured,
    is_user_cursor_agent_configured,
    is_user_vision_configured,
    save_user_ai_config,
)


def register_routes(bp: Blueprint) -> None:
    @bp.route("/user-ai-config", methods=["GET"])
    @require_login_api
    def user_ai_config_get():
        user_id = get_current_user_id() or ""
        cfg = get_user_ai_config(user_id)
        configured = is_user_ai_configured(cfg)
        vision_configured = is_user_vision_configured(cfg)
        if not cfg:
            return jsonify({
                "error": None,
                "configured": False,
                "vision_configured": False,
                "base_url": "",
                "api_key": "",
                "model": "",
                "temperature": 0.1,
                "vision_api_base_url": "",
                "vision_api_key": "",
                "vision_model": "",
                "cursor_api_key": "",
                "agent_model": "",
                "cursor_agent_configured": False,
            })
        return jsonify({
            "error": None,
            "configured": configured,
            "vision_configured": vision_configured,
            "cursor_agent_configured": is_user_cursor_agent_configured(cfg),
            "base_url": cfg.get("base_url") or "",
            "api_key": cfg.get("api_key") or "",
            "model": cfg.get("model") or "",
            "temperature": cfg.get("temperature", 0.1),
            "vision_api_base_url": cfg.get("vision_api_base_url") or "",
            "vision_api_key": cfg.get("vision_api_key") or "",
            "vision_model": cfg.get("vision_model") or "",
            "cursor_api_key": cfg.get("cursor_api_key") or "",
            "agent_model": cfg.get("agent_model") or "",
            "updated_at": cfg.get("updated_at"),
        })

    @bp.route("/user-ai-config", methods=["PUT"])
    @require_login_api
    def user_ai_config_put():
        user_id = get_current_user_id() or ""
        data = request.get_json(silent=True) or {}
        try:
            saved = save_user_ai_config(user_id, data)
            return jsonify({
                "error": None,
                "saved": saved,
                "configured": bool(saved.get("configured")),
                "vision_configured": bool(saved.get("vision_configured")),
                "cursor_agent_configured": bool(saved.get("cursor_agent_configured")),
            })
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/user-ai-daily-quota", methods=["GET"])
    @require_login_api
    def user_ai_daily_quota_get():
        from core.services.ai.user_ai_daily_quota_service import get_user_daily_quota_status

        user_id = get_current_user_id() or ""
        return jsonify({"error": None, "quota": get_user_daily_quota_status(user_id)})
