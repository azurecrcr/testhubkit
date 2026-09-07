"""投稿建议短信通知（独立于 feedback_email，失败不影响入库）。"""

from __future__ import annotations

import logging
import re

from core.config import feedback_sms as cfg
from core.services.feedback.feedback_sms_client import send_feedback_notify_sms

logger = logging.getLogger(__name__)

_WS_RE = re.compile(r"\s+")


def _build_summary(content: str) -> str:
    text = _WS_RE.sub(" ", (content or "").strip())
    max_len = max(8, int(cfg.FEEDBACK_SMS_SUMMARY_MAX_LEN or 30))
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"


def _build_template_param(*, feedback_id: str, content: str) -> dict[str, str]:
    """按模板风格组装参数，避免写死某一种阿里云模板。"""
    short_id = (feedback_id or "")[:8]
    style = (cfg.FEEDBACK_SMS_TEMPLATE_STYLE or "id_summary").strip().lower()
    if style in ("code", "code_only"):
        # 兼容仅含 ${code} 的模板（如现有 SMS_336015220）
        key = (cfg.FEEDBACK_SMS_PARAM_ID or "code").strip() or "code"
        if key in ("id", "summary"):
            key = "code"
        return {key: short_id}
    return {
        cfg.FEEDBACK_SMS_PARAM_ID: short_id,
        cfg.FEEDBACK_SMS_PARAM_SUMMARY: _build_summary(content),
    }


def send_feedback_sms_notification(*, feedback_id: str, content: str) -> None:
    """向管理员发送投稿通知短信。未就绪时直接跳过（由调用方决定是否启用）。"""
    if not cfg.is_feedback_sms_ready():
        return

    phone = cfg.normalize_notify_phone(cfg.FEEDBACK_NOTIFY_PHONE)
    template_param = _build_template_param(feedback_id=feedback_id, content=content)
    send_feedback_notify_sms(phone=phone, template_param=template_param)
