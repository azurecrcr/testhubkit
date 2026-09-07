"""页面生成锁 API。"""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from core.services.auth.auth_session import get_current_user_id, require_login_api
from core.services.test_cases.page_generation_lock_db import PageGenLockConflictError, lock_has_live_session
from core.services.test_cases.page_generation_lock_service import (
    get_user_page_gen_lock,
    normalize_page_gen_context,
    reconcile_user_page_gen_lock,
    try_acquire_page_gen_lock,
)


def register_routes(bp: Blueprint) -> None:
    @bp.route("/test-cases/page-gen-lock", methods=["GET"])
    @require_login_api
    def page_gen_lock_get():
        user_id = get_current_user_id() or ""
        lock = get_user_page_gen_lock(user_id)
        return jsonify({"ok": True, "lock": lock, "running": bool(lock)})

    @bp.route("/test-cases/page-gen-lock/check", methods=["POST"])
    @require_login_api
    def page_gen_lock_check():
        user_id = get_current_user_id() or ""
        data = request.get_json(silent=True) or {}
        ctx = normalize_page_gen_context(data)
        active = get_user_page_gen_lock(user_id)
        if not active:
            return jsonify({"ok": True, "allowed": True, "lock": None})
        if not lock_has_live_session(user_id, active):
            reconcile_user_page_gen_lock(user_id)
            return jsonify({"ok": True, "allowed": True, "lock": None})
        same = active.get("lanhu_page_id") == ctx.get("lanhu_page_id")
        if ctx.get("lanhu_doc_id") and active.get("lanhu_doc_id"):
            same = same and active.get("lanhu_doc_id") == ctx.get("lanhu_doc_id")
        if same:
            return jsonify({
                "ok": True,
                "allowed": False,
                "reason": "same_page_running",
                "message": "该页面正在生成中，请等待完成",
                "lock": active,
            })
        label = active.get("page_name") or active.get("lanhu_page_id") or "其他页面"
        return jsonify({
            "ok": True,
            "allowed": False,
            "reason": "other_page_running",
            "message": f"「{label}」正在生成用例，请等待完成后再切换页面",
            "lock": active,
        })
