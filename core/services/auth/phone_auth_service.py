"""手机号注册 / 登录（独立于邮箱 auth 流程）。"""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from werkzeug.security import check_password_hash, generate_password_hash

from core.config import sms_auth as cfg
from core.services.auth.auth_db import ensure_auth_tables
from core.services.auth.phone_identity import (
    is_phone_placeholder_email,
    normalize_phone,
    phone_placeholder_email,
)
from core.services.auth.phone_rate_limit import (
    check_send_phone_code_allowed,
    record_send_phone_code,
)
from core.services.auth.prompt_visibility_admin import ROLE_USER
from core.services.auth.sms_aliyun_client import check_sms_verify_code, send_sms_verify_code
from core.services.auth.user_service import (
    _validate_display_name,
    _validate_password,
    get_user_by_id,
)
from core.services.test_cases.mysql_db import get_connection


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def get_user_by_phone(phone: str) -> Optional[dict[str, Any]]:
    ensure_auth_tables()
    phone = normalize_phone(phone)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, email, phone, password_hash, created_at, updated_at
                FROM hub_users WHERE phone = %s LIMIT 1
                """,
                (phone,),
            )
            row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def send_phone_code(*, phone: str, purpose: str, client_ip: str) -> None:
    ensure_auth_tables()
    if not cfg.is_sms_auth_ready():
        raise RuntimeError("手机验证码服务暂未开放")

    phone = normalize_phone(phone)
    purpose = (purpose or "").strip().lower()
    if purpose not in ("register", "login"):
        raise ValueError("无效的验证码用途")

    exists = get_user_by_phone(phone)
    if purpose == "register" and exists:
        raise ValueError("该手机号已注册，请直接登录")
    if purpose == "login" and not exists:
        raise ValueError("该手机号尚未注册，请先注册")

    check_send_phone_code_allowed(phone=phone, client_ip=client_ip)
    send_sms_verify_code(phone=phone)
    record_send_phone_code(phone=phone, client_ip=client_ip)


def register_user_by_phone(
    *,
    phone: str,
    code: str,
    password: str,
    display_name: str | None = None,
) -> dict[str, Any]:
    ensure_auth_tables()
    if not cfg.is_sms_auth_ready():
        raise RuntimeError("手机验证码服务暂未开放")

    phone = normalize_phone(phone)
    password = _validate_password(password)
    if get_user_by_phone(phone):
        raise ValueError("该手机号已注册，请直接登录")

    check_sms_verify_code(phone=phone, code=code)
    nickname = _validate_display_name(display_name, required=True)
    user_id = uuid.uuid4().hex
    now = _now_str()
    pwd_hash = generate_password_hash(password)
    email = phone_placeholder_email(phone)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO hub_users
                    (id, email, phone, phone_verified_at, display_name, password_hash, role, created_at, updated_at)
                VALUES
                    (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (user_id, email, phone, now, nickname, pwd_hash, ROLE_USER, now, now),
            )
    except Exception as exc:  # noqa: BLE001
        err = str(exc).lower()
        if "duplicate" in err or "1062" in err:
            raise ValueError("该手机号已注册，请直接登录") from exc
        raise
    finally:
        conn.close()

    from core.services.auth.user_default_avatar_service import ensure_user_default_avatar

    ensure_user_default_avatar(
        user_id=user_id,
        display_name=nickname,
        email=None,
        update_db=True,
    )

    user = get_user_by_id(user_id)
    if user:
        return user
    return {
        "id": user_id,
        "email": None,
        "phone": phone,
        "account_type": "phone",
        "display_name": nickname,
        "created_at": now,
        "updated_at": now,
    }


def login_with_phone_code(*, phone: str, code: str) -> dict[str, Any]:
    ensure_auth_tables()
    if not cfg.is_sms_auth_ready():
        raise RuntimeError("手机验证码服务暂未开放")

    phone = normalize_phone(phone)
    user = get_user_by_phone(phone)
    if not user:
        raise ValueError("该手机号尚未注册")
    check_sms_verify_code(phone=phone, code=code)
    full = get_user_by_id(user["id"])
    return full or {"id": user["id"], "phone": phone, "email": None}


def login_with_phone_password(*, phone: str, password: str) -> dict[str, Any]:
    ensure_auth_tables()
    phone = normalize_phone(phone)
    user = get_user_by_phone(phone)
    if not user:
        raise ValueError("手机号或密码错误")
    if not check_password_hash(user.get("password_hash") or "", password or ""):
        raise ValueError("手机号或密码错误")
    full = get_user_by_id(user["id"])
    return full or {"id": user["id"], "phone": phone, "email": None}


def assert_user_has_real_email_for_code(user_id: str) -> str:
    """改密发邮专用：返回真实邮箱；手机占位邮箱则拒绝。"""
    ensure_auth_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT email, phone FROM hub_users WHERE id = %s LIMIT 1",
                (user_id,),
            )
            row = cur.fetchone() or {}
    finally:
        conn.close()
    email = (row.get("email") or "").strip()
    if not email or is_phone_placeholder_email(email):
        raise ValueError("手机号注册账号请使用短信验证码修改密码")
    return email
