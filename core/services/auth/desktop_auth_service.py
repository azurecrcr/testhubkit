"""桌面设备 Token 与 SSH 公钥登记（不影响网页 Session）。"""
from __future__ import annotations

import hashlib
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Optional

from flask import jsonify, request

from core.services.auth.desktop_db import ensure_desktop_auth_tables
from core.services.auth.rate_limit import normalize_email
from core.services.auth.user_service import (
    get_user_by_id,
    login_with_code,
    login_with_password,
)
from core.services.test_cases.mysql_db import get_connection

TOKEN_PREFIX = "dt_"
TOKEN_TTL_DAYS = int(os.environ.get("HUB_DESKTOP_TOKEN_DAYS", "30"))
SSH_USER = os.environ.get("OMNIFLOW_TUNNEL_USER", "omniflow-tunnel").strip() or "omniflow-tunnel"
AUTHORIZED_KEYS = Path(
    os.environ.get(
        "OMNIFLOW_TUNNEL_AUTHORIZED_KEYS",
        f"/home/{SSH_USER}/.ssh/authorized_keys",
    )
).expanduser()

_KEY_PREFIXES = ("ssh-ed25519 ", "ssh-rsa ", "ecdsa-sha2-nistp256 ", "ecdsa-sha2-nistp384 ")
_FP_RE = re.compile(r"^SHA256:[A-Za-z0-9+/=]+$")


def _now() -> datetime:
    return datetime.now()


def _now_str() -> str:
    return _now().strftime("%Y-%m-%d %H:%M:%S")


def _new_id() -> str:
    return uuid.uuid4().hex


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _client_ip() -> str:
    forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    return forwarded or (request.remote_addr or "")


def _user_agent() -> str:
    return (request.headers.get("User-Agent") or "")[:512]


def write_audit(
    *,
    event: str,
    user_id: str | None = None,
    device_id: str | None = None,
    detail: str = "",
    client_ip: str | None = None,
) -> None:
    ensure_desktop_auth_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO hub_desktop_audit_log
                (user_id, device_id, event, detail, client_ip, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    user_id,
                    device_id,
                    (event or "")[:64],
                    (detail or "")[:512],
                    (client_ip if client_ip is not None else _client_ip())[:45],
                    _now_str(),
                ),
            )
        conn.commit()
    except Exception:
        conn.rollback()
    finally:
        conn.close()


def normalize_public_key(raw: str) -> str:
    text = (raw or "").strip().replace("\r", "").replace("\n", " ")
    if not text:
        raise ValueError("公钥不能为空")
    parts = text.split()
    if len(parts) < 2:
        raise ValueError("公钥格式无效")
    line = f"{parts[0]} {parts[1]}"
    if not any(line.startswith(p) for p in _KEY_PREFIXES):
        raise ValueError("仅支持 ssh-ed25519 / ssh-rsa / ecdsa 公钥")
    if len(parts) >= 3:
        comment = " ".join(parts[2:])[:64]
        return f"{line} {comment}"
    return line


def fingerprint_public_key(normalized: str) -> str:
    body = normalized.split()[1]
    import base64

    try:
        raw = base64.b64decode(body)
    except Exception as exc:
        raise ValueError("公钥解码失败") from exc
    digest = hashlib.sha256(raw).digest()
    import base64 as b64

    return "SHA256:" + b64.b64encode(digest).decode("ascii").rstrip("=")


def _wb_marker(device_id: str) -> str:
    return f"omniflow-wb-{device_id}"


def _sync_authorized_key(device_id: str, public_key: str, *, remove_only: bool = False) -> None:
    """写入/移除 omniflow-tunnel authorized_keys 中的桌面标记行（不碰 UIA 标记）。"""
    marker = _wb_marker(device_id)
    path = AUTHORIZED_KEYS
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    except OSError as exc:
        raise RuntimeError(f"无法读取 {path}: {exc}") from exc

    kept = [ln for ln in lines if marker not in ln]
    if not remove_only:
        kept.append(f"{public_key} #{marker}")
    text = ("\n".join(kept).rstrip("\n") + ("\n" if kept else ""))
    try:
        path.write_text(text, encoding="utf-8")
        try:
            path.chmod(0o600)
        except OSError:
            pass
    except OSError as exc:
        raise RuntimeError(f"无法写入 {path}: {exc}") from exc


def upsert_device(
    *,
    user_id: str,
    device_id: str | None,
    device_name: str,
    public_key: str,
) -> dict[str, Any]:
    ensure_desktop_auth_tables()
    uid = str(user_id or "").strip()
    if not (len(uid) == 32 and uid.isalnum()):
        raise ValueError("无效用户")
    did = (device_id or "").strip() or _new_id()
    if not (len(did) == 32 and did.isalnum()):
        # 客户端可能用 uuid4 hex；也允许已有 32 hex
        if not re.fullmatch(r"[0-9a-fA-F]{32}", did):
            did = _new_id()
    name = (device_name or "").strip()[:128] or "Workbench"
    normalized = normalize_public_key(public_key)
    fp = fingerprint_public_key(normalized)
    now = _now_str()

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, user_id, status FROM hub_desktop_devices WHERE id = %s LIMIT 1",
                (did,),
            )
            row = cur.fetchone()
            if row:
                if str(row.get("user_id") or "") != uid:
                    raise ValueError("设备已绑定其他账号")
                cur.execute(
                    """
                    UPDATE hub_desktop_devices
                    SET device_name=%s, public_key=%s, fingerprint=%s, status='active',
                        updated_at=%s, revoked_at=NULL, last_seen_at=%s
                    WHERE id=%s
                    """,
                    (name, normalized, fp, now, now, did),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO hub_desktop_devices
                    (id, user_id, device_name, public_key, fingerprint, status,
                     created_at, updated_at, revoked_at, last_seen_at)
                    VALUES (%s,%s,%s,%s,%s,'active',%s,%s,NULL,%s)
                    """,
                    (did, uid, name, normalized, fp, now, now, now),
                )
        conn.commit()
    finally:
        conn.close()

    _sync_authorized_key(did, normalized, remove_only=False)
    return {
        "id": did,
        "name": name,
        "fingerprint": fp,
        "ssh_user": SSH_USER,
        "status": "active",
    }


def issue_token(
    *,
    user_id: str,
    device_id: str,
    client_ip: str = "",
    user_agent: str = "",
) -> dict[str, Any]:
    ensure_desktop_auth_tables()
    tid = _new_id()
    raw = TOKEN_PREFIX + secrets.token_urlsafe(32)
    expires = _now() + timedelta(days=TOKEN_TTL_DAYS)
    expires_s = expires.strftime("%Y-%m-%d %H:%M:%S")
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            # 同设备仅保留一个活跃 Token
            cur.execute(
                """
                UPDATE hub_desktop_tokens
                SET revoked_at=%s
                WHERE device_id=%s AND revoked_at IS NULL
                """,
                (now, device_id),
            )
            cur.execute(
                """
                INSERT INTO hub_desktop_tokens
                (id, user_id, device_id, token_hash, expires_at, revoked_at,
                 created_at, last_seen_at, client_ip, user_agent)
                VALUES (%s,%s,%s,%s,%s,NULL,%s,%s,%s,%s)
                """,
                (
                    tid,
                    user_id,
                    device_id,
                    _hash_token(raw),
                    expires_s,
                    now,
                    now,
                    (client_ip or "")[:45],
                    (user_agent or "")[:512],
                ),
            )
        conn.commit()
    finally:
        conn.close()
    return {"token": raw, "expires_at": expires.isoformat(sep="T"), "token_id": tid}


def verify_bearer_token(raw: str) -> dict[str, Any]:
    ensure_desktop_auth_tables()
    token = (raw or "").strip()
    if not token.startswith(TOKEN_PREFIX):
        raise PermissionError("TOKEN_INVALID")
    th = _hash_token(token)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT t.id, t.user_id, t.device_id, t.expires_at, t.revoked_at,
                       d.status AS device_status, d.device_name, d.fingerprint
                FROM hub_desktop_tokens t
                LEFT JOIN hub_desktop_devices d ON d.id = t.device_id
                WHERE t.token_hash = %s
                LIMIT 1
                """,
                (th,),
            )
            row = cur.fetchone()
        if not row:
            raise PermissionError("TOKEN_INVALID")
        if row.get("revoked_at"):
            raise PermissionError("TOKEN_REVOKED")
        exp = row.get("expires_at")
        if isinstance(exp, datetime):
            if exp < _now():
                raise PermissionError("TOKEN_EXPIRED")
        else:
            try:
                if datetime.strptime(str(exp), "%Y-%m-%d %H:%M:%S") < _now():
                    raise PermissionError("TOKEN_EXPIRED")
            except ValueError:
                raise PermissionError("TOKEN_EXPIRED")
        if str(row.get("device_status") or "") != "active":
            raise PermissionError("DEVICE_REVOKED")
        # touch
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE hub_desktop_tokens SET last_seen_at=%s WHERE id=%s",
                (_now_str(), row["id"]),
            )
            cur.execute(
                "UPDATE hub_desktop_devices SET last_seen_at=%s WHERE id=%s",
                (_now_str(), row["device_id"]),
            )
        conn.commit()
        return dict(row)
    finally:
        conn.close()


def revoke_token_raw(raw: str) -> None:
    ensure_desktop_auth_tables()
    th = _hash_token((raw or "").strip())
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE hub_desktop_tokens SET revoked_at=%s
                WHERE token_hash=%s AND revoked_at IS NULL
                """,
                (_now_str(), th),
            )
        conn.commit()
    finally:
        conn.close()


def refresh_token(raw: str) -> dict[str, Any]:
    info = verify_bearer_token(raw)
    revoke_token_raw(raw)
    return issue_token(
        user_id=str(info["user_id"]),
        device_id=str(info["device_id"]),
        client_ip=_client_ip(),
        user_agent=_user_agent(),
    )


def revoke_device(*, user_id: str, device_id: str) -> None:
    ensure_desktop_auth_tables()
    uid = str(user_id).strip()
    did = str(device_id).strip()
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM hub_desktop_devices
                WHERE id=%s AND user_id=%s LIMIT 1
                """,
                (did, uid),
            )
            if not cur.fetchone():
                raise ValueError("设备不存在")
            cur.execute(
                """
                UPDATE hub_desktop_devices
                SET status='revoked', revoked_at=%s, updated_at=%s
                WHERE id=%s
                """,
                (now, now, did),
            )
            cur.execute(
                """
                UPDATE hub_desktop_tokens SET revoked_at=%s
                WHERE device_id=%s AND revoked_at IS NULL
                """,
                (now, did),
            )
        conn.commit()
    finally:
        conn.close()
    try:
        _sync_authorized_key(did, "", remove_only=True)
    except RuntimeError:
        pass


def list_devices_for_user(user_id: str) -> list[dict[str, Any]]:
    ensure_desktop_auth_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, device_name, fingerprint, status, created_at,
                       updated_at, revoked_at, last_seen_at
                FROM hub_desktop_devices
                WHERE user_id=%s
                ORDER BY created_at DESC
                """,
                (user_id,),
            )
            rows = cur.fetchall() or []
        out = []
        for row in rows:
            item = dict(row)
            for k in ("created_at", "updated_at", "revoked_at", "last_seen_at"):
                v = item.get(k)
                if isinstance(v, datetime):
                    item[k] = v.isoformat(sep="T")
                elif v is not None:
                    item[k] = str(v)
            out.append(item)
        return out
    finally:
        conn.close()


def desktop_login(
    *,
    email: str,
    password: str = "",
    code: str = "",
    device_id: str = "",
    device_name: str = "",
    public_key: str = "",
    method: str = "password",
) -> dict[str, Any]:
    ensure_desktop_auth_tables()
    email_n = normalize_email(email)
    try:
        if method == "code":
            user = login_with_code(email=email_n, code=code)
        else:
            user = login_with_password(email=email_n, password=password)
    except ValueError:
        write_audit(event="login_fail", detail=email_n[:64])
        raise

    if not public_key.strip():
        write_audit(event="login_fail", user_id=user["id"], detail="missing_public_key")
        raise ValueError("请提供本机 SSH 公钥")

    device = upsert_device(
        user_id=user["id"],
        device_id=device_id or None,
        device_name=device_name,
        public_key=public_key,
    )
    token = issue_token(
        user_id=user["id"],
        device_id=device["id"],
        client_ip=_client_ip(),
        user_agent=_user_agent(),
    )
    write_audit(
        event="login_ok",
        user_id=user["id"],
        device_id=device["id"],
        detail=method,
    )
    return {
        "error": None,
        "token": token["token"],
        "expires_at": token["expires_at"],
        "user": get_user_by_id(user["id"]) or user,
        "device": device,
    }


def require_desktop_token(fn: Callable):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization") or ""
        raw = ""
        if auth.lower().startswith("bearer "):
            raw = auth[7:].strip()
        if not raw:
            return jsonify({"error": "请先登录桌面客户端", "code": "DESKTOP_AUTH_REQUIRED"}), 401
        try:
            info = verify_bearer_token(raw)
        except PermissionError as exc:
            code = str(exc) or "TOKEN_INVALID"
            return jsonify({"error": "登录已失效，请重新登录", "code": code}), 401
        request.desktop_auth = info  # type: ignore[attr-defined]
        request.desktop_token_raw = raw  # type: ignore[attr-defined]
        try:
            from core.services.auth.phone_bind_gate import phone_bind_gate_block_for_user_id

            uid = str((info or {}).get("user_id") or "")
            if uid:
                blocked = phone_bind_gate_block_for_user_id(uid)
                if blocked is not None:
                    return blocked
        except Exception:
            pass
        return fn(*args, **kwargs)

    return wrapper


def get_request_desktop_auth() -> Optional[dict[str, Any]]:
    return getattr(request, "desktop_auth", None)
