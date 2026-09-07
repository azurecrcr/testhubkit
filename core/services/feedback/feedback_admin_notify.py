"""投稿建议 → 管理员站内信（独立模块，不走 L5 / 日报通知）。"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from core.config.feedback_inbox_notify import is_feedback_inbox_notify_enabled
from core.services.case_management.message_db import create_message

logger = logging.getLogger(__name__)

MSG_TYPE_USER_FEEDBACK = "system_user_feedback"
REF_TYPE_USER_FEEDBACK = "system_feedback"


def _fmt_dt(value: Any) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return str(value or "").strip()


def _clip(text: str, limit: int) -> str:
    s = str(text or "").strip()
    if len(s) <= limit:
        return s
    return s[: max(0, limit - 1)] + "…"


def build_feedback_admin_message(
    *,
    feedback_id: str,
    content: str,
    contact: str = "",
    page_url: str = "",
    client_ip: str = "",
    hub_user_id: str | None = None,
    created_at: Any = None,
    image_ids: list[str] | None = None,
    email_sent: bool = False,
    sms_sent: bool = False,
) -> dict[str, Any]:
    """生成站内信 title/body/payload（不写库）。"""
    ids = [str(x).strip() for x in (image_ids or []) if str(x).strip()]
    image_count = len(ids)
    contact_val = str(contact or "").strip() or "未填写"
    page_val = str(page_url or "").strip() or "—"
    summary = _clip(content, 100)

    if image_count > 0:
        title = "新投稿建议 · 含图×%d" % image_count
    else:
        title = "新投稿建议"

    body_lines = [
        "有新的用户投稿建议。",
        "联系：" + contact_val,
        "来源：" + _clip(page_val, 80),
        "摘要：" + summary,
    ]
    if image_count > 0:
        body_lines.append("附图：%d 张" % image_count)
    body = "\n".join(body_lines)[:1000]

    payload = {
        "feedback_id": str(feedback_id or "").strip(),
        "content": str(content or ""),
        "contact": str(contact or "").strip(),
        "page_url": str(page_url or "").strip(),
        "client_ip": str(client_ip or "").strip(),
        "hub_user_id": hub_user_id,
        "created_at": _fmt_dt(created_at),
        "image_count": image_count,
        "image_ids": ids,
        "email_sent": bool(email_sent),
        "sms_sent": bool(sms_sent),
    }
    return {"title": title[:200], "body": body, "payload": payload}


def notify_admins_new_feedback(
    *,
    feedback_id: str,
    content: str,
    contact: str = "",
    page_url: str = "",
    client_ip: str = "",
    hub_user_id: str | None = None,
    created_at: Any = None,
    image_ids: list[str] | None = None,
    email_sent: bool = False,
    sms_sent: bool = False,
) -> dict[str, Any]:
    """
    向全部站点管理员各发一条投稿站内信。
    失败不抛给调用方业务路径；返回 sent / errors 供日志。
    """
    if not is_feedback_inbox_notify_enabled():
        return {"sent": 0, "skipped": True, "reason": "disabled", "errors": []}

    fid = str(feedback_id or "").strip()
    if not fid:
        return {"sent": 0, "skipped": True, "reason": "missing_feedback_id", "errors": []}

    try:
        from core.services.auth.site_daily_stats_db import list_manager_user_ids_for_daily_stats

        manager_ids = list_manager_user_ids_for_daily_stats() or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("投稿站内信：获取管理员列表失败: %s", exc)
        return {"sent": 0, "skipped": True, "reason": "manager_list_failed", "errors": [str(exc)]}

    if not manager_ids:
        return {"sent": 0, "skipped": True, "reason": "no_managers", "errors": []}

    built = build_feedback_admin_message(
        feedback_id=fid,
        content=content,
        contact=contact,
        page_url=page_url,
        client_ip=client_ip,
        hub_user_id=hub_user_id,
        created_at=created_at,
        image_ids=image_ids,
        email_sent=email_sent,
        sms_sent=sms_sent,
    )

    sent = 0
    errors: list[str] = []
    for uid in manager_ids:
        try:
            create_message(
                user_id=uid,
                msg_type=MSG_TYPE_USER_FEEDBACK,
                title=built["title"],
                body=built["body"],
                ref_type=REF_TYPE_USER_FEEDBACK,
                ref_id=fid,
                payload=built["payload"],
            )
            sent += 1
        except Exception as exc:  # noqa: BLE001
            errors.append("%s:%s" % (str(uid)[:8], exc))

    if errors:
        logger.warning(
            "投稿站内信部分失败 feedback_id=%s sent=%s errors=%s",
            fid[:8],
            sent,
            errors[:5],
        )
    return {"sent": sent, "skipped": False, "errors": errors[:10], "title": built["title"]}
