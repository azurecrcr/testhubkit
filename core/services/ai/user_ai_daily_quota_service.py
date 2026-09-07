"""用户每日 AI 免费额度：文本 15 / 视觉 3 / Cursor 1。"""
from __future__ import annotations

from typing import Any

from core.config.ai_preset import get_builtin_ai_config
from core.services.ai.builtin_ai_config_db import get_stored_builtin_cursor_agent_config
from core.services.ai.omniflow_vision_config import (
    get_omniflow_vision_config,
    is_omniflow_vision_configured,
)
from core.services.ai.user_ai_daily_quota_db import get_usage_counts, increment_usage
from core.services.auth.user_ai_config_db import (
    get_user_ai_config,
    is_user_ai_configured,
    is_user_cursor_agent_configured,
    is_user_vision_configured,
)

DAILY_TEXT_LIMIT = 15
DAILY_VISION_LIMIT = 3
DAILY_CURSOR_LIMIT = 1

KIND_LABELS = {
    "text": "文本模型",
    "vision": "视觉模型",
    "cursor": "Cursor Agent",
}

LIMITS = {
    "text": DAILY_TEXT_LIMIT,
    "vision": DAILY_VISION_LIMIT,
    "cursor": DAILY_CURSOR_LIMIT,
}

FILL_GAPS_MIN_FREE_QUOTA = 3
FILL_GAPS_TEXT_QUOTA_INSUFFICIENT = (
    "今日免费额度不足 3 次，用例补充约需 3 次 AI 调用。"
    "请前往 AI 配置填写个人文本模型后再试"
)

USER_AI_TEXT_QUOTA_EXCEEDED = (
    "今日文本模型免费额度已用完，请前往 AI 配置填写个人模型，或明日再试"
)
USER_AI_VISION_QUOTA_EXCEEDED = (
    "今日视觉模型免费额度已用完，请前往 AI 配置填写个人视觉模型，或明日再试"
)
USER_AI_CURSOR_QUOTA_EXCEEDED = (
    "今日免费运行次数已用完，增额或私有化请通过投稿/建议联系，或明日再试"
)
SITE_TEXT_CONFIG_REQUIRED = "全站文本 AI 未配置，请联系管理员"
SITE_VISION_CONFIG_REQUIRED = "全站视觉 AI 未配置，请联系管理员"
SITE_CURSOR_CONFIG_REQUIRED = "全站 Cursor Agent 未配置，请联系管理员"


def _remaining(kind: str, used: int) -> int:
    """仅按写死基础日额计算剩余（无增额场景 / 兼容旧调用）。"""
    return max(0, LIMITS[kind] - used)


def _remaining_against_limit(limit: int, used: int) -> int:
    """按指定上限计算剩余（新方法，供有效上限使用）。"""
    return max(0, int(limit) - int(used))


def _effective_limits_for_user(user_id: str) -> dict[str, int]:
    """有效日上限 = 基础 + 当日有效增额；无增额时等于 LIMITS。"""
    uid = str(user_id or "").strip()
    if not uid:
        return dict(LIMITS)
    try:
        from core.services.ai.user_ai_quota_bonus_service import get_effective_limits

        return get_effective_limits(uid)
    except Exception:
        return dict(LIMITS)


def _bonus_totals_for_user(user_id: str) -> dict[str, int]:
    uid = str(user_id or "").strip()
    empty = {"text": 0, "vision": 0, "cursor": 0}
    if not uid:
        return empty
    try:
        from core.services.ai.user_ai_quota_bonus_service import get_active_bonus_totals

        return get_active_bonus_totals(uid)
    except Exception:
        return empty


def _bonus_until_for_user(user_id: str) -> str | None:
    uid = str(user_id or "").strip()
    if not uid:
        return None
    try:
        from core.services.ai.user_ai_quota_bonus_service import get_bonus_until

        return get_bonus_until(uid)
    except Exception:
        return None


def _remaining_for_user(user_id: str, kind: str, used: int) -> int:
    """用户视角剩余（含当日有效增额）。"""
    limits = _effective_limits_for_user(user_id)
    return _remaining_against_limit(int(limits.get(kind) or LIMITS[kind]), used)


def get_user_daily_quota_status(user_id: str) -> dict[str, Any]:
    uid = str(user_id or "").strip()
    counts = get_usage_counts(uid) if uid else {"text": 0, "vision": 0, "cursor": 0}
    user_cfg = get_user_ai_config(uid) if uid else None
    limits = _effective_limits_for_user(uid) if uid else dict(LIMITS)
    bonus = _bonus_totals_for_user(uid) if uid else {"text": 0, "vision": 0, "cursor": 0}
    bonus_until = _bonus_until_for_user(uid) if uid else None

    def _kind_status(kind: str, has_own: bool) -> dict[str, Any]:
        base = LIMITS[kind]
        eff = int(limits.get(kind) or base)
        b = int(bonus.get(kind) or 0)
        used = int(counts.get(kind) or 0)
        row: dict[str, Any] = {
            "limit": eff,
            "base_limit": base,
            "bonus": b,
            "used": used,
            "remaining": _remaining_against_limit(eff, used),
            "has_own_config": has_own,
        }
        if b > 0 and bonus_until:
            row["bonus_until"] = bonus_until
        return row

    return {
        "text": _kind_status("text", is_user_ai_configured(user_cfg)),
        "vision": _kind_status("vision", is_user_vision_configured(user_cfg)),
        "cursor": _kind_status("cursor", is_user_cursor_agent_configured(user_cfg)),
    }


def build_quota_meta(
    kind: str,
    *,
    used_site_builtin: bool,
    remaining: int,
    limit: int | None = None,
) -> dict[str, Any]:
    """构建扣费元数据。limit 可选：传入有效上限；缺省仍用写死基础（兼容旧调用）。"""
    exhausted = used_site_builtin and remaining <= 0
    eff_limit = int(limit) if limit is not None else LIMITS[kind]
    return {
        "kind": kind,
        "kind_label": KIND_LABELS.get(kind, kind),
        "used_site_builtin": used_site_builtin,
        "remaining": max(0, remaining),
        "limit": eff_limit,
        "exhausted": exhausted,
    }


def pop_quota_meta(creds: dict[str, Any]) -> dict[str, Any] | None:
    meta = creds.pop("_quota_meta", None)
    return meta if isinstance(meta, dict) else None


def attach_quota_to_response(payload: dict[str, Any], creds: dict[str, Any]) -> dict[str, Any]:
    meta = pop_quota_meta(creds)
    if meta:
        payload["ai_quota"] = meta
    return payload


def _assert_site_text_configured() -> dict[str, Any]:
    cfg = get_builtin_ai_config()
    if not str(cfg.get("base_url") or "").strip() or not str(cfg.get("model") or "").strip():
        raise ValueError(SITE_TEXT_CONFIG_REQUIRED)
    return cfg


def _assert_site_vision_configured() -> dict[str, Any]:
    cfg = get_omniflow_vision_config()
    if not is_omniflow_vision_configured(cfg):
        raise ValueError(SITE_VISION_CONFIG_REQUIRED)
    return cfg


def _assert_site_cursor_configured() -> dict[str, str]:
    cfg = get_stored_builtin_cursor_agent_config()
    key = str(cfg.get("cursor_api_key") or "").strip()
    model = str(cfg.get("agent_model") or "").strip()
    if not key or not model:
        raise ValueError(SITE_CURSOR_CONFIG_REQUIRED)
    return {"cursor_api_key": key, "agent_model": model}


def _consume_site_quota(user_id: str, kind: str) -> dict[str, Any]:
    uid = str(user_id or "").strip()
    counts = get_usage_counts(uid)
    eff_limit = int(_effective_limits_for_user(uid).get(kind) or LIMITS[kind])
    if counts[kind] >= eff_limit:
        if kind == "text":
            raise ValueError(USER_AI_TEXT_QUOTA_EXCEEDED)
        if kind == "vision":
            raise ValueError(USER_AI_VISION_QUOTA_EXCEEDED)
        raise ValueError(USER_AI_CURSOR_QUOTA_EXCEEDED)
    new_counts = increment_usage(uid, kind)
    remaining = _remaining_against_limit(eff_limit, new_counts[kind])
    return build_quota_meta(
        kind,
        used_site_builtin=True,
        remaining=remaining,
        limit=eff_limit,
    )




def assert_fill_gaps_text_ai_available(data, user_id):
    """用例补充：未配置个人文本模型时需至少 3 次今日免费额度。"""
    from core.config.user_ai_credentials import UserAiConfigRequired, USER_AI_LOGIN_REQUIRED

    use_builtin = bool((data or {}).get("use_builtin", True))
    if not use_builtin:
        if not str((data or {}).get("base_url") or "").strip():
            raise ValueError("请输入 AI BASE URL")
        if not str((data or {}).get("api_key") or "").strip():
            raise ValueError("请输入 AI API KEY")
        if not str((data or {}).get("model") or "").strip():
            raise ValueError("请输入 AI MODEL")
        return

    uid = str(user_id or "").strip()
    if not uid:
        raise UserAiConfigRequired(USER_AI_LOGIN_REQUIRED)

    user_cfg = get_user_ai_config(uid)
    if is_user_ai_configured(user_cfg):
        return

    _assert_site_text_configured()
    counts = get_usage_counts(uid)
    remaining = _remaining_for_user(uid, "text", counts["text"])
    if remaining < FILL_GAPS_MIN_FREE_QUOTA:
        raise ValueError(FILL_GAPS_TEXT_QUOTA_INSUFFICIENT)


def assert_text_ai_available_for_job(data, user_id):
    """创建 Agent 任务前校验文本 AI 可用（不消耗额度）。"""
    from core.config.user_ai_credentials import UserAiConfigRequired, USER_AI_LOGIN_REQUIRED

    use_builtin = bool((data or {}).get("use_builtin", True))
    if not use_builtin:
        if not str((data or {}).get("base_url") or "").strip():
            raise ValueError("请输入 AI BASE URL")
        if not str((data or {}).get("api_key") or "").strip():
            raise ValueError("请输入 AI API KEY")
        if not str((data or {}).get("model") or "").strip():
            raise ValueError("请输入 AI MODEL")
        return

    uid = str(user_id or "").strip()
    if not uid:
        raise UserAiConfigRequired(USER_AI_LOGIN_REQUIRED)

    user_cfg = get_user_ai_config(uid)
    if is_user_ai_configured(user_cfg):
        return

    _assert_site_text_configured()
    counts = get_usage_counts(uid)
    eff_limit = int(_effective_limits_for_user(uid).get("text") or LIMITS["text"])
    if counts["text"] >= eff_limit:
        raise ValueError(USER_AI_TEXT_QUOTA_EXCEEDED)


def resolve_text_ai_with_daily_quota(
    data: dict[str, Any],
    user_id: str | None,
) -> dict[str, Any]:
    from core.config.user_ai_credentials import UserAiConfigRequired, USER_AI_LOGIN_REQUIRED
    from core.config.user_ai_credentials import _parse_temperature

    use_builtin = bool(data.get("use_builtin"))
    if not use_builtin:
        return {
            "use_builtin": False,
            "base_url": str(data.get("base_url") or "").strip(),
            "api_key": str(data.get("api_key") or "").strip(),
            "model": str(data.get("model") or "").strip(),
            "temperature": _parse_temperature(data.get("temperature"), default=0.1),
        }

    uid = str(user_id or "").strip()
    if not uid:
        raise UserAiConfigRequired(USER_AI_LOGIN_REQUIRED)

    user_cfg = get_user_ai_config(uid)
    if is_user_ai_configured(user_cfg):
        assert user_cfg is not None
        return {
            "use_builtin": False,
            "base_url": str(user_cfg.get("base_url") or "").strip(),
            "api_key": str(user_cfg.get("api_key") or "").strip(),
            "model": str(user_cfg.get("model") or "").strip(),
            "temperature": _parse_temperature(user_cfg.get("temperature")),
        }

    builtin = _assert_site_text_configured()
    quota_meta = _consume_site_quota(uid, "text")
    return {
        "use_builtin": True,
        "base_url": str(builtin.get("base_url") or "").strip(),
        "api_key": str(builtin.get("api_key") or "").strip(),
        "model": str(builtin.get("model") or "").strip(),
        "temperature": _parse_temperature(builtin.get("temperature")),
        "_quota_meta": quota_meta,
    }


def resolve_vision_ai_with_daily_quota(user_id: str | None) -> dict[str, Any]:
    from core.config.user_ai_credentials import UserAiConfigRequired, USER_AI_LOGIN_REQUIRED

    uid = str(user_id or "").strip()
    if not uid:
        raise UserAiConfigRequired(USER_AI_LOGIN_REQUIRED)

    user_cfg = get_user_ai_config(uid)
    if is_user_vision_configured(user_cfg):
        assert user_cfg is not None
        return {
            "base_url": str(user_cfg.get("vision_api_base_url") or "").strip(),
            "api_key": str(user_cfg.get("vision_api_key") or "").strip(),
            "model": str(user_cfg.get("vision_model") or "").strip(),
        }

    site_cfg = _assert_site_vision_configured()
    quota_meta = _consume_site_quota(uid, "vision")
    return {
        "base_url": str(site_cfg.get("vision_api_base_url") or "").strip(),
        "api_key": str(site_cfg.get("vision_api_key") or "").strip(),
        "model": str(site_cfg.get("vision_model") or "").strip(),
        "_quota_meta": quota_meta,
    }




def resolve_vision_ai_credentials_only(user_id: str | None) -> dict[str, Any]:
    """解析视觉模型凭据，不消耗每日免费额度（上传已扣费时使用）。"""
    from core.config.user_ai_credentials import UserAiConfigRequired, USER_AI_LOGIN_REQUIRED

    uid = str(user_id or "").strip()
    if not uid:
        raise UserAiConfigRequired(USER_AI_LOGIN_REQUIRED)

    user_cfg = get_user_ai_config(uid)
    if is_user_vision_configured(user_cfg):
        assert user_cfg is not None
        return {
            "base_url": str(user_cfg.get("vision_api_base_url") or "").strip(),
            "api_key": str(user_cfg.get("vision_api_key") or "").strip(),
            "model": str(user_cfg.get("vision_model") or "").strip(),
        }

    site_cfg = _assert_site_vision_configured()
    return {
        "base_url": str(site_cfg.get("vision_api_base_url") or "").strip(),
        "api_key": str(site_cfg.get("vision_api_key") or "").strip(),
        "model": str(site_cfg.get("vision_model") or "").strip(),
    }



def resolve_text_ai_credentials_only(
    data: dict,
    user_id: str | None = None,
) -> dict:
    """解析文本模型凭据，不消耗每日免费额度（Agent 步骤内已按次扣费时使用）。"""
    from core.config.user_ai_credentials import UserAiConfigRequired, USER_AI_LOGIN_REQUIRED
    from core.config.user_ai_credentials import _parse_temperature

    use_builtin = bool((data or {}).get("use_builtin", True))
    if not use_builtin:
        return {
            "use_builtin": False,
            "base_url": str((data or {}).get("base_url") or "").strip(),
            "api_key": str((data or {}).get("api_key") or "").strip(),
            "model": str((data or {}).get("model") or "").strip(),
            "temperature": _parse_temperature((data or {}).get("temperature"), default=0.1),
        }

    uid = str(user_id or "").strip()
    if not uid:
        raise UserAiConfigRequired(USER_AI_LOGIN_REQUIRED)

    user_cfg = get_user_ai_config(uid)
    if is_user_ai_configured(user_cfg):
        assert user_cfg is not None
        return {
            "use_builtin": False,
            "base_url": str(user_cfg.get("base_url") or "").strip(),
            "api_key": str(user_cfg.get("api_key") or "").strip(),
            "model": str(user_cfg.get("model") or "").strip(),
            "temperature": _parse_temperature(user_cfg.get("temperature")),
        }

    builtin = _assert_site_text_configured()
    return {
        "use_builtin": True,
        "base_url": str(builtin.get("base_url") or "").strip(),
        "api_key": str(builtin.get("api_key") or "").strip(),
        "model": str(builtin.get("model") or "").strip(),
        "temperature": _parse_temperature(builtin.get("temperature")),
    }
def resolve_cursor_agent_with_daily_quota(user_id: str | None) -> dict[str, Any]:
    uid = str(user_id or "").strip()
    if not uid:
        raise ValueError("请先登录")

    user_cfg = get_user_ai_config(uid)
    if is_user_cursor_agent_configured(user_cfg):
        assert user_cfg is not None
        return {
            "cursor_api_key": str(user_cfg.get("cursor_api_key") or "").strip(),
            "agent_model": str(user_cfg.get("agent_model") or "").strip(),
        }

    site_cfg = _assert_site_cursor_configured()
    quota_meta = _consume_site_quota(uid, "cursor")
    return {
        "cursor_api_key": site_cfg["cursor_api_key"],
        "agent_model": site_cfg["agent_model"],
        "_quota_meta": quota_meta,
    }
