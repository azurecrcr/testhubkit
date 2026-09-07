"""投稿建议：管理员站内信开关（独立于邮件/短信）。"""
from __future__ import annotations

import os


def is_feedback_inbox_notify_enabled() -> bool:
    raw = str(os.environ.get("FEEDBACK_INBOX_NOTIFY_ENABLED", "true") or "").strip().lower()
    return raw not in {"0", "false", "no", "off"}
