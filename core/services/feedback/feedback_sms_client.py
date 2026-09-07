"""投稿建议：阿里云普通短信通知客户端（dysmsapi SendSms）。

独立于号码认证 dypnsapi（core.services.auth.sms_aliyun_client），
禁止复用验证码发送逻辑，避免影响登录/注册/绑定/改密短信。
"""

from __future__ import annotations

import json
import logging
from typing import Any

from core.config import feedback_sms as cfg

logger = logging.getLogger(__name__)


def _require_ready() -> None:
    if not cfg.is_feedback_sms_ready():
        raise RuntimeError("投稿短信通知未启用或未配置完整")


def _client():
    try:
        from alibabacloud_dysmsapi20170525.client import Client
        from alibabacloud_tea_openapi import models as open_api_models
    except ImportError as exc:
        raise RuntimeError(
            "服务器缺少短信通知 SDK，请安装 alibabacloud_dysmsapi20170525"
        ) from exc

    return Client(
        open_api_models.Config(
            access_key_id=cfg.ALIYUN_ACCESS_KEY_ID,
            access_key_secret=cfg.ALIYUN_ACCESS_KEY_SECRET,
            endpoint=cfg.FEEDBACK_SMS_ENDPOINT,
        )
    )


def send_feedback_notify_sms(*, phone: str, template_param: dict[str, Any]) -> dict[str, Any]:
    """向管理员发送投稿通知短信（新方法，不触及验证码通道）。"""
    _require_ready()
    from alibabacloud_dysmsapi20170525 import models as dysms_models

    phone = cfg.normalize_notify_phone(phone)
    param_json = json.dumps(template_param or {}, ensure_ascii=False)
    req = dysms_models.SendSmsRequest(
        phone_numbers=phone,
        sign_name=cfg.FEEDBACK_SMS_SIGN_NAME,
        template_code=cfg.FEEDBACK_SMS_TEMPLATE_CODE,
        template_param=param_json,
    )
    try:
        resp = _client().send_sms(req)
    except Exception as exc:
        logger.warning("Feedback SendSms failed: %s", exc)
        raise RuntimeError("投稿通知短信发送失败") from exc

    body = resp.body
    code = (getattr(body, "code", None) or "").upper()
    if code != "OK":
        message = getattr(body, "message", None) or code or "发送失败"
        logger.warning("Feedback SendSms rejected: %s %s", code, message)
        raise RuntimeError(f"投稿通知短信发送失败: {message}")

    return {
        "biz_id": getattr(body, "biz_id", None),
        "request_id": getattr(body, "request_id", None),
        "code": code,
    }
