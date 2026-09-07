"""用户 AI 每日增额授予：开关与单笔上限（独立配置，不影响基础日额常量）。"""
from __future__ import annotations

import os


def ai_quota_bonus_enabled() -> bool:
    raw = str(os.environ.get("AI_QUOTA_BONUS_ENABLED", "true") or "").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def max_bonus_text_per_grant() -> int:
    try:
        return max(0, int(os.environ.get("AI_QUOTA_BONUS_MAX_TEXT_PER_GRANT", "500")))
    except (TypeError, ValueError):
        return 500


def max_bonus_vision_per_grant() -> int:
    try:
        return max(0, int(os.environ.get("AI_QUOTA_BONUS_MAX_VISION_PER_GRANT", "100")))
    except (TypeError, ValueError):
        return 100


def max_bonus_cursor_per_grant() -> int:
    try:
        return max(0, int(os.environ.get("AI_QUOTA_BONUS_MAX_CURSOR_PER_GRANT", "50")))
    except (TypeError, ValueError):
        return 50
