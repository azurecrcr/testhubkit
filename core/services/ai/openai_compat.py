"""OpenAI 兼容 Chat Completions 请求体构建（DashScope / Qwen 等）。"""
from __future__ import annotations

from typing import Any


def build_chat_completions_payload(
    *,
    model: str,
    messages: list[dict[str, Any]],
    stream: bool = False,
    temperature: float | None = None,
    enable_thinking: bool | None = None,
    max_tokens: int | None = None,
) -> dict[str, Any]:
    """构建 chat/completions 请求体。

    enable_thinking: DashScope 兼容接口在流式下开启深度思考，返回 reasoning_content。
    非流式调用勿开启（上游会报错）。默认：流式=True 时自动开启。
    """
    payload: dict[str, Any] = {"model": model, "messages": messages}
    if stream:
        payload["stream"] = True
    if temperature is not None:
        payload["temperature"] = temperature
    if enable_thinking is None:
        enable_thinking = bool(stream)
    if enable_thinking and stream:
        payload["enable_thinking"] = True
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    return payload
