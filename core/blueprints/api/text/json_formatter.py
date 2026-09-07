from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.text import format_json_text


def register_routes(bp: Blueprint) -> None:
    @bp.route("/json-formatter", methods=["POST"])
    def json_formatter():
        data = request.json or {}
        json_str = data.get("json", "")
        try:
            formatted = format_json_text(json_str)
            return jsonify({"result": formatted, "error": None})
        except Exception as exc:
            return jsonify({"result": None, "error": str(exc)})
