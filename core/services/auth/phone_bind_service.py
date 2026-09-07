"""邮箱账号绑定 / 更换手机号（独立于注册、登录、邮箱改密）。"""

from __future__ import annotations

import time
from typing import Any

from core.config import sms_auth as cfg
from core.services.auth.auth_db import ensure_auth_tables
from core.services.auth.phone_auth_service import get_user_by_phone
from core.services.auth.phone_identity import is_phone_placeholder_email, normalize_phone
from core.services.auth.phone_rate_limit import (
    check_send_phone_code_allowed,
    record_send_phone_code,
)
from core.services.auth.sms_aliyun_client import check_sms_verify_code, send_sms_verify_code
from core.services.auth.user_service import get_user_by_id
from core.services.test_cases.mysql_db import get_connection

_BIND_ACTION = "send_phone_bind"
_REBIND_ACTION = "send_phone_rebind"


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _load_user_identity(user_id: str) -> dict[str, Any]:
    ensure_auth_tables()
    if not (isinstance(user_id, str) and len(user_id) == 32 and user_id.isalnum()):
        raise ValueError("请先登录")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, phone FROM hub_users WHERE id = %s LIMIT 1",
                (user_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        raise ValueError("请先登录")
    return {
        "id": row["id"],
        "email": (row.get("email") or "").strip(),
        "phone": (row.get("phone") or "").strip() or None,
    }


def _assert_email_primary_user(identity: dict[str, Any]) -> None:
    email = identity.get("email") or ""
    if not email or is_phone_placeholder_email(email):
        raise ValueError("手机号注册账号无需再绑定手机号")


def _assert_phone_available(*, phone: str, user_id: str) -> None:
    occupied = get_user_by_phone(phone)
    if occupied and occupied.get("id") != user_id:
        raise ValueError("该手机号已被其他账号绑定")


def send_bind_phone_code(*, user_id: str, phone: str, client_ip: str) -> None:
    """未绑定手机的邮箱账号：向目标手机发送绑定验证码。"""
    if not cfg.is_sms_auth_ready():
        raise RuntimeError("手机验证码服务暂未开放")
    identity = _load_user_identity(user_id)
    _assert_email_primary_user(identity)
    if identity.get("phone"):
        raise ValueError("已绑定手机号，如需更换请使用「更换手机号」")

    phone = normalize_phone(phone)
    _assert_phone_available(phone=phone, user_id=user_id)
    check_send_phone_code_allowed(phone=phone, client_ip=client_ip, action=_BIND_ACTION)
    send_sms_verify_code(phone=phone)
    record_send_phone_code(phone=phone, client_ip=client_ip, action=_BIND_ACTION)


def bind_phone_with_code(*, user_id: str, phone: str, code: str) -> dict[str, Any]:
    if not cfg.is_sms_auth_ready():
        raise RuntimeError("手机验证码服务暂未开放")
    identity = _load_user_identity(user_id)
    _assert_email_primary_user(identity)
    if identity.get("phone"):
        raise ValueError("已绑定手机号，如需更换请使用「更换手机号」")

    phone = normalize_phone(phone)
    _assert_phone_available(phone=phone, user_id=user_id)
    check_sms_verify_code(phone=phone, code=code)

    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE hub_users
                SET phone = %s, phone_verified_at = %s, updated_at = %s
                WHERE id = %s
                """,
                (phone, now, now, user_id),
            )
    finally:
        conn.close()

    user = get_user_by_id(user_id)
    if not user:
        raise ValueError("绑定失败")
    return user


def send_rebind_phone_code(*, user_id: str, phone: str, client_ip: str) -> None:
    """已绑定手机的邮箱账号：向新手机号发送换绑验证码。"""
    if not cfg.is_sms_auth_ready():
        raise RuntimeError("手机验证码服务暂未开放")
    identity = _load_user_identity(user_id)
    _assert_email_primary_user(identity)
    if not identity.get("phone"):
        raise ValueError("尚未绑定手机号，请先绑定")

    phone = normalize_phone(phone)
    if phone == identity.get("phone"):
        raise ValueError("新手机号不能与当前绑定号码相同")
    _assert_phone_available(phone=phone, user_id=user_id)
    check_send_phone_code_allowed(phone=phone, client_ip=client_ip, action=_REBIND_ACTION)
    send_sms_verify_code(phone=phone)
    record_send_phone_code(phone=phone, client_ip=client_ip, action=_REBIND_ACTION)


def rebind_phone_with_code(*, user_id: str, phone: str, code: str) -> dict[str, Any]:
    if not cfg.is_sms_auth_ready():
        raise RuntimeError("手机验证码服务暂未开放")
    identity = _load_user_identity(user_id)
    _assert_email_primary_user(identity)
    if not identity.get("phone"):
        raise ValueError("尚未绑定手机号，请先绑定")

    phone = normalize_phone(phone)
    if phone == identity.get("phone"):
        raise ValueError("新手机号不能与当前绑定号码相同")
    _assert_phone_available(phone=phone, user_id=user_id)
    check_sms_verify_code(phone=phone, code=code)

    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE hub_users
                SET phone = %s, phone_verified_at = %s, updated_at = %s
                WHERE id = %s
                """,
                (phone, now, now, user_id),
            )
    finally:
        conn.close()

    user = get_user_by_id(user_id)
    if not user:
        raise ValueError("更换失败")
    return user
