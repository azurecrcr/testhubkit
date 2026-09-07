"""解析 AI 调用凭据：优先个人配置；无个人配置时使用全站配置（受每日免费额度限制）。"""
from __future__ import annotations

from typing import Any

from core.config.ai_preset import get_builtin_ai_config
from core.services.ai.omniflow_vision_config import (
    get_omniflow_vision_config,
    is_omniflow_vision_configured,
)
from core.services.auth.prompt_visibility_admin import is_site_manager
from core.services.auth.user_ai_config_db import (
    get_user_ai_config,
    is_user_ai_configured,
    is_user_vision_configured,
)
from core.services.auth.user_service import get_user_by_id

USER_AI_CONFIG_REQUIRED = "请先配置 AI"
USER_AI_CONFIG_REQUIRED_CODE = "USER_AI_CONFIG_REQUIRED"
USER_AI_VISION_CONFIG_REQUIRED = "请先在 AI 配置中填写视觉模型"
USER_AI_VISION_CONFIG_REQUIRED_CODE = "USER_AI_VISION_CONFIG_REQUIRED"
SITE_VISION_CONFIG_REQUIRED = "请先在全站 AI 配置中填写视觉模型"
SITE_VISION_CONFIG_REQUIRED_CODE = "SITE_VISION_CONFIG_REQUIRED"
USER_AI_LOGIN_REQUIRED = "请先登录"

USER_AI_TEXT_QUOTA_EXCEEDED_CODE = "USER_AI_TEXT_QUOTA_EXCEEDED"
USER_AI_VISION_QUOTA_EXCEEDED_CODE = "USER_AI_VISION_QUOTA_EXCEEDED"
USER_AI_CURSOR_QUOTA_EXCEEDED_CODE = "USER_AI_CURSOR_QUOTA_EXCEEDED"


class UserAiConfigRequired(ValueError):
    pass


def _parse_temperature(value: Any, default: float = 0.1) -> float:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def can_use_site_builtin_ai(user_id: str | None) -> bool:
    uid = str(user_id or "").strip()
    if not uid:
        return False
    user = get_user_by_id(uid)
    return bool(user and is_site_manager(user))


def resolve_text_ai_credentials(
    data: dict[str, Any],
    user_id: str | None = None,
) -> dict[str, Any]:
    """返回 use_builtin, base_url, api_key, model, temperature；无个人配置时走每日免费额度。"""
    from core.services.ai.user_ai_daily_quota_service import resolve_text_ai_with_daily_quota

    try:
        return resolve_text_ai_with_daily_quota(data, user_id)
    except ValueError as exc:
        raise UserAiConfigRequired(str(exc)) from exc


def is_vision_ai_configured(user_id: str | None) -> bool:
    """有个人视觉配置，或全站已配置视觉模型（与当日额度是否用完无关）。"""
    uid = str(user_id or "").strip()
    if not uid:
        return False
    user_cfg = get_user_ai_config(uid)
    if is_user_vision_configured(user_cfg):
        return True
    return is_omniflow_vision_configured(get_omniflow_vision_config())




def resolve_text_ai_credentials_only(
    data: dict,
    user_id: str | None = None,
) -> dict:
    from core.services.ai.user_ai_daily_quota_service import resolve_text_ai_credentials_only as _resolve

    try:
        return _resolve(data, user_id)
    except ValueError as exc:
        raise UserAiConfigRequired(str(exc)) from exc
def resolve_vision_ai_credentials(user_id: str | None) -> dict[str, Any]:
    from core.services.ai.user_ai_daily_quota_service import resolve_vision_ai_with_daily_quota

    try:
        return resolve_vision_ai_with_daily_quota(user_id)
    except ValueError as exc:
        raise UserAiConfigRequired(str(exc)) from exc




def resolve_vision_ai_credentials_only(user_id: str | None) -> dict[str, Any]:
    from core.services.ai.user_ai_daily_quota_service import resolve_vision_ai_credentials_only as _resolve

    try:
        return _resolve(user_id)
    except ValueError as exc:
        raise UserAiConfigRequired(str(exc)) from exc

def user_ai_config_error_response(exc: Exception) -> tuple[dict[str, Any], int]:
    from core.services.ai.user_ai_daily_quota_service import (
        USER_AI_CURSOR_QUOTA_EXCEEDED,
        USER_AI_TEXT_QUOTA_EXCEEDED,
        USER_AI_VISION_QUOTA_EXCEEDED,
    )

    if isinstance(exc, UserAiConfigRequired):
        msg = str(exc)
        code = USER_AI_CONFIG_REQUIRED_CODE
        if msg == USER_AI_LOGIN_REQUIRED:
            code = "AUTH_REQUIRED"
        elif msg == USER_AI_VISION_CONFIG_REQUIRED:
            code = USER_AI_VISION_CONFIG_REQUIRED_CODE
        elif msg == SITE_VISION_CONFIG_REQUIRED:
            code = SITE_VISION_CONFIG_REQUIRED_CODE
        elif msg == USER_AI_TEXT_QUOTA_EXCEEDED:
            code = USER_AI_TEXT_QUOTA_EXCEEDED_CODE
        elif msg == USER_AI_VISION_QUOTA_EXCEEDED:
            code = USER_AI_VISION_QUOTA_EXCEEDED_CODE
        elif msg == USER_AI_CURSOR_QUOTA_EXCEEDED:
            code = USER_AI_CURSOR_QUOTA_EXCEEDED_CODE
        body: dict = {"error": msg, "code": code}
        if code in (
            USER_AI_TEXT_QUOTA_EXCEEDED_CODE,
            USER_AI_VISION_QUOTA_EXCEEDED_CODE,
            USER_AI_CURSOR_QUOTA_EXCEEDED_CODE,
        ):
            from core.services.ai.user_ai_daily_quota_service import build_quota_meta
            kind = "text"
            if code == USER_AI_VISION_QUOTA_EXCEEDED_CODE:
                kind = "vision"
            elif code == USER_AI_CURSOR_QUOTA_EXCEEDED_CODE:
                kind = "cursor"
            body["ai_quota"] = build_quota_meta(
                kind, used_site_builtin=True, remaining=0
            )
            body["ai_quota"]["exhausted"] = True
        return body, 400
    return {"error": str(exc)}, 400
