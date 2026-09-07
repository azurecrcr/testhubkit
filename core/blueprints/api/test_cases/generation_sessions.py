"""流式用例生成会话 API。"""
from __future__ import annotations

from flask import Blueprint, jsonify, request, Response, stream_with_context

from core.services.auth.auth_session import get_current_user_id
from core.services.test_cases.generation_guard import (
    GenerationRateLimitError,
    assert_generation_allowed,
    reconcile_stale_generation_tasks,
)
from core.services.test_cases.generation_session_db import (
    cancel_active_generation_sessions_for_user,
    ensure_generation_session_tables,
    get_session,
    get_session_events_since,
)
from core.services.test_cases.page_generation_lock_db import PageGenLockConflictError, release_active_page_gen_lock
from core.services.test_cases.page_generation_lock_service import (
    link_generation_session_to_lock,
    try_acquire_page_gen_lock,
)
from core.services.test_cases.generation_stream_service import (
    cancel_generation_session,
    create_generation_session,
    session_stream_events,
)
from core.services.test_cases.lanhu_requirement_service import fetch_lanhu_requirements_summary


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-cases/generation-sessions", methods=["POST"])
    def create_session():
        page_gen_lock_acquired = False
        user_id = None
        try:
            ensure_generation_session_tables()
            data = request.json or {}
            lanhu_cookie = (data.get("lanhu_cookie") or "").strip()
            lanhu_url = (data.get("lanhu_url") or "").strip()
            skip_lanhu_merge = bool(data.get("skip_lanhu_merge"))
            prompt_preview = str(data.get("prompt") or "")
            if not skip_lanhu_merge and (
                "【当前页需求（蓝湖）】" in prompt_preview
                or "【蓝湖需求摘要】" in prompt_preview
            ):
                skip_lanhu_merge = True
            if not skip_lanhu_merge and (lanhu_cookie or lanhu_url):
                if not lanhu_cookie or not lanhu_url:
                    return jsonify({"error": "蓝湖需求需同时填写 Cookie 与文档 URL"}), 400
                try:
                    summary = fetch_lanhu_requirements_summary(lanhu_cookie, lanhu_url)
                    prompt = str(data.get("prompt") or "").strip()
                    data = dict(data)
                    data["prompt"] = summary + "\n\n【用户提示词】\n" + prompt
                except ValueError as exc:
                    return jsonify({"error": str(exc)}), 400
                except Exception as exc:
                    return jsonify({"error": f"获取蓝湖需求失败: {exc}"}), 400
            user_id = get_current_user_id()
            reconcile_stale_generation_tasks(user_id=user_id)
            if user_id:
                cancel_active_generation_sessions_for_user(user_id)
                from core.services.test_cases.page_generation_lock_service import reconcile_user_page_gen_lock
                reconcile_user_page_gen_lock(user_id)
            page_gen = data.get("page_gen")
            page_gen_lock_acquired = False
            if page_gen and user_id:
                try:
                    try_acquire_page_gen_lock(user_id, page_gen if isinstance(page_gen, dict) else {})
                    page_gen_lock_acquired = True
                except PageGenLockConflictError as exc:
                    return jsonify({"error": str(exc), "lock": exc.lock, "code": "PAGE_GEN_LOCKED"}), 409
            prompt = str(data.get("prompt") or "").strip()
            mode = str(data.get("mode") or "list")
            try:
                assert_generation_allowed(
                    request=request,
                    user_id=user_id,
                    action="stream_session",
                    prompt=prompt,
                    mode=mode,
                    check_session_concurrency=False,
                )
            except GenerationRateLimitError as exc:
                if page_gen_lock_acquired and user_id:
                    release_active_page_gen_lock(user_id)
                resp = jsonify({"error": str(exc)})
                resp.status_code = 429
                resp.headers["Retry-After"] = str(exc.retry_after_sec)
                return resp
            try:
                session = create_generation_session(data, user_id)
            except Exception:
                if page_gen_lock_acquired and user_id:
                    release_active_page_gen_lock(user_id)
                raise
            if page_gen and user_id and session.get("id"):
                link_generation_session_to_lock(user_id, str(session["id"]))
            return jsonify(session)
        except ValueError as exc:
            if page_gen_lock_acquired and user_id:
                release_active_page_gen_lock(user_id)
            return jsonify({"error": str(exc)}), 400
        except Exception as exc:
            if page_gen_lock_acquired and user_id:
                release_active_page_gen_lock(user_id)
            return jsonify({"error": str(exc)}), 400


    @bp.route("/test-cases/generation-sessions/active/cancel-all", methods=["POST"])
    def cancel_all_active_generation_sessions():
        user_id = get_current_user_id()
        reconcile_stale_generation_tasks(user_id=user_id)
        n = cancel_active_generation_sessions_for_user(user_id)
        if user_id:
            from core.services.test_cases.page_generation_lock_service import reconcile_user_page_gen_lock
            reconcile_user_page_gen_lock(user_id)
        return jsonify({"ok": True, "cancelled": n})

    @bp.route("/test-cases/generation-sessions/<session_id>", methods=["GET"])
    def get_generation_session(session_id: str):
        ensure_generation_session_tables()
        session = get_session(session_id)
        if not session:
            return jsonify({"error": "会话不存在"}), 404
        return jsonify(session)


    @bp.route("/test-cases/generation-sessions/<session_id>/events", methods=["GET"])
    def list_generation_session_events(session_id: str):
        ensure_generation_session_tables()
        session = get_session(session_id)
        if not session:
            return jsonify({"error": "会话不存在"}), 404
        after = request.args.get("after", 0)
        try:
            after_seq = max(0, int(after))
        except (TypeError, ValueError):
            after_seq = 0
        events, latest_seq = get_session_events_since(session_id, after_seq)
        return jsonify({"events": events, "latest_seq": latest_seq})

    @bp.route("/test-cases/generation-sessions/<session_id>/stream", methods=["GET"])
    def stream_generation_session(session_id: str):
        ensure_generation_session_tables()
        return Response(
            stream_with_context(session_stream_events(session_id)),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    @bp.route("/test-cases/generation-sessions/<session_id>/cancel", methods=["POST"])
    def cancel_session_route(session_id: str):
        try:
            ok = cancel_generation_session(session_id)
            return jsonify({"ok": ok})
        except Exception as exc:
            return jsonify({"error": str(exc)}), 400
