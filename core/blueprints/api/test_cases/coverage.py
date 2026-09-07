"""覆盖率矩阵 API。"""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.auth.auth_session import get_current_user_id

from core.services.test_cases.coverage_matrix_service import analyze_coverage
from core.services.test_cases.lanhu_requirement_service import fetch_lanhu_requirements_summary


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-cases/coverage/analyze", methods=["POST"])
    def analyze_test_case_coverage():
        try:
            data = request.json or {}
            columns = data.get("columns") or []
            rows = data.get("rows") or []
            if not isinstance(columns, list) or not columns:
                return jsonify({"error": "请先应用表头模板"}), 400
            if not isinstance(rows, list):
                return jsonify({"error": "rows 格式不正确"}), 400
            columns = [str(c) for c in columns]
            rows = [
                [str(c) for c in row]
                for row in rows
                if isinstance(row, list)
            ]
            if not rows:
                return jsonify({"error": "没有用例，无法分析覆盖率。"}), 400

            requirements = str(data.get("requirements") or "").strip()
            lanhu_cookie = str(data.get("lanhu_cookie") or "").strip()
            lanhu_url = str(data.get("lanhu_url") or "").strip()
            if not requirements and lanhu_cookie and lanhu_url:
                requirements = fetch_lanhu_requirements_summary(lanhu_cookie, lanhu_url)
            if not requirements:
                user_intent = str(data.get("user_intent") or "").strip()
                if user_intent:
                    requirements = user_intent
            if not requirements:
                return jsonify({"error": "缺少需求文本，请先配置蓝湖或填写提示词。"}), 400

            use_builtin = bool(data.get("use_builtin", True))
            matrix = analyze_coverage(
                user_id=get_current_user_id(),
                requirements=requirements,
                columns=columns,
                rows=rows,
                user_intent=str(data.get("user_intent") or "").strip(),
                use_builtin=use_builtin,
                base_url=str(data.get("base_url") or "").strip(),
                api_key=str(data.get("api_key") or "").strip(),
                model=str(data.get("model") or "").strip(),
            )
            quota_meta = matrix.pop("_ai_quota_meta", None) if isinstance(matrix, dict) else None
            resp = {"coverage_matrix": matrix}
            if quota_meta:
                resp["ai_quota"] = quota_meta
            return jsonify(resp)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400
