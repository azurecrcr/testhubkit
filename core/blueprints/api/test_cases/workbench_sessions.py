"""用例工作台对话会话 API。"""
from __future__ import annotations

from flask import Blueprint, jsonify, request, session

from core.services.auth.auth_session import get_current_user_id, require_login_api
from core.services.test_cases import workbench_session_service as svc
from core.services.test_cases.workbench_session_db import ensure_workbench_session_tables


def _browser_session_key() -> str:
    if "tc_workbench_browser_key" not in session:
        import uuid

        session["tc_workbench_browser_key"] = uuid.uuid4().hex
        session.modified = True
    return str(session.get("tc_workbench_browser_key") or "")


def _owner() -> tuple[str | None, str]:
    return get_current_user_id(), _browser_session_key()


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-cases/workbench-sessions", methods=["GET"])
    def list_workbench_sessions():
        ensure_workbench_session_tables()
        user_id, sk = _owner()
        plan_context = str(request.args.get("plan_context") or "edit").strip()
        limit = request.args.get("limit", 5)
        keep_id = str(request.args.get("current_session_id") or "").strip() or None
        svc.cleanup_empty_draft_sessions(
            user_id=user_id,
            session_key=sk,
            plan_context=plan_context,
            keep_session_id=keep_id,
        )
        items = svc.list_history_sessions_for_context(
            user_id=user_id,
            session_key=sk,
            plan_context=plan_context,
            limit=limit,
        )
        return jsonify({"items": items, "error": None, "plan_context": svc.normalize_plan_context(plan_context)})

    @bp.route("/test-cases/workbench-sessions", methods=["POST"])
    def create_workbench_session():
        ensure_workbench_session_tables()
        user_id, sk = _owner()
        data = request.get_json(silent=True) or {}
        title = str(data.get("title") or "").strip()
        plan_context = str(data.get("plan_context") or "edit").strip()
        current_session_id = str(data.get("current_session_id") or "").strip() or None
        session_prefs = data.get("session_prefs")
        if session_prefs is not None and not isinstance(session_prefs, dict):
            return jsonify({"error": "session_prefs 须为对象"}), 400
        result = svc.create_session(
            user_id=user_id,
            session_key=sk,
            title=title or None,
            plan_context=plan_context,
            current_session_id=current_session_id,
            session_prefs=session_prefs if isinstance(session_prefs, dict) else None,
        )
        return jsonify({
            "session": result["session"],
            "turns": result.get("turns") or [],
            "created": bool(result.get("created")),
            "limit_reached": bool(result.get("limit_reached")),
            "reused_empty": bool(result.get("reused_empty")),
            "error": None,
        })

    @bp.route("/test-cases/workbench-sessions/entry", methods=["GET"])
    def get_workbench_entry_session():
        ensure_workbench_session_tables()
        user_id, sk = _owner()
        plan_context = str(request.args.get("plan_context") or "edit").strip()
        result = svc.resolve_entry_session(
            user_id=user_id,
            session_key=sk,
            plan_context=plan_context,
        )
        return jsonify({
            "session": result["session"],
            "turns": result.get("turns") or [],
            "history_items": result.get("history_items") or [],
            "created": bool(result.get("created")),
            "reused_draft": bool(result.get("reused_draft")),
            "limit_reached": bool(result.get("limit_reached")),
            "error": None,
            "plan_context": svc.normalize_plan_context(plan_context),
        })

    @bp.route("/test-cases/workbench-sessions/<session_id>", methods=["DELETE"])
    def delete_workbench_session(session_id: str):
        ensure_workbench_session_tables()
        user_id, sk = _owner()
        try:
            svc.delete_session(session_id, user_id=user_id, session_key=sk)
            return jsonify({"ok": True, "error": None})
        except LookupError as exc:
            return jsonify({"error": str(exc)}), 404

    @bp.route("/test-cases/workbench-sessions/<session_id>", methods=["PATCH"])
    def patch_workbench_session(session_id: str):
        ensure_workbench_session_tables()
        user_id, sk = _owner()
        data = request.get_json(silent=True) or {}
        title = str(data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "标题不能为空"}), 400
        try:
            session = svc.update_session_title(
                session_id,
                user_id=user_id,
                session_key=sk,
                title=title,
            )
            return jsonify({"session": session, "error": None})
        except LookupError as exc:
            return jsonify({"error": str(exc)}), 404

    @bp.route("/test-cases/workbench-sessions/<session_id>/prefs", methods=["PUT"])
    def put_workbench_session_prefs(session_id: str):
        ensure_workbench_session_tables()
        user_id, sk = _owner()
        data = request.get_json(silent=True) or {}
        session_prefs = data.get("session_prefs")
        if not isinstance(session_prefs, dict):
            return jsonify({"error": "session_prefs 须为对象"}), 400
        try:
            session = svc.update_session_prefs(
                session_id,
                user_id=user_id,
                session_key=sk,
                session_prefs=session_prefs,
            )
            return jsonify({"session": session, "error": None})
        except LookupError as exc:
            return jsonify({"error": str(exc)}), 404

    @bp.route("/test-cases/workbench-sessions/<session_id>/generate-title", methods=["POST"])
    def generate_workbench_session_title(session_id: str):
        ensure_workbench_session_tables()
        user_id, sk = _owner()
        data = request.get_json(silent=True) or {}
        user_prompt = str(data.get("user_prompt") or "")
        try:
            result = svc.generate_session_title_from_message(
                session_id,
                user_id=user_id,
                session_key=sk,
                user_prompt=user_prompt,
            )
            return jsonify({**result, "error": None})
        except LookupError as exc:
            return jsonify({"error": str(exc)}), 404
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.route("/test-cases/workbench-sessions/<session_id>", methods=["GET"])
    def get_workbench_session(session_id: str):
        ensure_workbench_session_tables()
        user_id, sk = _owner()
        try:
            detail = svc.get_session_detail(session_id, user_id=user_id, session_key=sk)
            return jsonify({**detail, "error": None})
        except LookupError as exc:
            return jsonify({"error": str(exc)}), 404

    @bp.route("/test-cases/workbench-sessions/<session_id>/turns", methods=["POST"])
    def upsert_workbench_turn(session_id: str):
        ensure_workbench_session_tables()
        user_id, sk = _owner()
        data = request.get_json(silent=True) or {}
        try:
            turn_index = int(data.get("turn_index", 0))
            agent_chain = data.get("agent_chain")
            if agent_chain is None:
                agent_chain = data.get("agentChain")
            turn = svc.save_turn(
                session_id,
                user_id=user_id,
                session_key=sk,
                turn_index=turn_index,
                user_prompt=str(data.get("user_prompt") or ""),
                user_mode=str(data.get("user_mode") or ""),
                chain=data.get("chain") if isinstance(data.get("chain"), dict) else None,
                agent_chain=agent_chain if isinstance(agent_chain, dict) else None,
                batch_meta=data.get("batch_meta") if isinstance(data.get("batch_meta"), dict) else None,
                lanhu_url=str(data.get("lanhu_url") or ""),
                turn_id=str(data.get("turn_id") or "").strip() or None,
            )
            return jsonify({"turn": turn, "error": None})
        except LookupError as exc:
            return jsonify({"error": str(exc)}), 404
        except (TypeError, ValueError) as exc:
            return jsonify({"error": str(exc)}), 400


    @bp.route("/test-cases/workbench-sessions/<session_id>/turns/<turn_id>/validation", methods=["GET"])
    def get_session_turn_validation(session_id: str, turn_id: str):
        ensure_workbench_session_tables()
        user_id, sk = _owner()
        try:
            payload = svc.get_turn_validation(
                turn_id,
                user_id=user_id,
                session_key=sk,
                session_id=session_id,
            )
            return jsonify({**payload, "error": None})
        except LookupError as exc:
            return jsonify({"error": str(exc)}), 404

    @bp.route("/test-cases/workbench-sessions/<session_id>/turns/<turn_id>/validation", methods=["PUT"])
    def put_session_turn_validation(session_id: str, turn_id: str):
        ensure_workbench_session_tables()
        user_id, sk = _owner()
        data = request.get_json(silent=True) or {}
        validation = data.get("validation")
        if validation is not None and not isinstance(validation, dict):
            return jsonify({"error": "validation 须为对象"}), 400
        try:
            turn = svc.save_turn_validation(
                turn_id,
                user_id=user_id,
                session_key=sk,
                session_id=session_id,
                validation=validation,
                validate_reasoning=str(data.get("validate_reasoning") or ""),
                batch_meta=data.get("batch_meta") if isinstance(data.get("batch_meta"), dict) else None,
            )
            return jsonify({"turn": turn, "error": None})
        except LookupError as exc:
            return jsonify({"error": str(exc)}), 404

    @bp.route("/test-cases/workbench-sessions/turns/<turn_id>/validation", methods=["GET"])
    def get_turn_validation(turn_id: str):
        ensure_workbench_session_tables()
        user_id, sk = _owner()
        try:
            payload = svc.get_turn_validation(turn_id, user_id=user_id, session_key=sk)
            return jsonify({**payload, "error": None})
        except LookupError as exc:
            return jsonify({"error": str(exc)}), 404

    @bp.route("/test-cases/workbench-sessions/turns/<turn_id>/validation", methods=["PUT"])
    def put_turn_validation(turn_id: str):
        ensure_workbench_session_tables()
        user_id, sk = _owner()
        data = request.get_json(silent=True) or {}
        validation = data.get("validation")
        if validation is not None and not isinstance(validation, dict):
            return jsonify({"error": "validation 须为对象"}), 400
        try:
            turn = svc.save_turn_validation(
                turn_id,
                user_id=user_id,
                session_key=sk,
                validation=validation,
                validate_reasoning=str(data.get("validate_reasoning") or ""),
                batch_meta=data.get("batch_meta") if isinstance(data.get("batch_meta"), dict) else None,
            )
            return jsonify({"turn": turn, "error": None})
        except LookupError as exc:
            return jsonify({"error": str(exc)}), 404
