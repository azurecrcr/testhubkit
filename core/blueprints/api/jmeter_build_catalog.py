"""JMeter 搭建 Tab API（仅站点管理员）。"""

from flask import Blueprint, jsonify

from core.services.auth.admin_guard import get_admin_user
from core.services.auth.auth_session import get_current_user_id
from core.services.jmeter_scenario.component_catalog_service import build_component_catalog


def _require_site_manager():
    user = get_admin_user()
    if user:
        return None
    if not get_current_user_id():
        return jsonify({"ok": False, "error": "请先登录", "code": "AUTH_REQUIRED"}), 401
    return jsonify({"ok": False, "error": "仅管理员可访问", "code": "ADMIN_REQUIRED"}), 403


def register_routes(bp: Blueprint) -> None:
    @bp.get("/jmeter-build/catalog")
    def jmeter_build_catalog():
        denied = _require_site_manager()
        if denied:
            return denied
        data = build_component_catalog()
        return jsonify({"ok": True, **data})

    @bp.get("/jmeter-build/runtime")
    def jmeter_build_runtime():
        denied = _require_site_manager()
        if denied:
            return denied
        data = build_component_catalog()
        return jsonify({"ok": True, "runtime": data.get("runtime", {})})
