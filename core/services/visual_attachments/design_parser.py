"""设计稿视觉解析。"""
from __future__ import annotations

from typing import Any

from core.services.visual_attachments.vision_client import vision_chat_json

DESIGN_PROMPT = """你是 UI 测试分析专家。分析这张设计稿/截图，提取可测试的 UI 元素。
严格输出 JSON，不要 markdown：
{
  "summary": "页面一句话描述",
  "ui_elements": [
    {
      "element_key": "elem_1",
      "label": "元素可读名称",
      "type": "button|input|link|tab|modal|toast|checkbox|select|image|text|other",
      "text": "可见文案",
      "state_hints": ["default"],
      "region": "header|body|footer|sidebar|modal",
      "confidence": 0.9
    }
  ],
  "flow_nodes": [],
  "flow_edges": []
}
最多 40 个 ui_elements。"""


def _normalize_elements(items: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for idx, el in enumerate(items[:40]):
        if not isinstance(el, dict):
            continue
        out.append(
            {
                "element_key": str(el.get("element_key") or f"elem_{idx + 1}"),
                "label": str(el.get("label") or ""),
                "type": str(el.get("type") or "other"),
                "text": str(el.get("text") or ""),
                "region": str(el.get("region") or ""),
                "confidence": float(el.get("confidence") or 0.8),
            }
        )
    return out


def parse_design_image(
    image_bytes: bytes,
    *,
    mime_type: str,
    vision_cfg: dict[str, Any],
) -> dict[str, Any]:
    data = vision_chat_json(DESIGN_PROMPT, image_bytes, mime_type=mime_type, cfg=vision_cfg)
    elements = _normalize_elements(data.get("ui_elements") or [])
    return {
        "summary": str(data.get("summary") or "设计稿").strip()[:500],
        "ui_elements": elements,
        "flow_nodes": data.get("flow_nodes") or [],
        "flow_edges": data.get("flow_edges") or [],
    }
