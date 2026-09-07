from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from core.config import feedback as cfg
from core.config import feedback_sms as sms_cfg
from core.services.feedback import feedback_db
from core.services.feedback.feedback_email import send_feedback_notification
from core.services.feedback.feedback_sms import send_feedback_sms_notification

logger = logging.getLogger(__name__)


class FeedbackRateLimitError(Exception):
    """同一 IP 在限流窗口内提交次数过多。"""


def create_feedback(
    *,
    content: str,
    contact: str = "",
    page_url: str = "",
    user_agent: str = "",
    client_ip: str = "",
    user_id: str | None = None,
    skip_inbox_notify: bool = False,
) -> Dict[str, Any]:
    text = (content or "").strip()
    if len(text) < cfg.FEEDBACK_CONTENT_MIN_LEN:
        raise ValueError(f"建议内容至少 {cfg.FEEDBACK_CONTENT_MIN_LEN} 个字")
    if len(text) > cfg.FEEDBACK_CONTENT_MAX_LEN:
        raise ValueError(f"建议内容不能超过 {cfg.FEEDBACK_CONTENT_MAX_LEN} 字")

    ip_val = (client_ip or "unknown").strip()[:45] or "unknown"
    limit = max(1, cfg.FEEDBACK_RATE_LIMIT_PER_MINUTE)
    recent = feedback_db.count_recent_by_ip(ip_val, window_minutes=1)
    if recent >= limit:
        raise FeedbackRateLimitError(
            f"提交过于频繁，每个 IP 每分钟最多提交 {limit} 次，请稍后再试"
        )

    contact_val = (contact or "").strip()[: cfg.FEEDBACK_CONTACT_MAX_LEN]
    page_val = (page_url or "").strip()[:500]
    ua_val = (user_agent or "").strip()[:500]

    feedback_id = uuid.uuid4().hex
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    user_id_val = None
    if user_id and isinstance(user_id, str) and len(user_id) == 32 and user_id.isalnum():
        user_id_val = user_id

    feedback_db.insert_feedback(
        {
            "id": feedback_id,
            "content": text,
            "contact": contact_val,
            "page_url": page_val,
            "user_agent": ua_val,
            "client_ip": ip_val,
            "hub_user_id": user_id_val,
            "created_at": now,
            "email_sent": 0,
            "sms_sent": 0,
        }
    )

    # 模式 A：默认仅短信。邮件链路保留但受 FEEDBACK_EMAIL_ENABLED 控制（生产关邮件）。
    email_sent = False
    if cfg.is_feedback_email_enabled():
        try:
            send_feedback_notification(
                feedback_id=feedback_id,
                content=text,
                contact=contact_val,
                page_url=page_val,
                client_ip=ip_val,
                user_id=user_id_val,
            )
            feedback_db.mark_email_sent(feedback_id)
            email_sent = True
        except Exception as exc:
            logger.warning("建议通知邮件发送失败（已入库）: %s", exc)

    sms_sent = False
    if sms_cfg.is_feedback_sms_ready():
        sms_limit = max(1, int(sms_cfg.FEEDBACK_SMS_RATE_LIMIT_PER_MINUTE or 20))
        try:
            recent_sms = feedback_db.count_recent_sms_sent(window_minutes=1)
            if recent_sms >= sms_limit:
                logger.warning(
                    "建议通知短信达到限流（%s/min），已跳过发送 feedback_id=%s",
                    sms_limit,
                    feedback_id[:8],
                )
            else:
                send_feedback_sms_notification(feedback_id=feedback_id, content=text)
                feedback_db.mark_sms_sent(feedback_id)
                sms_sent = True
        except Exception as exc:
            logger.warning("建议通知短信发送失败（已入库）: %s", exc)

    inbox_notified = False
    inbox_recipient_count = 0
    if not skip_inbox_notify:
        try:
            from core.services.feedback.feedback_admin_notify import notify_admins_new_feedback

            inbox_result = notify_admins_new_feedback(
                feedback_id=feedback_id,
                content=text,
                contact=contact_val,
                page_url=page_val,
                client_ip=ip_val,
                hub_user_id=user_id_val,
                created_at=now,
                image_ids=[],
                email_sent=email_sent,
                sms_sent=sms_sent,
            )
            inbox_recipient_count = int(inbox_result.get("sent") or 0)
            inbox_notified = inbox_recipient_count > 0
        except Exception as exc:  # noqa: BLE001
            logger.warning("建议站内信通知失败（已入库）: %s", exc)

    return {
        "id": feedback_id,
        "email_sent": email_sent,
        "email_enabled": cfg.is_feedback_email_enabled(),
        "sms_sent": sms_sent,
        "sms_enabled": sms_cfg.is_feedback_sms_ready(),
        "inbox_notified": inbox_notified,
        "inbox_recipient_count": inbox_recipient_count,
        "_notify_meta": {
            "content": text,
            "contact": contact_val,
            "page_url": page_val,
            "client_ip": ip_val,
            "hub_user_id": user_id_val,
            "created_at": now,
            "email_sent": email_sent,
            "sms_sent": sms_sent,
        },
    }


def create_feedback_with_images(
    *,
    content: str,
    contact: str = "",
    page_url: str = "",
    user_agent: str = "",
    client_ip: str = "",
    user_id: str | None = None,
    image_files: list | None = None,
) -> Dict[str, Any]:
    """投稿 + 可选图片。新方法：先走原 create_feedback，再独立存图，不影响无图路径。"""
    from core.config import feedback_images as img_cfg
    from core.services.feedback.feedback_image_service import save_feedback_images

    files = [f for f in (image_files or []) if f is not None]
    if len(files) > img_cfg.FEEDBACK_IMAGE_MAX_COUNT:
        raise ValueError(f"最多上传 {img_cfg.FEEDBACK_IMAGE_MAX_COUNT} 张图片")

    # 有图路径延后站内信，确保 payload 含 image_ids；无图仍在 create_feedback 内通知
    result = create_feedback(
        content=content,
        contact=contact,
        page_url=page_url,
        user_agent=user_agent,
        client_ip=client_ip,
        user_id=user_id,
        skip_inbox_notify=bool(files),
    )
    images: list = []
    if files:
        try:
            images = save_feedback_images(feedback_id=result["id"], files=files)
        except ValueError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("投稿图片保存失败（建议已入库）: %s", exc)
            raise ValueError("图片保存失败，请稍后重试或去掉图片再提交") from exc

        image_ids = [str(img.get("id") or "") for img in images if img.get("id")]
        meta = result.pop("_notify_meta", None) or {}
        try:
            from core.services.feedback.feedback_admin_notify import notify_admins_new_feedback

            inbox_result = notify_admins_new_feedback(
                feedback_id=result["id"],
                content=str(meta.get("content") or content or ""),
                contact=str(meta.get("contact") or contact or ""),
                page_url=str(meta.get("page_url") or page_url or ""),
                client_ip=str(meta.get("client_ip") or client_ip or ""),
                hub_user_id=meta.get("hub_user_id"),
                created_at=meta.get("created_at"),
                image_ids=image_ids,
                email_sent=bool(result.get("email_sent")),
                sms_sent=bool(result.get("sms_sent")),
            )
            result["inbox_recipient_count"] = int(inbox_result.get("sent") or 0)
            result["inbox_notified"] = result["inbox_recipient_count"] > 0
        except Exception as exc:  # noqa: BLE001
            logger.warning("建议站内信通知失败（已入库含图）: %s", exc)
            result["inbox_notified"] = False
            result["inbox_recipient_count"] = 0
    else:
        result.pop("_notify_meta", None)

    result["images"] = images
    result["image_count"] = len(images)
    result.pop("_notify_meta", None)
    return result
