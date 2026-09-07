"""注册 / 登录页面。"""

from __future__ import annotations

from flask import Blueprint, redirect, render_template, request
from urllib.parse import quote, urlparse


def _safe_next_url(raw: str) -> str:
    path = (raw or "").strip()
    if not path.startswith("/") or path.startswith("//"):
        return "/app"
    parsed = urlparse(path)
    if parsed.netloc:
        return "/app"
    return path or "/app"


def register_routes(bp: Blueprint) -> None:
    @bp.route("/account/bind-phone")
    def account_bind_phone_page():
        """强制绑定手机号页（公安实名要求；复用 /api/auth/phone/bind*）。"""
        from core.services.auth.auth_session import get_current_user_id
        from core.services.auth.phone_bind_gate import (
            attach_phone_bind_gate_fields,
            user_needs_phone_bind,
        )
        from core.services.auth.user_service import get_user_by_id

        next_url = _safe_next_url(request.args.get("next") or "/app")
        uid = get_current_user_id()
        if not uid:
            return redirect("/auth?next=" + quote("/account/bind-phone?next=" + quote(next_url)))
        user = get_user_by_id(uid)
        attach_phone_bind_gate_fields(user)
        if user and not user_needs_phone_bind(user):
            return redirect(next_url)
        return render_template(
            "account_bind_phone.html",
            active_page="account_bind_phone",
            bind_next=next_url,
        )

    @bp.route("/account/profile")
    def account_profile_page():
        from core.services.auth.auth_session import get_current_user_id

        if not get_current_user_id():
            return redirect("/auth?next=" + quote("/account/profile"))
        return render_template(
            "account_profile.html",
            active_page="account_profile",
        )

    @bp.route("/account/password")
    def account_password_page():
        from core.services.auth.auth_session import get_current_user_id

        if not get_current_user_id():
            return redirect("/auth?next=" + quote("/account/password"))
        return render_template(
            "account_password.html",
            active_page="account_password",
        )

    @bp.route("/auth")
    def auth_page():
        next_url = _safe_next_url(request.args.get("next") or "")
        tab = (request.args.get("tab") or "login").strip().lower()
        if tab not in ("login", "register"):
            tab = "login"
        return render_template(
            "auth.html",
            active_page="auth",
            auth_tab=tab,
            auth_next=next_url,
        )
