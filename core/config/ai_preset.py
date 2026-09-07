"""内置 AI（OpenAI 兼容）配置，与测试用例页「内网预设」保持一致。"""

from __future__ import annotations

import os

DEFAULT_BASE_URL = ""
DEFAULT_API_KEY = ""
DEFAULT_MODEL = ""
DEFAULT_TEMPERATURE = 0.1
DEFAULT_IMAGE_MODEL = "dall-e-3"


def get_env_image_model() -> str:
    return (
        os.environ.get("BUILTIN_AI_IMAGE_MODEL", DEFAULT_IMAGE_MODEL).strip()
        or DEFAULT_IMAGE_MODEL
    )


def get_env_builtin_ai_config() -> dict[str, str | float]:
    """环境变量 / 代码默认值（数据库无记录时的回退）。"""
    return {
        "base_url": os.environ.get("BUILTIN_AI_BASE_URL", DEFAULT_BASE_URL).strip(),
        "api_key": os.environ.get("BUILTIN_AI_API_KEY", DEFAULT_API_KEY).strip(),
        "model": os.environ.get("BUILTIN_AI_MODEL", DEFAULT_MODEL).strip(),
        "temperature": float(
            os.environ.get("BUILTIN_AI_TEMPERATURE", str(DEFAULT_TEMPERATURE))
        ),
        "image_model": get_env_image_model(),
    }


def get_builtin_ai_config() -> dict[str, str | float]:
    """优先读 MySQL builtin_ai_config，否则回退环境变量。"""
    try:
        from core.services.ai.builtin_ai_config_db import get_stored_builtin_ai_config

        stored = get_stored_builtin_ai_config()
        if stored:
            return stored
    except Exception:
        pass
    return get_env_builtin_ai_config()
