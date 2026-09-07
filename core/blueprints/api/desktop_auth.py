"""桌面 Workbench 专用鉴权 API（与网页 Cookie Session 分离）。"""
from __future__ import annotations

from flask import Blueprint, jsonify, request, send_file

from core.services.auth.auth_session import get_current_user_id
from core.services.auth.desktop_auth_service import (
    desktop_login,
    get_request_desktop_auth,
    list_devices_for_user,
    refresh_token,
    require_desktop_token,
    revoke_device,
    revoke_token_raw,
    upsert_device,
    verify_bearer_token,
    write_audit,
)
from core.services.auth.user_service import get_user_by_id


def _client_ip() -> str:
    forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    return forwarded or (request.remote_addr or "")


def register_routes(bp: Blueprint) -> None:
    @bp.post("/desktop/auth/login/password")
    def desktop_auth_login_password():
        data = request.get_json(silent=True) or {}
        try:
            payload = desktop_login(
                email=str(data.get("email") or ""),
                password=str(data.get("password") or ""),
                device_id=str(data.get("device_id") or ""),
                device_name=str(data.get("device_name") or ""),
                public_key=str(data.get("public_key") or ""),
                method="password",
            )
            return jsonify(payload)
        except ValueError as exc:
            return jsonify({"error": str(exc), "code": "LOGIN_FAILED"}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc), "code": "SSH_SYNC_FAILED"}), 503

    @bp.post("/desktop/auth/login/code")
    def desktop_auth_login_code():
        data = request.get_json(silent=True) or {}
        try:
            payload = desktop_login(
                email=str(data.get("email") or ""),
                code=str(data.get("code") or ""),
                device_id=str(data.get("device_id") or ""),
                device_name=str(data.get("device_name") or ""),
                public_key=str(data.get("public_key") or ""),
                method="code",
            )
            return jsonify(payload)
        except ValueError as exc:
            return jsonify({"error": str(exc), "code": "LOGIN_FAILED"}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc), "code": "SSH_SYNC_FAILED"}), 503

    @bp.post("/desktop/auth/refresh")
    @require_desktop_token
    def desktop_auth_refresh():
        raw = getattr(request, "desktop_token_raw", "")
        try:
            token = refresh_token(raw)
            auth = get_request_desktop_auth() or {}
            write_audit(
                event="token_refresh",
                user_id=str(auth.get("user_id") or ""),
                device_id=str(auth.get("device_id") or ""),
            )
            return jsonify({"error": None, **token})
        except PermissionError as exc:
            return jsonify({"error": "无法续期，请重新登录", "code": str(exc)}), 401

    @bp.post("/desktop/auth/logout")
    @require_desktop_token
    def desktop_auth_logout():
        auth = get_request_desktop_auth() or {}
        raw = getattr(request, "desktop_token_raw", "")
        revoke_token_raw(raw)
        write_audit(
            event="logout",
            user_id=str(auth.get("user_id") or ""),
            device_id=str(auth.get("device_id") or ""),
        )
        return jsonify({"error": None, "ok": True})

    @bp.get("/desktop/auth/me")
    @require_desktop_token
    def desktop_auth_me():
        auth = get_request_desktop_auth() or {}
        user = get_user_by_id(str(auth.get("user_id") or ""))
        if not user:
            return jsonify({"error": "用户不存在", "code": "USER_GONE"}), 401
        return jsonify(
            {
                "error": None,
                "authenticated": True,
                "user": user,
                "device": {
                    "id": auth.get("device_id"),
                    "name": auth.get("device_name"),
                    "fingerprint": auth.get("fingerprint"),
                },
            }
        )

    @bp.get("/desktop/auth/avatar")
    @require_desktop_token
    def desktop_auth_avatar():
        """桌面端用 Bearer Token 拉取当前用户头像（与网页 Session 的 /auth/avatar 对应）。"""
        from core.services.auth.user_avatar_service import resolve_user_avatar_file

        auth = get_request_desktop_auth() or {}
        uid = str(auth.get("user_id") or "")
        if not uid:
            return jsonify({"error": "请先登录", "code": "UNAUTHORIZED"}), 401
        user = get_user_by_id(uid)
        if not user:
            return jsonify({"error": "用户不存在", "code": "USER_GONE"}), 401
        path = resolve_user_avatar_file(
            user.get("avatar_path"),
            user_id=uid,
            display_name=user.get("display_name"),
            email=user.get("email"),
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
        max_age = 300 if user.get("avatar_path") else 86400
        return send_file(path, mimetype=mime, max_age=max_age)

    @bp.post("/desktop/devices/register")
    @require_desktop_token
    def desktop_devices_register():
        auth = get_request_desktop_auth() or {}
        data = request.get_json(silent=True) or {}
        try:
            device = upsert_device(
                user_id=str(auth.get("user_id") or ""),
                device_id=str(data.get("device_id") or auth.get("device_id") or ""),
                device_name=str(data.get("device_name") or ""),
                public_key=str(data.get("public_key") or ""),
            )
            write_audit(
                event="device_register",
                user_id=str(auth.get("user_id") or ""),
                device_id=device["id"],
            )
            return jsonify({"error": None, "device": device})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return jsonify({"error": str(exc), "code": "SSH_SYNC_FAILED"}), 503

    @bp.get("/desktop/devices")
    def desktop_devices_list():
        # 桌面 Token 或网页 Session 均可查看自己的设备
        uid = None
        auth_header = request.headers.get("Authorization") or ""
        if auth_header.lower().startswith("bearer "):
            try:
                info = verify_bearer_token(auth_header[7:].strip())
                uid = str(info.get("user_id") or "")
            except PermissionError:
                return jsonify({"error": "登录已失效", "code": "TOKEN_INVALID"}), 401
        if not uid:
            uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录", "code": "AUTH_REQUIRED"}), 401
        return jsonify({"error": None, "devices": list_devices_for_user(uid)})

    @bp.post("/desktop/devices/<device_id>/revoke")
    def desktop_devices_revoke(device_id: str):
        uid = None
        auth_header = request.headers.get("Authorization") or ""
        if auth_header.lower().startswith("bearer "):
            try:
                info = verify_bearer_token(auth_header[7:].strip())
                uid = str(info.get("user_id") or "")
            except PermissionError:
                return jsonify({"error": "登录已失效", "code": "TOKEN_INVALID"}), 401
        if not uid:
            uid = get_current_user_id()
        if not uid:
            return jsonify({"error": "请先登录", "code": "AUTH_REQUIRED"}), 401
        try:
            revoke_device(user_id=uid, device_id=device_id)
            write_audit(event="device_revoke", user_id=uid, device_id=device_id)
            return jsonify({"error": None, "ok": True})
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @bp.post("/desktop/tunnel/heartbeat")
    @require_desktop_token
    def desktop_tunnel_heartbeat():
        auth = get_request_desktop_auth() or {}
        write_audit(
            event="tunnel_heartbeat",
            user_id=str(auth.get("user_id") or ""),
            device_id=str(auth.get("device_id") or ""),
            detail="up",
        )
        return jsonify({"error": None, "ok": True})

    @bp.post("/desktop/tunnel/closed")
    @require_desktop_token
    def desktop_tunnel_closed():
        auth = get_request_desktop_auth() or {}
        write_audit(
            event="tunnel_closed",
            user_id=str(auth.get("user_id") or ""),
            device_id=str(auth.get("device_id") or ""),
            detail="down",
            client_ip=_client_ip(),
        )
        return jsonify({"error": None, "ok": True})
