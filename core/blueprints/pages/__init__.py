"""服务端渲染页面路由。"""

from __future__ import annotations

from flask import Blueprint

pages_bp = Blueprint("pages", __name__)

from . import auth, home, landing, legacy, legal, prompts, tc_share, toolkit


def _register_routes() -> None:
    landing.register_routes(pages_bp)
    home.register_routes(pages_bp)
    auth.register_routes(pages_bp)
    legal.register_routes(pages_bp)
    prompts.register_routes(pages_bp)
    legacy.register_routes(pages_bp)
    toolkit.register_routes(pages_bp)
    tc_share.register_routes(pages_bp)


_register_routes()


@pages_bp.after_request
def _pages_default_headers(response):
    """HTML 页面通用安全头（不改变 API JSON 响应）。"""
    ct = (response.headers.get("Content-Type") or "").lower()
    if "text/html" in ct:
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    return response
