"""手机号身份辅助：规范化、占位邮箱。独立模块，避免改动邮箱 normalize。"""

from __future__ import annotations

import re

from core.config.sms_auth import PHONE_EMAIL_DOMAIN

_PHONE_RE = re.compile(r"^1[3-9]\d{9}$")


def normalize_phone(phone: str) -> str:
    raw = (phone or "").strip().replace(" ", "").replace("-", "")
    if raw.startswith("+86"):
        raw = raw[3:]
    elif raw.startswith("86") and len(raw) == 13:
        raw = raw[2:]
    if not _PHONE_RE.match(raw):
        raise ValueError("请输入有效的中国大陆手机号")
    return raw


def phone_placeholder_email(phone: str) -> str:
    p = normalize_phone(phone)
    return f"p{p}@{PHONE_EMAIL_DOMAIN}"


def is_phone_placeholder_email(email: str | None) -> bool:
    e = (email or "").strip().lower()
    if not e.endswith(f"@{PHONE_EMAIL_DOMAIN}"):
        return False
    local = e[: -(len(PHONE_EMAIL_DOMAIN) + 1)]
    return bool(local.startswith("p") and _PHONE_RE.match(local[1:] or ""))


def mask_phone(phone: str | None) -> str | None:
    p = (phone or "").strip()
    if len(p) != 11:
        return p or None
    return f"{p[:3]}****{p[7:]}"
