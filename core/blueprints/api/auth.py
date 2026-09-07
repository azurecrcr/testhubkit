from __future__ import annotations

from flask import Blueprint, jsonify, request, send_file

from core.services.auth.auth_session import get_current_user_id, login_user, logout_user
from core.services.test_cases.user_lanhu_config_gate import on_user_lanhu_logout
from core.services.auth.captcha import create_captcha, verify_captcha
from core.services.auth.prompt_visibility_admin import is_site_manager
from core.services.auth.user_avatar_service import resolve_avatar_abs_path, save_user_avatar
from core.services.auth.login_log_db import record_login_attempt
from core.services.auth.user_service import (
    change_password_with_code,
    get_user_by_id,
    login_with_code,
    login_with_password,
    register_user,
    send_change_password_code,
    send_email_code,
    update_user_profile,
)
from core.services.auth.phone_auth_service import (
    login_with_phone_code,
    login_with_phone_password,
    register_user_by_phone,
    send_phone_code,
)
from core.services.auth.phone_password_service import (
    change_password_with_phone_code,
    send_phone_change_password_code,
)
from core.services.auth.phone_bind_service import (
    bind_phone_with_code,
    rebind_phone_with_code,
    send_bind_phone_code,
    send_rebind_phone_code,
)
from core.services.auth.email_bind_service import (
    bind_email_with_code,
    send_bind_email_code,
)


def _client_ip() -> str:
    forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    return forwarded or (request.remote_addr or "")

def _user_agent() -> str:
    return (request.headers.get("User-Agent") or "")[:512]



def register_routes(bp: Blueprint) -> None:
    @bp.get("/auth/me")
    def auth_me():
        uid = get_current_user_id()
        if not uid:
            return jsonify({"authenticated": False, "user": None})

        def _build():
            user = get_user_by_id(uid)
            if not user:
                logout_user()
                return {"authenticated": False, "user": None}
            from core.services.auth.phone_bind_gate import attach_phone_bind_gate_fields

            attach_phone_bind_gate_fields(user)
            return {
                "authenticated": True,
                "user": user,
                "can_manage_prompt_visibility": is_site_manager(user),
                "can_manage_builtin_ai": is_site_manager(user),
                "can_view_user_feedback": is_site_manager(user),
            }

        from core.services.shared.user_api_cache import resolve as resolve_user_api_cache

        return jsonify(resolve_user_api_cache("auth_me", uid, build=_build))

    @bp.get("/auth/captcha")
    def auth_captcha():
        data = create_captcha()
        return jsonify({"error": None, **data})

    @bp.post("/auth/send-code")
    def auth_send_code():
        data = request.get_json(silent=True) or {}
        email = data.get("email")
        purpose = data.get("purpose")
        captcha_id = data.get("captcha_id")
        captcha_answer = data.get("captcha_answer")
        # 关闭邮箱注册发码；登录/改密/绑邮箱等其它 purpose 不受影响
        from core.config.phone_bind_gate import (
            EMAIL_REGISTER_DISABLED_MSG,
            email_register_disabled,
        )

        if email_register_disabled() and str(purpose or "").strip().lower() == "register":
            return jsonify({"error": EMAIL_REGISTER_DISABLED_MSG, "code": "EMAIL_REGISTER_DISABLED"}), 400
        if not verify_captcha(str(captcha_id or ""), str(captcha_answer or "")):
            return jsonify({"error": "图形验证码错误或已过期"}), 400
        try:
            send_email_code(email=str(email or ""), purpose=str(purpose or ""), client_ip=_client_ip())
            return jsonify({"error": None, "message": "验证码已发送，请查收邮件（含垃圾箱）"})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503
        except Exception:
            return jsonify({"error": "验证码发送失败，请稍后重试"}), 503

    @bp.post("/auth/register")
    def auth_register():
        from core.config.phone_bind_gate import (
            EMAIL_REGISTER_DISABLED_MSG,
            email_register_disabled,
        )

        if email_register_disabled():
            return jsonify({"error": EMAIL_REGISTER_DISABLED_MSG, "code": "EMAIL_REGISTER_DISABLED"}), 400
        data = request.get_json(silent=True) or {}
        try:
            user = register_user(
                email=str(data.get("email") or ""),
                code=str(data.get("code") or ""),
                password=str(data.get("password") or ""),
                display_name=str(data.get("display_name") or ""),
            )
            login_user(user["id"], login_method="register", login_email=user.get("email") or "")
            return jsonify({"error": None, "user": user})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.post("/auth/phone/send-code")
    def auth_phone_send_code():
        """手机号发送短信验证码（独立接口，不影响邮箱 /auth/send-code）。"""
        data = request.get_json(silent=True) or {}
        captcha_id = data.get("captcha_id")
        captcha_answer = data.get("captcha_answer")
        if not verify_captcha(str(captcha_id or ""), str(captcha_answer or "")):
            return jsonify({"error": "图形验证码错误或已过期"}), 400
        try:
            send_phone_code(
                phone=str(data.get("phone") or ""),
                purpose=str(data.get("purpose") or ""),
                client_ip=_client_ip(),
            )
            return jsonify({"error": None, "message": "验证码已发送，请查收短信"})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503
        except Exception:
            return jsonify({"error": "验证码发送失败，请稍后重试"}), 503

    @bp.post("/auth/phone/register")
    def auth_phone_register():
        data = request.get_json(silent=True) or {}
        try:
            user = register_user_by_phone(
                phone=str(data.get("phone") or ""),
                code=str(data.get("code") or ""),
                password=str(data.get("password") or ""),
                display_name=str(data.get("display_name") or ""),
            )
            login_user(
                user["id"],
                login_method="phone_register",
                login_email=user.get("phone") or "",
            )
            return jsonify({"error": None, "user": user})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503

    @bp.post("/auth/phone/login/code")
    def auth_phone_login_code():
        data = request.get_json(silent=True) or {}
        phone = str(data.get("phone") or "")
        try:
            user = login_with_phone_code(
                phone=phone,
                code=str(data.get("code") or ""),
            )
            login_user(user["id"], login_method="phone_code", login_email=phone)
            return jsonify({"error": None, "user": user})
        except ValueError as exc:
            record_login_attempt(
                email=phone,
                login_method="phone_code",
                success=False,
                client_ip=_client_ip(),
                user_agent=_user_agent(),
                failure_reason=str(exc),
            )
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503

    @bp.post("/auth/phone/login/password")
    def auth_phone_login_password():
        data = request.get_json(silent=True) or {}
        phone = str(data.get("phone") or "")
        try:
            user = login_with_phone_password(
                phone=phone,
                password=str(data.get("password") or ""),
            )
            login_user(user["id"], login_method="phone_password", login_email=phone)
            return jsonify({"error": None, "user": user})
        except ValueError as exc:
            record_login_attempt(
                email=phone,
                login_method="phone_password",
                success=False,
                client_ip=_client_ip(),
                user_agent=_user_agent(),
                failure_reason=str(exc),
            )
            return jsonify({"error": str(exc)}), 400

    @bp.post("/auth/login/code")
    def auth_login_code():
        data = request.get_json(silent=True) or {}
        email = str(data.get("email") or "")
        try:
            user = login_with_code(
                email=email,
                code=str(data.get("code") or ""),
            )
            login_user(user["id"], login_method="code", login_email=email)
            return jsonify({"error": None, "user": user})
        except ValueError as exc:
            record_login_attempt(
                email=email,
                login_method="code",
                success=False,
                client_ip=_client_ip(),
                user_agent=_user_agent(),
                failure_reason=str(exc),
            )
            return jsonify({"error": str(exc)}), 400

    @bp.post("/auth/login/password")
    def auth_login_password():
        data = request.get_json(silent=True) or {}
        email = str(data.get("email") or "")
        try:
            user = login_with_password(
                email=email,
                password=str(data.get("password") or ""),
            )
            login_user(user["id"], login_method="password", login_email=email)
            return jsonify({"error": None, "user": user})
        except ValueError as exc:
            record_login_attempt(
                email=email,
                login_method="password",
                success=False,
                client_ip=_client_ip(),
                user_agent=_user_agent(),
                failure_reason=str(exc),
            )
            return jsonify({"error": str(exc)}), 400

    @bp.patch("/auth/profile")
    def auth_profile():
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录"}), 401
        data = request.get_json(silent=True) or {}
        if "email" in data:
            return jsonify({"error": "邮箱注册后不可修改"}), 400
        try:
            user = update_user_profile(
                user_id=uid,
                display_name=data.get("display_name"),
                display_name_set="display_name" in data,
                current_password=str(data.get("current_password") or ""),
                new_password=str(data.get("new_password") or ""),
            )
            from core.services.shared.user_api_cache import invalidate_user as invalidate_user_api_cache
            invalidate_user_api_cache(uid)
            return jsonify({"error": None, "user": user})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.get("/auth/avatar")
    def auth_avatar():
        from core.services.auth.user_avatar_service import resolve_user_avatar_file

        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录"}), 401
        user = get_user_by_id(uid)
        path = resolve_user_avatar_file(
            user.get("avatar_path") if user else None,
            user_id=uid,
            display_name=user.get("display_name") if user else None,
            email=user.get("email") if user else None,
        )
        ext = path.suffix.lower()
        mime = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
        }.get(ext, "application/octet-stream")
        max_age = 300 if user and user.get("avatar_path") else 86400
        return send_file(path, mimetype=mime, max_age=max_age)

    @bp.post("/auth/profile/avatar")
    def auth_profile_avatar():
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录"}), 401
        file = request.files.get("avatar")
        if not file or not file.filename:
            return jsonify({"error": "请选择头像图片"}), 400
        try:
            user = save_user_avatar(user_id=uid, file=file)
            from core.services.shared.user_api_cache import invalidate_user as invalidate_user_api_cache
            invalidate_user_api_cache(uid)
            return jsonify({"error": None, "user": user})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400


    @bp.post("/auth/password/send-code")
    def auth_password_send_code():
        """已登录用户获取「修改密码」邮箱验证码（需图形验证码）。"""
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录"}), 401
        data = request.get_json(silent=True) or {}
        captcha_id = data.get("captcha_id")
        captcha_answer = data.get("captcha_answer")
        if not verify_captcha(str(captcha_id or ""), str(captcha_answer or "")):
            return jsonify({"error": "图形验证码错误或已过期"}), 400
        try:
            send_change_password_code(user_id=uid, client_ip=_client_ip())
            return jsonify({"error": None, "message": "验证码已发送，请查收邮件（含垃圾箱）"})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503
        except Exception:
            return jsonify({"error": "验证码发送失败，请稍后重试"}), 503

    @bp.post("/auth/password/change")
    def auth_password_change():
        """已登录用户：验证码 + 新密码修改登录密码。"""
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录"}), 401
        data = request.get_json(silent=True) or {}
        try:
            user = change_password_with_code(
                user_id=uid,
                code=str(data.get("code") or ""),
                new_password=str(data.get("new_password") or ""),
                confirm_password=str(data.get("confirm_password") or ""),
            )
            from core.services.shared.user_api_cache import invalidate_user as invalidate_user_api_cache
            invalidate_user_api_cache(uid)
            return jsonify({"error": None, "user": user, "message": "密码修改成功"})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.post("/auth/password/phone/send-code")
    def auth_password_phone_send_code():
        """手机号账号：获取修改密码短信验证码（独立接口，不影响邮箱改密）。"""
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录"}), 401
        data = request.get_json(silent=True) or {}
        captcha_id = data.get("captcha_id")
        captcha_answer = data.get("captcha_answer")
        if not verify_captcha(str(captcha_id or ""), str(captcha_answer or "")):
            return jsonify({"error": "图形验证码错误或已过期"}), 400
        try:
            send_phone_change_password_code(user_id=uid, client_ip=_client_ip())
            return jsonify({"error": None, "message": "验证码已发送，请查收短信"})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503
        except Exception:
            return jsonify({"error": "验证码发送失败，请稍后重试"}), 503

    @bp.post("/auth/password/phone/change")
    def auth_password_phone_change():
        """已绑定手机号的账号：短信验证码 + 新密码修改登录密码。"""
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录"}), 401
        data = request.get_json(silent=True) or {}
        try:
            user = change_password_with_phone_code(
                user_id=uid,
                code=str(data.get("code") or ""),
                new_password=str(data.get("new_password") or ""),
                confirm_password=str(data.get("confirm_password") or ""),
            )
            from core.services.shared.user_api_cache import invalidate_user as invalidate_user_api_cache
            invalidate_user_api_cache(uid)
            return jsonify({"error": None, "user": user, "message": "密码修改成功"})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503

    @bp.post("/auth/phone/bind/send-code")
    def auth_phone_bind_send_code():
        """邮箱账号绑定手机：发送短信验证码。"""
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录"}), 401
        data = request.get_json(silent=True) or {}
        if not verify_captcha(str(data.get("captcha_id") or ""), str(data.get("captcha_answer") or "")):
            return jsonify({"error": "图形验证码错误或已过期"}), 400
        try:
            send_bind_phone_code(
                user_id=uid,
                phone=str(data.get("phone") or ""),
                client_ip=_client_ip(),
            )
            return jsonify({"error": None, "message": "验证码已发送，请查收短信"})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503
        except Exception:
            return jsonify({"error": "验证码发送失败，请稍后重试"}), 503

    @bp.post("/auth/phone/bind")
    def auth_phone_bind():
        """邮箱账号绑定手机。"""
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录"}), 401
        data = request.get_json(silent=True) or {}
        try:
            user = bind_phone_with_code(
                user_id=uid,
                phone=str(data.get("phone") or ""),
                code=str(data.get("code") or ""),
            )
            from core.services.shared.user_api_cache import invalidate_user as invalidate_user_api_cache
            invalidate_user_api_cache(uid)
            return jsonify({"error": None, "user": user, "message": "手机号绑定成功"})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503

    @bp.post("/auth/phone/rebind/send-code")
    def auth_phone_rebind_send_code():
        """邮箱账号更换手机：向新号码发送验证码。"""
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录"}), 401
        data = request.get_json(silent=True) or {}
        if not verify_captcha(str(data.get("captcha_id") or ""), str(data.get("captcha_answer") or "")):
            return jsonify({"error": "图形验证码错误或已过期"}), 400
        try:
            send_rebind_phone_code(
                user_id=uid,
                phone=str(data.get("phone") or ""),
                client_ip=_client_ip(),
            )
            return jsonify({"error": None, "message": "验证码已发送，请查收短信"})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503
        except Exception:
            return jsonify({"error": "验证码发送失败，请稍后重试"}), 503

    @bp.post("/auth/phone/rebind")
    def auth_phone_rebind():
        """邮箱账号更换已绑定手机号。"""
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录"}), 401
        data = request.get_json(silent=True) or {}
        try:
            user = rebind_phone_with_code(
                user_id=uid,
                phone=str(data.get("phone") or ""),
                code=str(data.get("code") or ""),
            )
            from core.services.shared.user_api_cache import invalidate_user as invalidate_user_api_cache
            invalidate_user_api_cache(uid)
            return jsonify({"error": None, "user": user, "message": "手机号更换成功"})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503

    @bp.post("/auth/email/bind/send-code")
    def auth_email_bind_send_code():
        """手机号账号绑定邮箱：发送邮箱验证码。"""
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录"}), 401
        data = request.get_json(silent=True) or {}
        if not verify_captcha(str(data.get("captcha_id") or ""), str(data.get("captcha_answer") or "")):
            return jsonify({"error": "图形验证码错误或已过期"}), 400
        try:
            send_bind_email_code(
                user_id=uid,
                email=str(data.get("email") or ""),
                client_ip=_client_ip(),
            )
            return jsonify({"error": None, "message": "验证码已发送，请查收邮件"})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503
        except Exception:
            return jsonify({"error": "验证码发送失败，请稍后重试"}), 503

    @bp.post("/auth/email/bind")
    def auth_email_bind():
        """手机号账号绑定邮箱。"""
        uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录"}), 401
        data = request.get_json(silent=True) or {}
        try:
            user = bind_email_with_code(
                user_id=uid,
                email=str(data.get("email") or ""),
                code=str(data.get("code") or ""),
            )
            from core.services.shared.user_api_cache import invalidate_user as invalidate_user_api_cache
            invalidate_user_api_cache(uid)
            return jsonify({"error": None, "user": user, "message": "邮箱绑定成功"})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503

    @bp.post("/auth/logout")
    def auth_logout():
        uid = get_current_user_id()
        if uid:
            on_user_lanhu_logout(uid)
        logout_user()
        return jsonify({"error": None, "message": "已退出登录"})
