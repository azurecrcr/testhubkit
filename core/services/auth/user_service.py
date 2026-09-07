from __future__ import annotations

import hashlib
import random
import time
import uuid
from datetime import datetime, timedelta
from typing import Any, Optional

from werkzeug.security import check_password_hash, generate_password_hash

from core.services.auth.auth_db import ensure_auth_tables
from core.services.auth.prompt_visibility_admin import ROLE_USER
from core.services.auth.email_sender import send_verification_email
from core.services.auth.rate_limit import check_send_code_allowed, normalize_email, record_send_code
from core.services.test_cases.mysql_db import get_connection

CODE_EXPIRE_MINUTES = 10
PASSWORD_MIN_LEN = 8


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _gen_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def _validate_password(password: str) -> str:
    p = password or ""
    if len(p) < PASSWORD_MIN_LEN:
        raise ValueError(f"密码至少 {PASSWORD_MIN_LEN} 位")
    if len(p) > 128:
        raise ValueError("密码过长")
    return p


def get_user_by_id(user_id: str) -> Optional[dict[str, Any]]:
    ensure_auth_tables()
    if not (isinstance(user_id, str) and len(user_id) == 32 and user_id.isalnum()):
        return None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, phone, display_name, avatar_path, role, created_at, updated_at "
                "FROM hub_users WHERE id = %s LIMIT 1",
                (user_id,),
            )
            row = cur.fetchone()
        if not row:
            return None
        from core.services.auth.phone_identity import is_phone_placeholder_email, mask_phone
        from core.services.auth.user_avatar_service import avatar_public_url

        updated_at = _fmt_dt(row.get("updated_at"))
        avatar_path = (row.get("avatar_path") or "").strip() or None
        raw_email = (row.get("email") or "").strip() or None
        phone = (row.get("phone") or "").strip() or None
        # 对外隐藏手机注册占位邮箱，避免暴露 @phone.local
        public_email = None if is_phone_placeholder_email(raw_email) else raw_email
        has_email = bool(public_email)
        has_phone = bool(phone)
        account_type = "phone" if has_phone and not has_email else "email"
        return {
            "id": row["id"],
            "email": public_email,
            "phone": phone,
            "phone_masked": mask_phone(phone),
            "account_type": account_type,
            "has_email": has_email,
            "has_phone": has_phone,
            "can_login_by_email": has_email,
            "can_login_by_phone": has_phone,
            "display_name": (row.get("display_name") or "").strip() or None,
            "avatar_path": avatar_path,
            "avatar_url": avatar_public_url(updated_at),
            "role": (row.get("role") or ROLE_USER).strip() or ROLE_USER,
            "created_at": _fmt_dt(row.get("created_at")),
            "updated_at": updated_at,
        }
    finally:
        conn.close()


def get_user_by_email(email: str) -> Optional[dict[str, Any]]:
    email = normalize_email(email)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, password_hash, created_at, updated_at FROM hub_users WHERE email = %s LIMIT 1",
                (email,),
            )
            row = cur.fetchone()
        if not row:
            return None
        return dict(row)
    finally:
        conn.close()


def _fmt_dt(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat(sep="T")
    return str(value or "")


def send_email_code(*, email: str, purpose: str, client_ip: str) -> None:
    ensure_auth_tables()
    email = normalize_email(email)
    purpose = (purpose or "").strip().lower()
    if purpose not in ("register", "login", "chg_pwd"):
        raise ValueError("无效的验证码用途")

    exists = get_user_by_email(email)
    if purpose == "register" and exists:
        raise ValueError("该邮箱已注册，请直接登录")
    if purpose == "login" and not exists:
        raise ValueError("该邮箱尚未注册，请先注册")
    if purpose == "chg_pwd" and not exists:
        raise ValueError("该邮箱尚未注册")

    check_send_code_allowed(email=email, client_ip=client_ip)
    code = _gen_code()
    code_id = uuid.uuid4().hex
    expires = datetime.now() + timedelta(minutes=CODE_EXPIRE_MINUTES)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO hub_email_verification_codes
                (id, email, purpose, code_hash, expires_at, used_at, created_at, client_ip)
                VALUES (%s, %s, %s, %s, %s, NULL, %s, %s)
                """,
                (
                    code_id,
                    email,
                    purpose,
                    _hash_code(code),
                    expires.strftime("%Y-%m-%d %H:%M:%S"),
                    _now_str(),
                    (client_ip or "")[:45],
                ),
            )
    finally:
        conn.close()

    try:
        send_verification_email(to_email=email, code=code, purpose=purpose)
    except Exception:
        cleanup = get_connection()
        try:
            with cleanup.cursor() as cur:
                cur.execute("DELETE FROM hub_email_verification_codes WHERE id = %s", (code_id,))
        finally:
            cleanup.close()
        raise

    record_send_code(email=email, client_ip=client_ip)


def _verify_email_code(*, email: str, code: str, purpose: str) -> None:
    email = normalize_email(email)
    purpose = (purpose or "").strip().lower()
    code = (code or "").strip()
    if not code.isdigit() or len(code) != 6:
        raise ValueError("请输入 6 位数字验证码")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, code_hash, expires_at, used_at
                FROM hub_email_verification_codes
                WHERE email = %s AND purpose = %s
                ORDER BY created_at DESC
                LIMIT 5
                """,
                (email, purpose),
            )
            rows = cur.fetchall() or []
        matched_id = None
        now = datetime.now()
        for row in rows:
            if row.get("used_at"):
                continue
            exp = row.get("expires_at")
            if isinstance(exp, str):
                try:
                    exp = datetime.strptime(exp, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    exp = None
            if isinstance(exp, datetime) and exp < now:
                continue
            if row.get("code_hash") == _hash_code(code):
                matched_id = row["id"]
                break
        if not matched_id:
            raise ValueError("验证码错误或已过期")

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE hub_email_verification_codes SET used_at = %s WHERE id = %s",
                (_now_str(), matched_id),
            )
    finally:
        conn.close()


def register_user(
    *,
    email: str,
    code: str,
    password: str,
    display_name: str | None = None,
) -> dict[str, Any]:
    ensure_auth_tables()
    email = normalize_email(email)
    password = _validate_password(password)
    if get_user_by_email(email):
        raise ValueError("该邮箱已注册，请直接登录")

    _verify_email_code(email=email, code=code, purpose="register")
    nickname = _validate_display_name(display_name, required=True)
    user_id = uuid.uuid4().hex
    now = _now_str()
    pwd_hash = generate_password_hash(password)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO hub_users (id, email, display_name, password_hash, role, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (user_id, email, nickname, pwd_hash, ROLE_USER, now, now),
            )
    except Exception as exc:  # noqa: BLE001
        # 并发下唯一索引冲突：仍提示去登录，避免二次注册
        err = str(exc).lower()
        if "duplicate" in err or "1062" in err:
            raise ValueError("该邮箱已注册，请直接登录") from exc
        raise
    finally:
        conn.close()

    from core.services.auth.user_default_avatar_service import ensure_user_default_avatar

    ensure_user_default_avatar(
        user_id=user_id,
        display_name=nickname,
        email=email,
        update_db=True,
    )

    user = get_user_by_id(user_id)
    if user:
        return user
    return {
        "id": user_id,
        "email": email,
        "display_name": nickname,
        "created_at": now,
        "updated_at": now,
    }


def login_with_code(*, email: str, code: str) -> dict[str, Any]:
    email = normalize_email(email)
    user = get_user_by_email(email)
    if not user:
        raise ValueError("该邮箱尚未注册")
    _verify_email_code(email=email, code=code, purpose="login")
    return {"id": user["id"], "email": user["email"]}


def login_with_password(*, email: str, password: str) -> dict[str, Any]:
    email = normalize_email(email)
    user = get_user_by_email(email)
    if not user:
        raise ValueError("邮箱或密码错误")
    if not check_password_hash(user.get("password_hash") or "", password or ""):
        raise ValueError("邮箱或密码错误")
    return {"id": user["id"], "email": user["email"]}


def _validate_display_name(display_name: str | None, *, required: bool = False) -> str | None:
    if display_name is None:
        if required:
            raise ValueError("请填写昵称")
        return None
    name = (display_name or "").strip()
    if not name:
        if required:
            raise ValueError("请填写昵称")
        return None
    if len(name) > 64:
        raise ValueError("昵称不能超过 64 个字符")
    return name


def update_user_profile(
    *,
    user_id: str,
    display_name: str | None = None,
    current_password: str | None = None,
    new_password: str | None = None,
    display_name_set: bool = False,
) -> dict[str, Any]:
    ensure_auth_tables()
    user = get_user_by_id(user_id)
    if not user:
        raise ValueError("用户不存在")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT password_hash FROM hub_users WHERE id = %s LIMIT 1",
                (user_id,),
            )
            row = cur.fetchone() or {}
        pwd_hash = row.get("password_hash") or ""

        new_pwd = (new_password or "").strip()
        cur_pwd = (current_password or "").strip()
        if new_pwd or cur_pwd:
            if not cur_pwd or not new_pwd:
                raise ValueError("修改密码需同时填写当前密码和新密码")
            if not check_password_hash(pwd_hash, cur_pwd):
                raise ValueError("当前密码不正确")
            new_pwd = _validate_password(new_pwd)
            pwd_hash = generate_password_hash(new_pwd)

        display_val = user.get("display_name")
        if display_name_set:
            display_val = _validate_display_name(display_name, required=True)

        now = _now_str()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE hub_users "
                "SET display_name = %s, password_hash = %s, updated_at = %s "
                "WHERE id = %s",
                (display_val, pwd_hash, now, user_id),
            )
    finally:
        conn.close()

    if display_name_set and display_val != user.get("display_name"):
        from core.services.auth.user_default_avatar_service import regenerate_default_avatar_if_applicable

        regenerate_default_avatar_if_applicable(
            user_id=user_id,
            display_name=display_val,
            avatar_path=user.get("avatar_path"),
            email=user.get("email"),
        )

    updated = get_user_by_id(user_id)
    if not updated:
        raise ValueError("保存失败")
    return updated


def send_change_password_code(*, user_id: str, client_ip: str) -> None:
    """已登录用户：向其注册邮箱发送「修改密码」验证码（独立入口，不改注册/登录语义）。"""
    from core.services.auth.phone_auth_service import assert_user_has_real_email_for_code

    email = assert_user_has_real_email_for_code(user_id)
    send_email_code(email=email, purpose="chg_pwd", client_ip=client_ip)


def change_password_with_code(
    *,
    user_id: str,
    code: str,
    new_password: str,
    confirm_password: str,
) -> dict[str, Any]:
    """已登录用户：校验邮箱验证码后修改密码（独立方法，不影响 profile 其它字段更新）。"""
    ensure_auth_tables()
    from core.services.auth.phone_auth_service import assert_user_has_real_email_for_code

    email = assert_user_has_real_email_for_code(user_id)
    if (new_password or "") != (confirm_password or ""):
        raise ValueError("两次输入的新密码不一致")
    pwd = _validate_password(new_password)
    _verify_email_code(email=email, code=code, purpose="chg_pwd")
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
    return refreshed or {"id": user_id, "email": email}


def issue_bind_email_code(*, email: str, client_ip: str) -> None:
    """向目标邮箱发送「绑定邮箱」验证码（独立用途，不改动注册/登录发码逻辑）。"""
    ensure_auth_tables()
    email = normalize_email(email)
    if get_user_by_email(email):
        raise ValueError("该邮箱已被注册或绑定")

    check_send_code_allowed(email=email, client_ip=client_ip)
    code = _gen_code()
    code_id = uuid.uuid4().hex
    expires = datetime.now() + timedelta(minutes=CODE_EXPIRE_MINUTES)
    purpose = "bind"

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO hub_email_verification_codes
                (id, email, purpose, code_hash, expires_at, used_at, created_at, client_ip)
                VALUES (%s, %s, %s, %s, %s, NULL, %s, %s)
                """,
                (
                    code_id,
                    email,
                    purpose,
                    _hash_code(code),
                    expires.strftime("%Y-%m-%d %H:%M:%S"),
                    _now_str(),
                    (client_ip or "")[:45],
                ),
            )
    finally:
        conn.close()

    try:
        send_verification_email(to_email=email, code=code, purpose=purpose)
    except Exception:
        cleanup = get_connection()
        try:
            with cleanup.cursor() as cur:
                cur.execute("DELETE FROM hub_email_verification_codes WHERE id = %s", (code_id,))
        finally:
            cleanup.close()
        raise

    record_send_code(email=email, client_ip=client_ip)


def consume_bind_email_code(*, email: str, code: str) -> None:
    """校验并消耗「绑定邮箱」验证码。"""
    _verify_email_code(email=email, code=code, purpose="bind")

