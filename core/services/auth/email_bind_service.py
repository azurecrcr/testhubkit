"""手机号账号绑定邮箱（独立于注册、登录、邮箱改密、手机绑定）。"""

from __future__ import annotations

import time
from typing import Any

from core.services.auth.auth_db import ensure_auth_tables
from core.services.auth.phone_identity import is_phone_placeholder_email
from core.services.auth.rate_limit import normalize_email
from core.services.auth.user_service import (
    consume_bind_email_code,
    get_user_by_email,
    get_user_by_id,
    issue_bind_email_code,
)
from core.services.test_cases.mysql_db import get_connection


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


def _assert_phone_primary_without_email(identity: dict[str, Any]) -> None:
    if not identity.get("phone"):
        raise ValueError("仅手机号注册账号可绑定邮箱")
    email = identity.get("email") or ""
    if email and not is_phone_placeholder_email(email):
        raise ValueError("已绑定邮箱，无需重复绑定")


def send_bind_email_code(*, user_id: str, email: str, client_ip: str) -> None:
    """手机号账号：向目标邮箱发送绑定验证码。"""
    identity = _load_user_identity(user_id)
    _assert_phone_primary_without_email(identity)

    email = normalize_email(email)
    occupied = get_user_by_email(email)
    if occupied and occupied.get("id") != user_id:
        raise ValueError("该邮箱已被其他账号使用")
    if occupied and occupied.get("id") == user_id:
        raise ValueError("该邮箱已绑定到当前账号")

    issue_bind_email_code(email=email, client_ip=client_ip)


def bind_email_with_code(*, user_id: str, email: str, code: str) -> dict[str, Any]:
    identity = _load_user_identity(user_id)
    _assert_phone_primary_without_email(identity)

    email = normalize_email(email)
    occupied = get_user_by_email(email)
    if occupied and occupied.get("id") != user_id:
        raise ValueError("该邮箱已被其他账号使用")

    consume_bind_email_code(email=email, code=code)

    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE hub_users
                SET email = %s, updated_at = %s
                WHERE id = %s
                """,
                (email, now, user_id),
            )
    finally:
        conn.close()

    user = get_user_by_id(user_id)
    if not user:
        raise ValueError("绑定失败")
    return user
