"""Hub 账号登录态（Flask session）。"""

from __future__ import annotations

import uuid
from functools import wraps
from typing import Callable, Optional

from flask import jsonify, session

from core.services.auth.login_log_db import record_login_success

HUB_USER_SESSION_KEY = "hub_user_id"


def get_current_user_id() -> Optional[str]:
    uid = session.get(HUB_USER_SESSION_KEY)
    if isinstance(uid, str) and len(uid) == 32 and uid.isalnum():
        return uid
    return None


def login_user(
    user_id: str,
    *,
    login_method: str = "",
    login_email: str = "",
) -> None:
    if not (isinstance(user_id, str) and len(user_id) == 32 and user_id.isalnum()):
        raise ValueError("无效的用户标识")
    session[HUB_USER_SESSION_KEY] = user_id
    session.permanent = True
    session.modified = True
    record_login_success(
        user_id,
        login_method=login_method,
        login_email=login_email,
    )


def logout_user() -> None:
    session.pop(HUB_USER_SESSION_KEY, None)
    session.modified = True


def require_login_api(fn: Callable):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先注册并登录后再使用此功能", "code": "AUTH_REQUIRED"}), 401
        # 手机实名软闸门（独立模块；白名单内绑定/资料接口放行）
        try:
            from core.services.auth.phone_bind_gate import phone_bind_gate_block_for_user_id

            blocked = phone_bind_gate_block_for_user_id(uid)
            if blocked is not None:
                return blocked
        except Exception:
            # 闸门异常时不阻断登录态业务，避免误伤全站
            pass
        return fn(*args, **kwargs)

    return wrapper
