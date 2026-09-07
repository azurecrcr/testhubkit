from __future__ import annotations

from flask import Blueprint, render_template

from core.config.tools_registry import filter_tools_for_viewer


def register_routes(bp: Blueprint) -> None:
    @bp.route("/app")
    def app_home():
        return render_template(
            "index.html",
            tools=filter_tools_for_viewer(),
            active_tool=None,
            active_page="home",
            hf_site_footer_brand="Test Hub Kit",
        )
