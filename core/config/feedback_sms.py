"""投稿建议短信通知配置（独立于邮箱 SMTP、独立于号码认证 dypnsapi）。"""

from __future__ import annotations

import os
import re

_PHONE_RE = re.compile(r"^1[3-9]\d{9}$")


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _env_bool(name: str, default: bool = False) -> bool:
    raw = (os.environ.get(name) or "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


# 开关与收件人
FEEDBACK_SMS_ENABLED = _env_bool("FEEDBACK_SMS_ENABLED", False)
FEEDBACK_NOTIFY_PHONE = _env("FEEDBACK_NOTIFY_PHONE")

# 复用同一套阿里云 AK（仅权限需覆盖 dysmsapi；不改动号码认证配置模块）
ALIYUN_ACCESS_KEY_ID = _env("ALIYUN_ACCESS_KEY_ID")
ALIYUN_ACCESS_KEY_SECRET = _env("ALIYUN_ACCESS_KEY_SECRET")

# 普通短信（dysmsapi），与 SMS_SIGN_NAME / SMS_TEMPLATE_CODE（验证码）分离
FEEDBACK_SMS_SIGN_NAME = _env("FEEDBACK_SMS_SIGN_NAME")
FEEDBACK_SMS_TEMPLATE_CODE = _env("FEEDBACK_SMS_TEMPLATE_CODE")
FEEDBACK_SMS_ENDPOINT = _env("FEEDBACK_SMS_ENDPOINT", "dysmsapi.aliyuncs.com")

# 模板变量名（须与阿里云审核模板一致）
# style=id_summary → {id, summary}；style=code → {code=反馈编号前8位}
FEEDBACK_SMS_TEMPLATE_STYLE = _env("FEEDBACK_SMS_TEMPLATE_STYLE", "id_summary")
FEEDBACK_SMS_PARAM_ID = _env("FEEDBACK_SMS_PARAM_ID", "id")
FEEDBACK_SMS_PARAM_SUMMARY = _env("FEEDBACK_SMS_PARAM_SUMMARY", "summary")
FEEDBACK_SMS_SUMMARY_MAX_LEN = int(_env("FEEDBACK_SMS_SUMMARY_MAX_LEN", "30") or "30")

# 管理员通知短信限流（防刷投稿打爆管理员手机）
FEEDBACK_SMS_RATE_LIMIT_PER_MINUTE = int(_env("FEEDBACK_SMS_RATE_LIMIT_PER_MINUTE", "20") or "20")


def normalize_notify_phone(phone: str) -> str:
    raw = (phone or "").strip().replace(" ", "").replace("-", "")
    if raw.startswith("+86"):
        raw = raw[3:]
    elif raw.startswith("86") and len(raw) == 13:
        raw = raw[2:]
    if not _PHONE_RE.match(raw):
        raise ValueError("管理员通知手机号无效")
    return raw


def is_feedback_sms_ready() -> bool:
    """仅当显式开启且配齐 dysms 通知参数时才发短信。"""
    if not FEEDBACK_SMS_ENABLED:
        return False
    try:
        phone_ok = bool(FEEDBACK_NOTIFY_PHONE and normalize_notify_phone(FEEDBACK_NOTIFY_PHONE))
    except ValueError:
        phone_ok = False
    return bool(
        phone_ok
        and ALIYUN_ACCESS_KEY_ID
        and ALIYUN_ACCESS_KEY_SECRET
        and FEEDBACK_SMS_SIGN_NAME
        and FEEDBACK_SMS_TEMPLATE_CODE
    )
