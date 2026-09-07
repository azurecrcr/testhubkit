import base64
import json

import requests


def _format_upstream_api_error(response: requests.Response | None) -> str:
    if response is None:
        return ""
    try:
        data = response.json()
        err = data.get("error")
        if isinstance(err, dict):
            msg = err.get("message") or err.get("code")
            if msg:
                return str(msg)
        if data.get("message"):
            return str(data["message"])
    except Exception:
        pass
    text = (response.text or "").strip()
    return text[:400] if text else ""


def generate_test_cases(
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    images_base64: list[str] | None = None,
    temperature: float | None = None,
):
    images_base64 = images_base64 or []
    images = []
    for img_b64 in images_base64:
        if img_b64:
            if "," in img_b64:
                img_b64 = img_b64.split(",", 1)[1]
            images.append(img_b64)

    api_url = f"{base_url.rstrip('/')}/chat/completions"
    full_prompt = prompt

    if images:
        content = [{"type": "text", "text": full_prompt}]
        for img in images:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img}"},
                }
            )
        messages = [{"role": "user", "content": content}]
    else:
        messages = [{"role": "user", "content": full_prompt}]

    payload: dict = {"model": model, "messages": messages}
    if temperature is not None:
        payload["temperature"] = temperature
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}

    try:
        response = requests.post(
            api_url, json=payload, headers=headers, timeout=(10, 180)
        )
        response.raise_for_status()
    except requests.exceptions.HTTPError as exc:
        detail = _format_upstream_api_error(exc.response)
        status = exc.response.status_code if exc.response is not None else "?"
        msg = f"API请求失败 ({status})"
        if detail:
            msg += f": {detail}"
        raise requests.exceptions.HTTPError(
            msg, request=exc.request, response=exc.response
        ) from exc
    except requests.exceptions.ConnectTimeout:
        raise ConnectionError(
            f"连接 AI 服务超时，请确认 Base URL 可从当前服务器访问：{base_url}"
        )
    except requests.exceptions.ConnectionError as exc:
        raise ConnectionError(
            f"无法连接 AI 服务（{base_url}）。云服务器通常无法访问 192.168.x 内网地址，"
            f"请改用公网可访问的 OpenAI 兼容地址，或在内网预设模式下由浏览器直连模型。"
        ) from exc
    response_data = response.json()

    if "choices" in response_data and response_data["choices"]:
        return response_data["choices"][0]["message"]["content"]
    return "无法获取AI回复"




def generate_chat_completions_messages(
    base_url: str,
    api_key: str,
    model: str,
    messages: list,
    temperature: float | None = None,
):
    from core.services.ai.openai_compat import build_chat_completions_payload

    api_url = f"{base_url.rstrip('/')}/chat/completions"
    payload = build_chat_completions_payload(
        model=model,
        messages=messages,
        stream=False,
        temperature=temperature,
        enable_thinking=False,
    )
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    try:
        response = requests.post(
            api_url, json=payload, headers=headers, timeout=(10, 180)
        )
        response.raise_for_status()
    except requests.exceptions.HTTPError as exc:
        detail = _format_upstream_api_error(exc.response)
        status = exc.response.status_code if exc.response is not None else "?"
        msg = f"API请求失败 ({status})"
        if detail:
            msg += f": {detail}"
        raise requests.exceptions.HTTPError(
            msg, request=exc.request, response=exc.response
        ) from exc
    except requests.exceptions.ConnectTimeout:
        raise ConnectionError(
            f"连接 AI 服务超时，请确认 Base URL 可从当前服务器访问：{base_url}"
        )
    except requests.exceptions.ConnectionError:
        raise ConnectionError(
            f"无法连接 AI 服务（{base_url}）。云服务器通常无法访问 192.168.x 内网地址，"
            f"请改用公网可访问的 OpenAI 兼容地址，或在内网预设模式下由浏览器直连模型。"
        )
    response_data = response.json()
    if "choices" in response_data and response_data["choices"]:
        return response_data["choices"][0]["message"]["content"]
    return "无法获取AI回复"


def append_form_images(files, max_images: int = 4):
    images = []
    for index in range(1, max_images + 1):
        key = f"image_{index}"
        if key in files:
            file = files[key]
            if file:
                img_data = file.read()
                img_base64 = base64.b64encode(img_data).decode("utf-8")
                images.append(img_base64)
    return images
