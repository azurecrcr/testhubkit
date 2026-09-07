"""导出报告 API。"""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.auth.auth_session import get_current_user_id
from core.services.test_cases import export_report_service


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-cases/export-report/build", methods=["POST"])
    def build_test_case_export_report():
        try:
            data = request.json or {}
            columns = data.get("columns") or []
            rows = data.get("rows") or []
            if not isinstance(columns, list) or not isinstance(rows, list):
                return jsonify({"error": "columns / rows 格式不正确"}), 400
            profile_key = str(data.get("profile") or data.get("profile_key") or "metersphere").strip()
            result = export_report_service.build_export_report(
                profile_key=profile_key,
                columns=[str(c) for c in columns],
                rows=[[str(c) for c in row] for row in rows if isinstance(row, list)],
            )
            return jsonify(result)
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/test-cases/export-reports", methods=["POST"])
    def save_test_case_export_report():
        try:
            data = request.json or {}
            report = data.get("report")
            if not isinstance(report, dict):
                return jsonify({"error": "report 格式不正确"}), 400
            report_id = export_report_service.save_export_report(
                get_current_user_id(),
                report,
            )
            return jsonify({"ok": True, "id": report_id})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400
