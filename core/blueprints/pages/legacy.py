from __future__ import annotations

from flask import Blueprint, redirect, url_for


def register_routes(bp: Blueprint) -> None:
    @bp.route("/workspace")
    @bp.route("/day")
    def workspace_legacy_redirect():
        """旧「用例工作台」入口已下线，重定向到首页（请从各独立工具页进入）。"""
        return redirect(url_for("pages.app_home"), code=301)
