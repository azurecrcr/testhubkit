"""
兼容旧导入路径 ``core.routes``；新代码请使用 ``core.blueprints``。
"""

from core.blueprints import api_bp, pages_bp, register_blueprints

__all__ = ["api_bp", "pages_bp", "register_blueprints"]
