"""内置 OpenAI 兼容接口：文生图（images/generations）。"""

from __future__ import annotations

import base64
import os
from typing import Literal

import requests

from core.config.ai_preset import get_builtin_ai_config, get_env_image_model

# 文档工具整页背景：与 max-width 1280 + 常见视口高宽比一致（约 16:9 宽幅）
DOC_TOOLS_PAGE_ASPECT = 1920 / 1080
DEFAULT_IMAGE_MODEL = get_env_image_model()

SizeLiteral = Literal["1024x1024", "1792x1024", "1024x1792", "1536x1024", "1024x1536"]


def pick_landscape_size(target_width: int = 1920, target_height: int = 1080) -> str:
    """按目标宽高比选择 API 支持的最接近横向尺寸。"""
    ratio = target_width / max(target_height, 1)
    candidates: list[tuple[str, float]] = [
        ("1792x1024", 1792 / 1024),
        ("1536x1024", 1536 / 1024),
        ("1920x1080", 1920 / 1080),
        ("1024x1024", 1.0),
    ]
    landscape = [(s, r) for s, r in candidates if r >= 1.0]
    if not landscape:
        return "1792x1024"
    return min(landscape, key=lambda x: abs(x[1] - ratio))[0]


def generate_image_png(
    prompt: str,
    *,
    width: int = 1920,
    height: int = 1080,
    model: str | None = None,
    timeout: int = 180,
) -> bytes:
    """调用 /v1/images/generations，返回 PNG 字节。"""
    text = (prompt or "").strip()
    if not text:
        raise ValueError("图片提示词不能为空")

    cfg = get_builtin_ai_config()
    base_url = str(cfg["base_url"]).rstrip("/")
    api_key = str(cfg.get("api_key") or "empty")
    image_model = (
        model
        or str(cfg.get("image_model") or "")
        or os.environ.get("BUILTIN_AI_IMAGE_MODEL")
        or DEFAULT_IMAGE_MODEL
    ).strip()

    if not base_url:
        raise ValueError("内置 AI 未配置 Base URL")

    size = pick_landscape_size(width, height)
    url = f"{base_url}/images/generations"
    payload: dict = {
        "model": image_model,
        "prompt": text,
        "size": size,
        "n": 1,
        "response_format": "b64_json",
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    response = requests.post(url, json=payload, headers=headers, timeout=timeout)
    if not response.ok:
        raise RuntimeError(f"文生图失败 HTTP {response.status_code}: {response.text[:500]}")

    data = response.json()
    items = data.get("data") or []
    if not items:
        raise RuntimeError(f"文生图无返回数据: {data}")

    b64 = items[0].get("b64_json")
    if b64:
        return base64.b64decode(b64)
    url_field = items[0].get("url")
    if url_field:
        img_resp = requests.get(url_field, timeout=timeout)
        img_resp.raise_for_status()
        return img_resp.content
    raise RuntimeError(f"文生图响应缺少 b64_json/url: {items[0]}")
