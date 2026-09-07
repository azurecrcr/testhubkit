from __future__ import annotations

from flask import Blueprint, render_template

from core.config import TOOLS


def register_routes(bp: Blueprint) -> None:
    @bp.route("/prompts")
    def prompt_library():
        return render_template(
            "prompt_library.html",
            tools=TOOLS,
            active_page="prompts",
        )
