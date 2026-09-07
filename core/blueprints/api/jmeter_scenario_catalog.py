"""JMeter 压测场景 · 组件目录 API（登录用户）。"""
from flask import Blueprint, jsonify
from core.services.auth.auth_session import get_current_user_id
from core.services.jmeter_scenario.component_catalog_service import build_component_catalog
from core.services.jmeter_scenario.component_hierarchy_rules import (
    build_hierarchy_meta, enrich_component, filter_components,
)
from core.services.jmeter_scenario.jmeter_element_templates import load_element_templates


def register_routes(bp: Blueprint) -> None:
    @bp.get("/jmeter-scenario/component-catalog")
    def jmeter_scenario_component_catalog():
        if not get_current_user_id():
            return jsonify({"ok": False, "error": "请先登录", "code": "AUTH_REQUIRED"}), 401
        data = build_component_catalog()
        components = [enrich_component(c) for c in data.get("components", [])]
        templates = load_element_templates()
        hierarchy = build_hierarchy_meta()
        return jsonify({
            "ok": True,
            "generated_from": data.get("generated_from"),
            "total": len(components),
            "categories": data.get("categories", []),
            "components": components,
            "tree": data.get("tree"),
            "runtime": data.get("runtime", {}),
            "hierarchy": hierarchy,
            "placement": hierarchy,
            "templates": templates.get("templates", {}),
        })

    @bp.get("/jmeter-scenario/component-catalog/filter")
    def jmeter_scenario_component_catalog_filter():
        if not get_current_user_id():
            return jsonify({"ok": False, "error": "请先登录"}), 401
        from flask import request
        context = (request.args.get("context") or "thread_group").strip()
        q = (request.args.get("q") or "").strip()
        data = build_component_catalog()
        components = [enrich_component(c) for c in data.get("components", [])]
        filtered = filter_components(components, context, q)
        return jsonify({"ok": True, "context": context, "total": len(filtered), "components": filtered})
