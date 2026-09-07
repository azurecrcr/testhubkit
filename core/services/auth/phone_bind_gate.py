"""
手机实名软闸门（独立模块）。

不修改登录写入、不改绑手机服务本身；供 require_login_api / desktop / auth_me 调用。
"""

from __future__ import annotations

from typing import Any, Optional, Tuple

from flask import jsonify, request

from core.config.phone_bind_gate import (
    PHONE_BIND_REQUIRED_MSG,
    phone_bind_gate_enabled,
)

# 白名单：未绑手机时仍须可用（绑定、资料、会话）
_EXEMPT_PREFIXES = (
    "/api/auth/me",
    "/api/auth/logout",
    "/api/auth/captcha",
    "/api/auth/profile",
    "/api/auth/avatar",
    "/api/auth/phone/bind",
    "/api/auth/phone/rebind",
    "/api/auth/email/bind",
    "/api/auth/password",
    "/api/desktop/auth/me",
    "/api/desktop/auth/login",
    "/api/desktop/auth/refresh",
    "/api/desktop/auth/logout",
)


def is_phone_bind_gate_exempt_path(path: str) -> bool:
    p = (path or "").split("?")[0]
    if not p:
        return False
    for prefix in _EXEMPT_PREFIXES:
        if p == prefix or p.startswith(prefix + "/"):
            return True
    return False


def user_needs_phone_bind(user: Optional[dict[str, Any]]) -> bool:
    """邮箱主账号且未绑手机时需要强制绑定。手机注册用户已有 phone。"""
    if not phone_bind_gate_enabled():
        return False
    if not user:
        return False
    has_phone = bool(user.get("has_phone") or user.get("phone"))
    if has_phone:
        return False
    # 无手机即需绑定（含仅邮箱历史账号）
    return True


def attach_phone_bind_gate_fields(user: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """给 auth/me 等返回附加 phone_bind_required（原地写入，不改库）。"""
    if not user:
        return user
    user["phone_bind_required"] = bool(user_needs_phone_bind(user))
    return user


def phone_bind_required_json_response() -> Tuple[Any, int]:
    return (
        jsonify(
            {
                "error": PHONE_BIND_REQUIRED_MSG,
                "code": "PHONE_BIND_REQUIRED",
                "bind_url": "/account/bind-phone",
            }
        ),
        403,
    )


def phone_bind_gate_block_for_user_id(user_id: str) -> Optional[Tuple[Any, int]]:
    """若需拦截返回 (response, status)，否则 None。"""
    if not phone_bind_gate_enabled():
        return None
    path = ""
    try:
        path = request.path or ""
    except Exception:
        path = ""
    if is_phone_bind_gate_exempt_path(path):
        return None
    from core.services.auth.user_service import get_user_by_id

    user = get_user_by_id(user_id)
    if user_needs_phone_bind(user):
        return phone_bind_required_json_response()
    return None
