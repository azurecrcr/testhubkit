from __future__ import annotations

import os

from flask import jsonify, request

from core.services.prompts.prompt_library_service import (
    create_prompt_entry,
    list_prompt_entries,
)
from core.services.toolkit_lock.toolkit_lock_db import toolkit_is_locked

# 部署时通过环境变量设置；开源仓库不包含真实密码
PROMPT_ADD_PASSWORD = (os.environ.get("PROMPT_ADD_PASSWORD") or "").strip()


def register_routes(bp) -> None:
    @bp.route("/prompt-library", methods=["GET"])
    def prompt_library_list():
        try:
            items = list_prompt_entries()
            return jsonify({"error": None, "items": items})
        except Exception as exc:
            return jsonify({"error": str(exc), "items": []}), 500

    @bp.route("/prompt-library", methods=["POST"])
    def prompt_library_create():
        data = request.get_json(silent=True) or {}
        if toolkit_is_locked():
            pwd = str(data.get("password") or "").strip()
            if not PROMPT_ADD_PASSWORD or pwd != PROMPT_ADD_PASSWORD:
                return jsonify({"error": "功能已上锁，请在数据库将 toolkit_lock_switch.is_locked 设为 0 后刷新，或使用正确密码"}), 403
        try:
            item = create_prompt_entry(data)
            return jsonify({"error": None, "item": item})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
