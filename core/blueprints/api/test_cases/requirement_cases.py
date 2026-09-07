from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.auth.auth_session import get_current_user_id, require_login_api
from core.services.test_cases.requirement_case_service import (
    list_designed_requirement_cases,
    list_designed_requirement_cases_for_requirement_doc,
    load_requirement_cases,
    save_requirement_cases,
)


def register_routes(bp: Blueprint) -> None:

    @bp.route("/test-cases/requirement-cases/list", methods=["GET"])
    @require_login_api
    def requirement_cases_list():
        user_id = get_current_user_id()
        try:
            limit_raw = request.args.get("limit")
            limit = int(limit_raw) if limit_raw else 500
        except (TypeError, ValueError):
            limit = 500
        lanhu_pid = (request.args.get("lanhu_pid") or "").strip()
        lanhu_doc_id = (request.args.get("lanhu_doc_id") or "").strip()
        try:
            if lanhu_doc_id:
                items = list_designed_requirement_cases_for_requirement_doc(
                    user_id or "",
                    lanhu_pid=lanhu_pid,
                    lanhu_doc_id=lanhu_doc_id,
                    limit=limit,
                )
            else:
                items = list_designed_requirement_cases(user_id or "", limit=limit)
            resp = jsonify({"ok": True, "items": items, "count": len(items)})
            resp.headers["Cache-Control"] = "no-store"
            return resp
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500

    @bp.route("/test-cases/requirement-cases", methods=["GET"])
    @require_login_api
    def requirement_cases_get():
        user_id = get_current_user_id()
        lanhu_url = (request.args.get("lanhu_url") or "").strip()
        page_id = (request.args.get("page_id") or request.args.get("lanhu_page_id") or "").strip()
        if not lanhu_url:
            return jsonify({"ok": False, "error": "缺少 lanhu_url"}), 400
        if not page_id:
            resp = jsonify({"ok": True, "found": False, "data": None})
            resp.headers["Cache-Control"] = "no-store"
            return resp
        try:
            doc = load_requirement_cases(user_id or "", lanhu_url=lanhu_url, page_id=page_id)
            if not doc:
                resp = jsonify({"ok": True, "found": False, "data": None})
                resp.headers["Cache-Control"] = "no-store"
                return resp
            resp = jsonify({"ok": True, "found": True, "data": doc})
            resp.headers["Cache-Control"] = "no-store"
            return resp
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500

    @bp.route("/test-cases/requirement-cases", methods=["PUT"])
    @require_login_api
    def requirement_cases_put():
        user_id = get_current_user_id()
        data = request.get_json(silent=True) or {}
        try:
            saved = save_requirement_cases(user_id or "", data)
            return jsonify({"ok": True, "saved": saved})
        except ValueError as exc:
            return jsonify({"ok": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"ok": False, "error": str(exc)}), 500
