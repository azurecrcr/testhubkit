"""管理员鉴权辅助（Context Stack 公共 RAG 等）。"""
from __future__ import annotations

from functools import wraps
from typing import Any, Callable

from flask import jsonify

from core.services.auth.auth_session import get_current_user_id
from core.services.auth.prompt_visibility_admin import is_site_manager
from core.services.auth.user_service import get_user_by_id


def get_admin_user() -> dict[str, Any] | None:
    uid = get_current_user_id()
    if not uid:
        return None
    user = get_user_by_id(uid)
    if not user or not is_site_manager(user):
        return None
    return user


def user_can_use_public_rag() -> bool:
    from core.services.rag import config as rag_config

    if not rag_config.context_stack_enabled():
        return True
    return get_admin_user() is not None


def require_admin_api(fn: Callable):
    """Context Stack 开启时要求管理员；关闭时不拦截（保持 legacy API 行为）。"""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        from core.services.rag import config as rag_config

        if not rag_config.context_stack_enabled():
            return fn(*args, **kwargs)
        user = get_admin_user()
        if user:
            return fn(*args, **kwargs)
        if not get_current_user_id():
            return jsonify({"error": "请先登录", "code": "AUTH_REQUIRED"}), 401
        return jsonify({"error": "无权使用公共知识库", "code": "ADMIN_REQUIRED"}), 403

    return wrapper
