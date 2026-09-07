from __future__ import annotations

from flask import Blueprint, render_template

from core.services.auth.auth_session import get_current_user_id


def register_routes(bp: Blueprint) -> None:
    @bp.route("/")
    def landing():
        return render_template(
            "landing.html",
            grove_show_login=not bool(get_current_user_id()),
        )
