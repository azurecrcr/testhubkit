"""阿里云号码认证短信客户端（SendSmsVerifyCode / CheckSmsVerifyCode）。"""

from __future__ import annotations

import json
import logging
from typing import Any

from core.config import sms_auth as cfg

logger = logging.getLogger(__name__)


def _require_ready() -> None:
    if not cfg.is_sms_auth_ready():
        raise RuntimeError("手机验证码服务未启用或未配置完整")


def _client():
    try:
        from alibabacloud_dypnsapi20170525.client import Client
        from alibabacloud_tea_openapi import models as open_api_models
    except ImportError as exc:
        raise RuntimeError(
            "服务器缺少短信 SDK，请安装 alibabacloud_dypnsapi20170525"
        ) from exc

    return Client(
        open_api_models.Config(
            access_key_id=cfg.ALIYUN_ACCESS_KEY_ID,
            access_key_secret=cfg.ALIYUN_ACCESS_KEY_SECRET,
            endpoint=cfg.SMS_ENDPOINT,
        )
    )


def send_sms_verify_code(*, phone: str) -> dict[str, Any]:
    """发送短信验证码；验证码由阿里云生成（##code##）。"""
    _require_ready()
    from alibabacloud_dypnsapi20170525 import models as dypns_models

    template_param = json.dumps(
        {"code": "##code##", "min": cfg.SMS_TEMPLATE_MIN},
        ensure_ascii=False,
    )
    req = dypns_models.SendSmsVerifyCodeRequest(
        phone_number=phone,
        sign_name=cfg.SMS_SIGN_NAME,
        template_code=cfg.SMS_TEMPLATE_CODE,
        template_param=template_param,
        code_length=cfg.SMS_CODE_LENGTH,
        code_type=cfg.SMS_CODE_TYPE,
        valid_time=cfg.SMS_VALID_TIME_SEC,
        return_verify_code=False,
        country_code="86",
        interval=cfg.SMS_SEND_INTERVAL_SEC,
    )
    try:
        resp = _client().send_sms_verify_code(req)
    except Exception as exc:
        logger.warning("SendSmsVerifyCode failed: %s", exc)
        raise RuntimeError("短信发送失败，请稍后重试") from exc

    body = resp.body
    code = (getattr(body, "code", None) or "").upper()
    ok = code == "OK" or getattr(body, "success", None) is True
    if not ok:
        message = getattr(body, "message", None) or code or "短信发送失败"
        logger.warning("SendSmsVerifyCode rejected: %s %s", code, message)
        raise RuntimeError("短信发送失败，请稍后重试")

    model = getattr(body, "model", None)
    return {
        "biz_id": getattr(model, "biz_id", None) if model is not None else None,
        "request_id": getattr(body, "request_id", None),
    }


def check_sms_verify_code(*, phone: str, code: str) -> None:
    """核验短信验证码；失败抛 ValueError。"""
    _require_ready()
    from alibabacloud_dypnsapi20170525 import models as dypns_models

    verify_code = (code or "").strip()
    if not verify_code:
        raise ValueError("请输入短信验证码")

    req = dypns_models.CheckSmsVerifyCodeRequest(
        phone_number=phone,
        verify_code=verify_code,
        country_code="86",
    )
    try:
        resp = _client().check_sms_verify_code(req)
    except Exception as exc:
        logger.warning("CheckSmsVerifyCode failed: %s", exc)
        raise ValueError("验证码错误或已过期") from exc

    body = resp.body
    api_code = (getattr(body, "code", None) or "").upper()
    ok = api_code == "OK" or getattr(body, "success", None) is True
    if not ok:
        raise ValueError("验证码错误或已过期")
