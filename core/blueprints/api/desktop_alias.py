"""桌面应用别名词典 API（服务器主数据 + 学习候选）。"""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.auth.desktop_alias_service import (
    confirm_learn_candidate,
    create_learn_candidate,
    list_my_learn,
    list_published_rules,
    reject_learn_candidate,
)
from core.services.auth.desktop_auth_service import (
    get_request_desktop_auth,
    require_desktop_token,
)


def register_routes(bp: Blueprint) -> None:
    @bp.get("/desktop/alias/health")
    def desktop_alias_health():
        from core.services.auth.desktop_alias_service import get_rules_version, ensure_builtin_seed

        try:
            version = ensure_builtin_seed()
        except Exception as exc:
            return jsonify({"error": str(exc), "ok": False}), 503
        return jsonify({"error": None, "ok": True, "version": version or get_rules_version()})

    @bp.get("/desktop/alias/rules")
    @require_desktop_token
    def desktop_alias_rules():
        auth = get_request_desktop_auth() or {}
        since = request.args.get("since_version") or "0"
        try:
            since_i = int(since)
        except ValueError:
            since_i = 0
        try:
            payload = list_published_rules(
                user_id=str(auth.get("user_id") or ""),
                since_version=since_i,
            )
            return jsonify(payload)
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    @bp.post("/desktop/alias/learn")
    @require_desktop_token
    def desktop_alias_learn():
        auth = get_request_desktop_auth() or {}
        data = request.get_json(silent=True) or {}
        try:
            payload = create_learn_candidate(
                user_id=str(auth.get("user_id") or ""),
                device_id=str(auth.get("device_id") or ""),
                payload=data if isinstance(data, dict) else {},
            )
            return jsonify(payload)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    @bp.get("/desktop/alias/learn/mine")
    @require_desktop_token
    def desktop_alias_learn_mine():
        auth = get_request_desktop_auth() or {}
        try:
            limit = int(request.args.get("limit") or 50)
        except ValueError:
            limit = 50
        try:
            return jsonify(list_my_learn(user_id=str(auth.get("user_id") or ""), limit=limit))
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    @bp.post("/desktop/alias/learn/<candidate_id>/confirm")
    @require_desktop_token
    def desktop_alias_learn_confirm(candidate_id: str):
        auth = get_request_desktop_auth() or {}
        try:
            return jsonify(
                confirm_learn_candidate(
                    user_id=str(auth.get("user_id") or ""),
                    candidate_id=str(candidate_id or ""),
                )
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    @bp.post("/desktop/alias/learn/<candidate_id>/reject")
    @require_desktop_token
    def desktop_alias_learn_reject(candidate_id: str):
        auth = get_request_desktop_auth() or {}
        try:
            return jsonify(
                reject_learn_candidate(
                    user_id=str(auth.get("user_id") or ""),
                    candidate_id=str(candidate_id or ""),
                )
            )
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500
