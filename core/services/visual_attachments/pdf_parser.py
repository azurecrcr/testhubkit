"""PDF 文档解析（逐页 Vision + 文本合并）。"""
from __future__ import annotations

import io
import time
from typing import Any

from core.services.visual_attachments.design_parser import parse_design_image
from core.services.visual_attachments.vision_client import vision_chat_json

_PDF_PAGE_GAP_SEC = 1.0  # PDF 多页解析间隔，降低视觉 API QPS

API_PDF_PROMPT = """分析接口文档页面，提取 API 端点。
严格输出 JSON：
{
  "summary": "文档摘要",
  "ui_elements": [],
  "flow_nodes": [],
  "flow_edges": [],
  "api_endpoints": [
    {"method": "GET", "path": "/api/x", "summary": "说明", "key_fields": ["id"]}
  ]
}"""


def pdf_to_images(pdf_bytes: bytes) -> list[tuple[bytes, str]]:
    """将 PDF 全部页转为 JPEG 图片（上传多少页就解析多少页）。"""
    pages: list[tuple[bytes, str]] = []
    try:
        import fitz

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        try:
            for i in range(len(doc)):
                page = doc.load_page(i)
                pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
                pages.append((pix.tobytes("jpeg"), "image/jpeg"))
        finally:
            doc.close()
        if pages:
            return pages
    except ImportError:
        pass
    except Exception:
        pass
    try:
        from pdf2image import convert_from_bytes

        imgs = convert_from_bytes(pdf_bytes, first_page=1, dpi=120)
        for img in imgs:
            buf = io.BytesIO()
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            img.save(buf, format="JPEG", quality=85)
            pages.append((buf.getvalue(), "image/jpeg"))
        return pages
    except ImportError:
        pass
    except Exception:
        pass
    raise ValueError("PDF 解析需要 PyMuPDF 或 pdf2image")


def parse_pdf_api_doc(pdf_bytes: bytes, *, vision_cfg: dict[str, Any]) -> dict[str, Any]:
    images = pdf_to_images(pdf_bytes)
    if not images:
        return {"error": "PDF 无有效页面", "ui_elements": [], "flow_nodes": [], "flow_edges": []}

    merged_endpoints: list[dict[str, Any]] = []
    summaries: list[str] = []
    for idx, (img_bytes, mime) in enumerate(images):
        if idx > 0:
            time.sleep(_PDF_PAGE_GAP_SEC)
        prompt = API_PDF_PROMPT if idx == 0 else API_PDF_PROMPT + f"\n（第 {idx + 1} 页）"
        try:
            data = vision_chat_json(prompt, img_bytes, mime_type=mime, cfg=vision_cfg)
        except Exception as exc:
            if idx == 0:
                return {"error": str(exc), "ui_elements": [], "flow_nodes": [], "flow_edges": []}
            continue
        s = str(data.get("summary") or "").strip()
        if s:
            summaries.append(s)
        for ep in data.get("api_endpoints") or []:
            if isinstance(ep, dict) and ep.get("path"):
                merged_endpoints.append(
                    {
                        "method": str(ep.get("method") or "GET").upper(),
                        "path": str(ep.get("path") or ""),
                        "summary": str(ep.get("summary") or ""),
                        "key_fields": ep.get("key_fields") if isinstance(ep.get("key_fields"), list) else [],
                    }
                )
    if not merged_endpoints and images:
        first = parse_design_image(images[0][0], mime_type=images[0][1], vision_cfg=vision_cfg)
        first["asset_type_hint"] = "api_pdf"
        first["page_count"] = len(images)
        return first
    return {
        "summary": "；".join(summaries)[:2000] or "接口文档",
        "ui_elements": [],
        "flow_nodes": [],
        "flow_edges": [],
        "api_endpoints": merged_endpoints,
        "page_count": len(images),
    }
