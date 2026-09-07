"""投稿/建议：通知邮箱与可选 SMTP（仅自建邮箱，不用按量计费第三方 API）。"""

from __future__ import annotations

import os

FEEDBACK_NOTIFY_EMAIL = os.environ.get("FEEDBACK_NOTIFY_EMAIL", "")
FEEDBACK_CONTENT_MIN_LEN = int(os.environ.get("FEEDBACK_CONTENT_MIN_LEN", "5"))
FEEDBACK_CONTENT_MAX_LEN = int(os.environ.get("FEEDBACK_CONTENT_MAX_LEN", "2000"))
FEEDBACK_CONTACT_MAX_LEN = int(os.environ.get("FEEDBACK_CONTACT_MAX_LEN", "120"))
FEEDBACK_RATE_LIMIT_PER_MINUTE = int(os.environ.get("FEEDBACK_RATE_LIMIT_PER_MINUTE", "10"))

SMTP_HOST = os.environ.get("FEEDBACK_SMTP_HOST", os.environ.get("SMTP_HOST", ""))
SMTP_PORT = int(os.environ.get("FEEDBACK_SMTP_PORT", os.environ.get("SMTP_PORT", "465")))
SMTP_USER = os.environ.get("FEEDBACK_SMTP_USER", os.environ.get("SMTP_USER", ""))
SMTP_PASSWORD = os.environ.get("FEEDBACK_SMTP_PASSWORD", os.environ.get("SMTP_PASSWORD", ""))
SMTP_USE_SSL = os.environ.get("FEEDBACK_SMTP_USE_SSL", "true").lower() in (
    "1",
    "true",
    "yes",
)
SMTP_FROM = os.environ.get("FEEDBACK_SMTP_FROM", SMTP_USER or "")


def is_feedback_email_enabled() -> bool:
    """仅当显式开启且配齐发件邮箱 SMTP 时才发信（163 授权码等，无 SaaS 按量账单）。"""
    flag = os.environ.get("FEEDBACK_EMAIL_ENABLED", "").lower() in ("1", "true", "yes")
    return bool(flag and SMTP_HOST and SMTP_USER and SMTP_PASSWORD and FEEDBACK_NOTIFY_EMAIL)
