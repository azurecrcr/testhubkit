from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.text import convert_base64_text


def register_routes(bp: Blueprint) -> None:
    @bp.route("/base64-converter", methods=["POST"])
    def base64_converter():
        data = request.json or {}
        action = data.get("action", "encode")
        text = data.get("text", "")
        try:
            result = convert_base64_text(action, text)
            return jsonify({"result": result, "error": None})
        except Exception as exc:
            return jsonify({"result": None, "error": str(exc)})
