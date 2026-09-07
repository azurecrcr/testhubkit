from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.auth.auth_session import get_current_user_id, require_login_api
from core.services.test_cases.ai_form_prefs_db import (
    get_all_ai_form_prefs,
    save_ai_form_pref,
)


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-case-ai-form-prefs", methods=["GET"])
    @require_login_api
    def test_case_ai_form_prefs_get():
        user_id = get_current_user_id()
        prefs = get_all_ai_form_prefs(user_id or "")
        return jsonify({"error": None, "preset": prefs.get("preset"), "custom": prefs.get("custom")})

    @bp.route("/test-case-ai-form-prefs", methods=["PUT"])
    @require_login_api
    def test_case_ai_form_prefs_put():
        user_id = get_current_user_id()
        data = request.get_json(silent=True) or {}
        mode = data.get("mode")
        config = data.get("config")
        if not mode:
            return jsonify({"error": "请指定 mode（preset 或 custom）"}), 400
        try:
            merge = bool(data.get("merge"))
            saved = save_ai_form_pref(user_id or "", str(mode), config, merge=merge)
            return jsonify({"error": None, "saved": saved})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
