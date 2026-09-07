"""对桌面客户端可见载荷脱敏：隐藏供应商与内部实现痕迹。"""

from __future__ import annotations

import re
from typing import Any

_REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"CURSOR_API_KEY", re.I), "AGENT_API_KEY"),
    (re.compile(r"\bcursor\b", re.I), "agent"),
    (re.compile(r"\.cursor\b", re.I), ".agent"),
    (re.compile(r"mcp\s+login", re.I), "工具登录"),
    (re.compile(r"mcp\s+enable", re.I), "工具启用"),
    (re.compile(r"/root/\.cursor", re.I), "/root/.agent"),
    (re.compile(r"Access is only allowed at[^\n]*", re.I), "桌面浏览器通道拒绝访问"),
]

_DROP_KEYS = {
    "cursor_api_key",
    "api_key",
    "authorization",
    "CURSOR_API_KEY",
}


def scrub_text(text: str) -> str:
    out = str(text or "")
    if not out:
        return out
    for pat, repl in _REPLACEMENTS:
        out = pat.sub(repl, out)
    return out


def scrub_payload(payload: Any) -> Any:
    if isinstance(payload, dict):
        cleaned = {}
        for key, value in payload.items():
            if str(key) in _DROP_KEYS or str(key).lower() in {
                "cursor_api_key",
                "api_key",
                "authorization",
            }:
                continue
            cleaned[str(key)] = scrub_payload(value)
        return cleaned
    if isinstance(payload, list):
        return [scrub_payload(v) for v in payload]
    if isinstance(payload, str):
        return scrub_text(payload)
    return payload
