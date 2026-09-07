"""用户 AI 每日增额业务（新建模块，不改写基础日额常量）。"""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Any

from core.config.ai_quota_bonus import (
    ai_quota_bonus_enabled,
    max_bonus_cursor_per_grant,
    max_bonus_text_per_grant,
    max_bonus_vision_per_grant,
)
from core.services.ai import user_ai_quota_bonus_db as bonus_db

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def get_active_bonus_totals(user_id: str, day: date | None = None) -> dict[str, int]:
    empty = {"text": 0, "vision": 0, "cursor": 0}
    if not ai_quota_bonus_enabled():
        return empty
    uid = str(user_id or "").strip()
    if not uid:
        return empty
    return bonus_db.sum_active_bonuses(uid, day)


def get_effective_limits(user_id: str, day: date | None = None) -> dict[str, int]:
    """有效日上限 = 写死基础 + 当日有效增额。"""
    from core.services.ai.user_ai_daily_quota_service import (
        DAILY_CURSOR_LIMIT,
        DAILY_TEXT_LIMIT,
        DAILY_VISION_LIMIT,
    )

    bonus = get_active_bonus_totals(user_id, day)
    return {
        "text": DAILY_TEXT_LIMIT + int(bonus.get("text") or 0),
        "vision": DAILY_VISION_LIMIT + int(bonus.get("vision") or 0),
        "cursor": DAILY_CURSOR_LIMIT + int(bonus.get("cursor") or 0),
    }


def get_effective_limit(user_id: str, kind: str, day: date | None = None) -> int:
    limits = get_effective_limits(user_id, day)
    return int(limits.get(kind) or 0)


def get_bonus_until(user_id: str, day: date | None = None) -> str | None:
    if not ai_quota_bonus_enabled():
        return None
    return bonus_db.max_active_bonus_end_date(user_id, day)


def _parse_date(value: Any, field: str) -> date:
    raw = str(value or "").strip()
    if not _DATE_RE.match(raw):
        raise ValueError(f"{field} 格式应为 YYYY-MM-DD")
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError(f"{field} 不是有效日期") from exc


def resolve_user_from_account(account: str) -> dict[str, Any]:
    """按 user_id / 邮箱 / 手机号解析用户（管理录入用，独立方法）。"""
    from core.services.auth.phone_auth_service import get_user_by_phone
    from core.services.auth.user_service import get_user_by_email, get_user_by_id

    raw = str(account or "").strip()
    if not raw:
        raise ValueError("请输入用户账号（手机号 / 邮箱 / user_id）")

    user = get_user_by_id(raw)
    if user:
        return user

    if "@" in raw:
        user = get_user_by_email(raw)
        if user:
            full = get_user_by_id(str(user.get("id") or ""))
            return full or user

    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11 and digits.startswith("1"):
        user = get_user_by_phone(digits)
        if user:
            full = get_user_by_id(str(user.get("id") or ""))
            return full or user

    raise ValueError("未找到对应用户，请确认手机号 / 邮箱 / user_id")


def create_grant(
    *,
    account: str,
    bonus_text: int = 0,
    bonus_vision: int = 0,
    bonus_cursor: int = 0,
    start_date: str | date,
    end_date: str | date,
    note: str = "",
    created_by: str | None = None,
) -> dict[str, Any]:
    if not ai_quota_bonus_enabled():
        raise ValueError("增额功能已关闭（AI_QUOTA_BONUS_ENABLED=false）")

    user = resolve_user_from_account(account)
    uid = str(user.get("id") or "").strip()
    if not uid:
        raise ValueError("用户 ID 无效")

    try:
        bt = max(0, int(bonus_text or 0))
        bv = max(0, int(bonus_vision or 0))
        bc = max(0, int(bonus_cursor or 0))
    except (TypeError, ValueError) as exc:
        raise ValueError("增额次数必须为非负整数") from exc

    if bt + bv + bc <= 0:
        raise ValueError("请至少填写一项增额（文本 / 视觉 / Cursor）")
    if bt > max_bonus_text_per_grant():
        raise ValueError(f"文本增额单笔不得超过 {max_bonus_text_per_grant()}")
    if bv > max_bonus_vision_per_grant():
        raise ValueError(f"视觉增额单笔不得超过 {max_bonus_vision_per_grant()}")
    if bc > max_bonus_cursor_per_grant():
        raise ValueError(f"Cursor 增额单笔不得超过 {max_bonus_cursor_per_grant()}")

    start = start_date if isinstance(start_date, date) else _parse_date(start_date, "start_date")
    end = end_date if isinstance(end_date, date) else _parse_date(end_date, "end_date")
    if end < start:
        raise ValueError("结束日期不能早于开始日期")

    grant = bonus_db.insert_grant(
        {
            "id": uuid.uuid4().hex,
            "user_id": uid,
            "bonus_text": bt,
            "bonus_vision": bv,
            "bonus_cursor": bc,
            "start_date": start,
            "end_date": end,
            "status": "active",
            "note": str(note or "").strip()[:500],
            "created_by": str(created_by or "").strip() or None,
        }
    )
    return grant


def revoke_grant(grant_id: str, revoked_by: str | None = None) -> dict[str, Any]:
    if not ai_quota_bonus_enabled():
        raise ValueError("增额功能已关闭（AI_QUOTA_BONUS_ENABLED=false）")
    gid = str(grant_id or "").strip()
    if not gid:
        raise ValueError("缺少 grant_id")
    existing = bonus_db.get_grant(gid)
    if not existing:
        raise ValueError("授予记录不存在")
    if existing.get("status") == "revoked":
        return existing
    updated = bonus_db.mark_revoked(gid, revoked_by)
    if not updated:
        raise ValueError("撤销失败")
    return updated


def preview_quota_for_user(account: str) -> dict[str, Any]:
    """管理端预览：用户信息 + 今日有效额度 + 授予列表。"""
    from core.services.ai.user_ai_daily_quota_service import get_user_daily_quota_status

    user = resolve_user_from_account(account)
    uid = str(user.get("id") or "").strip()
    quota = get_user_daily_quota_status(uid)
    grants = bonus_db.list_grants_for_user(uid, include_revoked=True)
    return {
        "user": {
            "id": uid,
            "email": user.get("email") or "",
            "phone": user.get("phone") or "",
            "display_name": user.get("display_name") or "",
        },
        "quota": quota,
        "grants": grants,
        "bonus_enabled": ai_quota_bonus_enabled(),
    }


def list_grants_admin(
    *,
    account: str | None = None,
    status: str = "all",
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    uid = None
    if account and str(account).strip():
        user = resolve_user_from_account(str(account).strip())
        uid = str(user.get("id") or "").strip()
    return bonus_db.list_grants_admin(
        user_id=uid,
        status=status,
        page=page,
        page_size=page_size,
    )
