from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.test_cases.system_prompt_db import (
    get_tc_workbench_system_prompts,
    save_tc_system_prompt,
)


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-cases/system-prompts", methods=["GET"])
    def test_cases_system_prompts_get():
        try:
            rules = get_tc_workbench_system_prompts()
            return jsonify({"error": None, **rules})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    @bp.route("/test-cases/system-prompts/<prompt_key>", methods=["PUT"])
    def test_cases_system_prompts_put(prompt_key: str):
        """预留后台维护：按 key 更新系统提示词。"""
        try:
            data = request.get_json(silent=True) or {}
            content = data.get("content")
            if content is None:
                return jsonify({"error": "缺少 content 字段"}), 400
            description = (data.get("description") or "").strip()
            row = save_tc_system_prompt(prompt_key, str(content), description)
            return jsonify({"error": None, **row})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
