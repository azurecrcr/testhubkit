"""开源版视觉模型配置（不依赖 OmniFlow 私有仓库）。"""
from __future__ import annotations
import os
from typing import Any
_DEFAULT_VISION_MODEL = "gpt-4o"

def get_env_omniflow_vision_config() -> dict[str, Any]:
    base = os.environ.get("VISION_API_BASE_URL", "").strip() or os.environ.get("BUILTIN_AI_BASE_URL", "").strip()
    key = os.environ.get("VISION_API_KEY", "").strip() or os.environ.get("BUILTIN_AI_API_KEY", "").strip()
    model = os.environ.get("VISION_MODEL", _DEFAULT_VISION_MODEL).strip() or _DEFAULT_VISION_MODEL
    return {"vision_api_base_url": base, "vision_api_key": key, "vision_model": model, "source": "env"}

def get_omniflow_vision_config() -> dict[str, Any]:
    try:
        from core.services.ai.builtin_ai_config_db import get_stored_omniflow_vision_config
        stored = get_stored_omniflow_vision_config()
        if stored:
            return stored
    except Exception:
        pass
    return get_env_omniflow_vision_config()

def is_omniflow_vision_configured(cfg: dict[str, Any] | None) -> bool:
    return bool(cfg and (cfg.get("vision_api_base_url") or "").strip() and (cfg.get("vision_api_key") or "").strip())

def with_auto_locator_vision_fallback(cfg: dict[str, Any]) -> dict[str, Any]:
    return dict(cfg)

def sync_omniflow_vision_env(payload: dict[str, Any]) -> None:
    return
