"""Flask 蓝图聚合：页面渲染与 REST API。"""

from __future__ import annotations

from typing import TYPE_CHECKING

from core.blueprints.api import api_bp
from core.blueprints.pages import pages_bp

if TYPE_CHECKING:
    from flask import Flask

__all__ = ["api_bp", "pages_bp", "register_blueprints"]


def register_blueprints(app: "Flask") -> None:
    """在应用上注册全部蓝图（先页面、后 API，与原先顺序一致）。"""
    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp)
