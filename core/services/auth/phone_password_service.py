"""手机号账号：短信验证码修改密码（独立于邮箱改密流程）。"""

from __future__ import annotations

import time
from typing import Any

from werkzeug.security import generate_password_hash

from core.config import sms_auth as cfg
from core.services.auth.auth_db import ensure_auth_tables
from core.services.auth.phone_rate_limit import (
    check_send_phone_code_allowed,
    record_send_phone_code,
)
from core.services.auth.sms_aliyun_client import check_sms_verify_code, send_sms_verify_code
from core.services.auth.user_service import _validate_password, get_user_by_id
from core.services.test_cases.mysql_db import get_connection

_PHONE_CHG_PWD_ACTION = "send_phone_chg_pwd"


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _get_bound_phone_for_sms_password(user_id: str) -> str:
    """任意已绑定手机号的账号均可走短信改密（含邮箱主账号绑手机）。"""
    ensure_auth_tables()
    if not (isinstance(user_id, str) and len(user_id) == 32 and user_id.isalnum()):
        raise ValueError("请先登录")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT phone FROM hub_users WHERE id = %s LIMIT 1",
                (user_id,),
            )
            row = cur.fetchone() or {}
    finally:
        conn.close()

    phone = (row.get("phone") or "").strip()
    if not phone:
        raise ValueError("当前账号未绑定手机号，请使用邮箱验证码修改密码")
    return phone


def send_phone_change_password_code(*, user_id: str, client_ip: str) -> None:
    if not cfg.is_sms_auth_ready():
        raise RuntimeError("手机验证码服务暂未开放")
    phone = _get_bound_phone_for_sms_password(user_id)
    check_send_phone_code_allowed(phone=phone, client_ip=client_ip, action=_PHONE_CHG_PWD_ACTION)
    send_sms_verify_code(phone=phone)
    record_send_phone_code(phone=phone, client_ip=client_ip, action=_PHONE_CHG_PWD_ACTION)


def change_password_with_phone_code(
    *,
    user_id: str,
    code: str,
    new_password: str,
    confirm_password: str,
) -> dict[str, Any]:
    if not cfg.is_sms_auth_ready():
        raise RuntimeError("手机验证码服务暂未开放")
    phone = _get_bound_phone_for_sms_password(user_id)
    if (new_password or "") != (confirm_password or ""):
        raise ValueError("两次输入的新密码不一致")
    pwd = _validate_password(new_password)
    check_sms_verify_code(phone=phone, code=code)
    pwd_hash = generate_password_hash(pwd)
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE hub_users SET password_hash = %s, updated_at = %s WHERE id = %s",
                (pwd_hash, now, user_id),
            )
    finally:
        conn.close()
    refreshed = get_user_by_id(user_id)
    return refreshed or {"id": user_id, "phone": phone, "email": None}
