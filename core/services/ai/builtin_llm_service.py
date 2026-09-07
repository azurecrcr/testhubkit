"""调用系统内置 OpenAI 兼容接口生成纯文本。"""

from __future__ import annotations

import re

import requests

from core.config.ai_preset import get_builtin_ai_config

AUDIO_SCRIPT_SYSTEM_PROMPT = (
    "你是专业的配音文案撰写助手。根据用户的描述，生成适合朗读的纯文本脚本。"
    "只输出要朗读的正文，不要标题、不要引号包裹、不要 Markdown、不要解释说明。"
    "语言与用户要求一致，默认为简体中文。控制篇幅，适合语音合成朗读。"
    "必须始终输出至少一行可朗读正文；若用户未描述具体素材，可将用户原话整理为朗读稿输出，禁止返回空内容。"
)


def _looks_like_internal_reasoning(text: str) -> bool:
    t = (text or "").strip()
    if not t:
        return True
    if len(t) > 800:
        return True
    markers = ("我们要求", "用户说", "考虑到", "我决定", "作为AI", "按照规则", "为了安全")
    return any(m in t for m in markers)


def _extract_message_text(message: dict) -> str:
    content = str(message.get("content") or "").strip()
    if content:
        return content
    for key in ("reasoning_content", "reasoning"):
        alt = str(message.get(key) or "").strip()
        if alt and not _looks_like_internal_reasoning(alt):
            return alt
    return ""


def _strip_wrappers(text: str) -> str:
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[\w]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t)
    t = t.strip().strip('"').strip("'").strip("「」").strip()
    return t


def complete_builtin_ai(
    user_prompt: str,
    *,
    system_prompt: str | None = None,
    timeout: int = 120,
    max_tokens: int | None = None,
    cfg: dict | None = None,
) -> str:
    prompt = (user_prompt or "").strip()
    if not prompt:
        raise ValueError("请输入提示信息")

    if cfg is None:
        cfg = get_builtin_ai_config()
    base_url = str(cfg["base_url"])
    api_key = str(cfg["api_key"])
    model = str(cfg["model"])
    temperature = float(cfg["temperature"])

    if not base_url:
        raise ValueError("内置 AI 未配置 Base URL")
    if not model:
        raise ValueError("内置 AI 未配置模型")

    api_url = f"{base_url.rstrip('/')}/chat/completions"
    messages: list[dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if max_tokens is not None:
        payload["max_tokens"] = int(max_tokens)
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }

    response = requests.post(api_url, json=payload, headers=headers, timeout=timeout)
    response.raise_for_status()
    data = response.json()

    if "choices" in data and data["choices"]:
        message = data["choices"][0].get("message", {}) or {}
        cleaned = _strip_wrappers(_extract_message_text(message))
        if cleaned:
            return cleaned
    raise ValueError(
        "AI 未返回可朗读的文案，请补充具体的配音内容描述后重试"
    )
