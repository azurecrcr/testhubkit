"""纯文本文档解析。"""
from __future__ import annotations

from typing import Any

MAX_TXT_CONTENT_CHARS = 12_000


def decode_text_bytes(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "gb18030", "gbk", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def parse_text_doc(raw: bytes) -> dict[str, Any]:
    text = decode_text_bytes(raw).replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return {
            "error": "文本文件为空",
            "summary": "",
            "text_content": "",
            "ui_elements": [],
            "flow_nodes": [],
            "flow_edges": [],
        }
    first_line = text.split("\n", 1)[0].strip()[:120] or "文本文档"
    content = text[:MAX_TXT_CONTENT_CHARS]
    truncated = len(text) > MAX_TXT_CONTENT_CHARS
    summary = first_line if len(text) <= 80 else f"{first_line}（约 {len(text)} 字）"
    if truncated:
        summary += f"，已截取前 {MAX_TXT_CONTENT_CHARS} 字参与生成"
    return {
        "summary": summary,
        "text_content": content,
        "ui_elements": [],
        "flow_nodes": [],
        "flow_edges": [],
    }
