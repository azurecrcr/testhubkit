from __future__ import annotations

from flask import Blueprint, render_template


def register_routes(bp: Blueprint) -> None:
    @bp.route("/share/tc/<token>")
    def tc_share_preview_page(token: str):
        return render_template(
            "tc_share_preview.html",
            token=token,
            active_page="share",
        )
