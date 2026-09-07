"""OpenAI 兼容视觉模型调用（用户个人配置）。"""
from __future__ import annotations

import base64
import json
import re
import time
from typing import Any

import requests

from core.services.test_cases.test_case_generator_service import _format_upstream_api_error

_VISION_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
_VISION_MAX_ATTEMPTS = 4
_VISION_RETRY_BASE_SEC = 2.0


def _extract_json(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        return {}
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw, re.I)
    if fence:
        raw = fence.group(1).strip()
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        pass
    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        try:
            data = json.loads(raw[start : end + 1])
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            pass
    return {"summary": raw[:500], "ui_elements": [], "flow_nodes": [], "flow_edges": []}


def _normalize_message_content(value: Any) -> str:
    """兼容 OpenAI 兼容接口：content 可能是 string 或 [{type:text}]。"""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, dict):
                if item.get("type") == "text":
                    parts.append(str(item.get("text") or ""))
                elif "text" in item:
                    parts.append(str(item.get("text") or ""))
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(parts).strip()
    return str(value).strip()


def _parse_upstream_response_json(response: requests.Response) -> dict[str, Any]:
    try:
        data = response.json()
    except json.JSONDecodeError as exc:
        snippet = (response.text or "").strip()[:240]
        raise ValueError(
            f"视觉模型上游返回非 JSON（HTTP {response.status_code}）"
            f"{(': ' + snippet) if snippet else ''}"
        ) from exc
    if not isinstance(data, dict):
        raise ValueError("视觉模型上游响应格式异常")
    return data


def _format_vision_http_error(exc: requests.exceptions.HTTPError) -> ValueError:
    detail = _format_upstream_api_error(exc.response)
    status = exc.response.status_code if exc.response is not None else "?"
    msg = f"视觉模型请求失败 ({status}){(': ' + detail) if detail else ''}"
    if status == 429:
        msg += "。视觉 API 限流，请稍后再试"
    elif status in {400, 404}:
        msg += "。请检查视觉模型是否为 VL/vision 系列（如 qwen-vl-max）"
    return ValueError(msg)


def _vision_chat_content_json(cfg: dict[str, Any], content: list[dict[str, Any]]) -> dict[str, Any]:
    base_url = str(cfg.get("base_url") or "").strip().rstrip("/")
    api_key = str(cfg.get("api_key") or "").strip()
    model = str(cfg.get("model") or "").strip()
    if not (base_url and api_key and model):
        raise ValueError("视觉模型未配置")

    api_url = f"{base_url}/chat/completions"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    use_json_format = True

    last_exc: Exception | None = None
    for attempt in range(_VISION_MAX_ATTEMPTS):
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": content}],
            "temperature": 0.1,
        }
        if use_json_format:
            payload["response_format"] = {"type": "json_object"}

        response = requests.post(api_url, json=payload, headers=headers, timeout=(15, 600))
        if response.status_code in _VISION_RETRYABLE_STATUS and attempt < _VISION_MAX_ATTEMPTS - 1:
            time.sleep(_VISION_RETRY_BASE_SEC * (2**attempt))
            continue
        try:
            response.raise_for_status()
        except requests.exceptions.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else 0
            if status == 400 and use_json_format:
                use_json_format = False
                continue
            last_exc = _format_vision_http_error(exc)
            if status in _VISION_RETRYABLE_STATUS and attempt < _VISION_MAX_ATTEMPTS - 1:
                time.sleep(_VISION_RETRY_BASE_SEC * (2**attempt))
                continue
            raise last_exc from exc

        data = _parse_upstream_response_json(response)
        choices = data.get("choices") or []
        if not choices:
            err_msg = str(data.get("error") or data.get("message") or "").strip()
            raise ValueError(err_msg or "视觉模型未返回内容")
        message = choices[0].get("message") or {}
        text = _normalize_message_content(message.get("content"))
        if not text:
            raise ValueError("视觉模型返回内容为空，请确认使用的是视觉模型（如 qwen-vl-max）")
        return _extract_json(text)

    if last_exc is not None:
        raise last_exc
    raise ValueError("视觉模型请求失败")


def vision_chat_json(
    prompt: str,
    image_bytes: bytes,
    *,
    mime_type: str = "image/jpeg",
    cfg: dict[str, Any],
) -> dict[str, Any]:
    b64 = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime_type or 'image/jpeg'};base64,{b64}"
    content = [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": data_url}},
    ]
    return _vision_chat_content_json(cfg, content)


def vision_chat_json_batch(
    prompt: str,
    frames: list[tuple[str, bytes, str]],
    *,
    cfg: dict[str, Any],
) -> dict[str, Any]:
    """一次请求发送多帧图片/PDF 页 + 文本提示词。"""
    if not frames:
        raise ValueError("缺少视觉输入")
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for label, image_bytes, mime_type in frames:
        if label:
            content.append({"type": "text", "text": label})
        b64 = base64.b64encode(image_bytes).decode("ascii")
        mime = mime_type or "image/jpeg"
        content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})
    return _vision_chat_content_json(cfg, content)


def vision_stream_chat_messages(
    cfg: dict[str, Any],
    messages: list[dict[str, Any]],
    *,
    temperature: float | None = 0.1,
    should_cancel=None,
):
    """流式视觉对话：messages 中 user.content 可为多模态数组。"""
    from core.services.test_cases.generation_stream_service import _extract_stream_delta_parts

    base_url = str(cfg.get("base_url") or "").strip().rstrip("/")
    api_key = str(cfg.get("api_key") or "").strip()
    model = str(cfg.get("model") or "").strip()
    if not (base_url and api_key and model):
        raise ValueError("视觉模型未配置")

    api_url = f"{base_url}/chat/completions"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "temperature": 0.1 if temperature is None else float(temperature),
    }

    response = requests.post(api_url, json=payload, headers=headers, stream=True, timeout=(15, 600))
    try:
        if response.status_code >= 400:
            detail = _format_upstream_api_error(response)
            raise requests.exceptions.HTTPError(
                f"视觉模型请求失败 ({response.status_code}){(': ' + detail) if detail else ''}"
            )
        for raw_line in response.iter_lines(decode_unicode=True):
            if should_cancel and should_cancel():
                break
            if not raw_line:
                continue
            line = raw_line.strip()
            if not line.startswith("data:"):
                continue
            data_str = line[5:].strip()
            if data_str == "[DONE]":
                break
            try:
                chunk = json.loads(data_str)
            except json.JSONDecodeError:
                continue
            for stream_kind, content_piece in _extract_stream_delta_parts(chunk):
                if should_cancel and should_cancel():
                    return
                yield stream_kind, content_piece
    finally:
        response.close()
