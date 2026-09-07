"""从附件资产加载视觉模型输入帧。"""
from __future__ import annotations

from typing import Any

from core.services.visual_attachments.asset_store import read_bytes
from core.services.visual_attachments.attachment_db import get_asset, get_context
from core.services.visual_attachments.limits import MAX_ATTACH_FILES
from core.services.visual_attachments.pdf_parser import pdf_to_images
from core.services.visual_attachments.txt_parser import parse_text_doc

MAX_VISION_FRAMES_PER_REQUEST = 80


def _kind_label(mime: str) -> str:
    if mime == "application/pdf":
        return "PDF"
    if mime == "text/plain":
        return "TXT"
    if mime.startswith("image/"):
        return "图片"
    return "附件"


def resolve_asset_ids_from_context(context_id: str | None, user_id: str | None) -> list[str]:
    if not context_id:
        return []
    ctx = get_context(context_id, user_id)
    if not ctx:
        raise ValueError("附件上下文不存在或已过期")
    ids = ctx.get("asset_ids") or []
    out: list[str] = []
    for raw in ids:
        aid = str(raw or "").strip()
        if aid and aid not in out:
            out.append(aid)
    if not out:
        raise ValueError("附件上下文无有效附件")
    return out


def load_vision_frames_for_assets(
    asset_ids: list[str],
    user_id: str | None,
) -> tuple[list[tuple[str, bytes, str]], list[str]]:
    if len(asset_ids) > MAX_ATTACH_FILES:
        raise ValueError(f"最多 {MAX_ATTACH_FILES} 个附件")
    frames: list[tuple[str, bytes, str]] = []
    txt_inline: list[str] = []
    for idx, aid in enumerate(asset_ids, start=1):
        asset = get_asset(aid, user_id)
        if not asset:
            raise ValueError(f"附件不存在: {aid}")
        mime = str(asset.get("mime_type") or "image/jpeg")
        kind = _kind_label(mime)
        raw = read_bytes(asset["storage_key"])
        if mime == "text/plain":
            txt_result = parse_text_doc(raw)
            if txt_result.get("error"):
                raise ValueError(str(txt_result.get("error")))
            body = str(txt_result.get("text_content") or "").strip()
            summary = str(txt_result.get("summary") or "文本文档")
            txt_inline.append(f"附件 {idx}（TXT）— {summary}\n{body[:3000]}")
            continue
        if mime == "application/pdf":
            pages = pdf_to_images(raw)
            if not pages:
                raise ValueError(f"附件 {idx} PDF 无有效页面")
            if len(frames) + len(pages) > MAX_VISION_FRAMES_PER_REQUEST:
                raise ValueError(
                    f"附件页数/图片过多（>{MAX_VISION_FRAMES_PER_REQUEST} 帧），请减少附件后重试"
                )
            for page_no, (img_bytes, img_mime) in enumerate(pages, start=1):
                label = f"附件 {idx}（PDF 第 {page_no}/{len(pages)} 页）"
                frames.append((label, img_bytes, img_mime))
            continue
        if len(frames) + 1 > MAX_VISION_FRAMES_PER_REQUEST:
            raise ValueError(
                f"附件页数/图片过多（>{MAX_VISION_FRAMES_PER_REQUEST} 帧），请减少附件后重试"
            )
        frames.append((f"附件 {idx}（{kind}）", raw, mime))
    return frames, txt_inline


def load_vision_frames_for_context(
    context_id: str,
    user_id: str | None,
) -> tuple[list[tuple[str, bytes, str]], list[str]]:
    asset_ids = resolve_asset_ids_from_context(context_id, user_id)
    return load_vision_frames_for_assets(asset_ids, user_id)
