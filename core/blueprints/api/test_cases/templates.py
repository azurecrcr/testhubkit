from __future__ import annotations

from flask import Blueprint, jsonify

from core.services.test_cases.case_template_service import list_case_templates


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-case-templates", methods=["GET"])
    def test_case_templates_list():
        try:
            items = list_case_templates()
            return jsonify({"error": None, "items": items})
        except Exception as exc:
            return jsonify({"error": str(exc), "items": []}), 500
