"""批量附件解析：一次视觉 API 调用处理全部附件 + 用户提示词。"""
from __future__ import annotations

from typing import Any

from core.config.user_ai_credentials import (
    resolve_vision_ai_credentials,
    resolve_vision_ai_credentials_only,
)
from core.services.visual_attachments.asset_store import read_bytes
from core.services.visual_attachments.attachment_db import get_asset, update_asset_parse
from core.services.visual_attachments.design_parser import _normalize_elements
from core.services.visual_attachments.limits import MAX_ATTACH_FILES
from core.services.visual_attachments.pdf_parser import pdf_to_images
from core.services.visual_attachments.txt_parser import parse_text_doc
from core.services.visual_attachments.vision_client import vision_chat_json_batch

# 单次请求最多送入视觉模型的图片帧数（含 PDF 各页）
MAX_VISION_FRAMES_PER_REQUEST = 80

_BATCH_PARSE_PROMPT = """你是测试用例分析专家。用户一次上传了多个附件，并给出编辑用例的意图。
请综合分析所有附件（图片、PDF 各页、文本文档摘要），提取与测试设计相关的信息。

附件按顺序编号 1..N；PDF 每一页以独立图片形式附在对应附件说明之后。
请严格输出 JSON（不要 markdown 代码块）：
{
  "overall_summary": "对所有附件的综合摘要",
  "attachments": [
    {
      "index": 1,
      "summary": "该附件摘要",
      "asset_type": "design|api_pdf|text_doc|other",
      "text_content": "若为文本文档则填正文摘要，否则空字符串",
      "ui_elements": [
        {
          "element_key": "elem_1",
          "label": "名称",
          "type": "button|input|link|tab|modal|toast|checkbox|select|image|text|other",
          "text": "可见文案",
          "region": "header|body|footer|sidebar|modal",
          "confidence": 0.9
        }
      ],
      "api_endpoints": [
        {"method": "GET", "path": "/api/x", "summary": "说明", "key_fields": ["id"]}
      ],
      "flow_nodes": [],
      "flow_edges": []
    }
  ]
}
每个附件的 ui_elements 合计最多 40 个；api_endpoints 合计最多 40 个。"""




def _asset_vision_quota_charged(asset: dict[str, Any]) -> bool:
    result = asset.get("parse_result") or {}
    return bool(result.get("_vision_quota_charged"))


def _asset_kind_label(mime: str) -> str:
    if mime == "application/pdf":
        return "PDF"
    if mime == "text/plain":
        return "TXT"
    if mime.startswith("image/"):
        return "图片"
    return "附件"


def _classify_asset_type(mime: str, hinted: str = "") -> str:
    if hinted in ("design", "api_pdf", "text_doc", "other"):
        return hinted
    if mime == "application/pdf":
        return "api_pdf"
    if mime == "text/plain":
        return "text_doc"
    if mime.startswith("image/"):
        return "design"
    return "other"


def _normalize_attachment_result(raw: dict[str, Any]) -> dict[str, Any]:
    elements = _normalize_elements(raw.get("ui_elements") or [])
    endpoints: list[dict[str, Any]] = []
    for ep in raw.get("api_endpoints") or []:
        if not isinstance(ep, dict) or not ep.get("path"):
            continue
        endpoints.append(
            {
                "method": str(ep.get("method") or "GET").upper(),
                "path": str(ep.get("path") or ""),
                "summary": str(ep.get("summary") or ""),
                "key_fields": ep.get("key_fields") if isinstance(ep.get("key_fields"), list) else [],
            }
        )
    return {
        "summary": str(raw.get("summary") or "").strip()[:2000],
        "text_content": str(raw.get("text_content") or "").strip(),
        "ui_elements": elements,
        "flow_nodes": raw.get("flow_nodes") or [],
        "flow_edges": raw.get("flow_edges") or [],
        "api_endpoints": endpoints,
    }


def _build_batch_prompt(
    *,
    asset_specs: list[dict[str, Any]],
    user_prompt: str,
    txt_inline: list[str],
) -> str:
    lines = [_BATCH_PARSE_PROMPT, "", f"共 {len(asset_specs)} 个附件："]
    for spec in asset_specs:
        idx = spec["index"]
        kind = spec["kind_label"]
        pages = spec.get("page_count")
        if pages and pages > 1:
            lines.append(f"- 附件 {idx}：{kind}（共 {pages} 页，紧随其后 {pages} 张图片）")
        else:
            lines.append(f"- 附件 {idx}：{kind}")
    if txt_inline:
        lines.append("\n【文本文档内容（已本地读取，无需视觉识别）】")
        lines.extend(txt_inline)
    up = (user_prompt or "").strip()
    if up:
        lines.append(f"\n【用户编辑意图】\n{up}")
    lines.append(
        "\n【输出要求】仅返回一个 JSON 对象，不要 markdown、不要解释文字；"
        "必须包含 overall_summary 与 attachments 数组，attachments 长度等于附件数量。"
    )
    return "\n".join(lines)


def _fallback_results_from_overall(
    data: dict[str, Any],
    asset_specs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    overall = str(data.get("overall_summary") or data.get("summary") or "").strip()
    base = _normalize_attachment_result(
        {
            "summary": overall or "附件解析完成",
            "ui_elements": data.get("ui_elements") or [],
            "api_endpoints": data.get("api_endpoints") or [],
            "flow_nodes": data.get("flow_nodes") or [],
            "flow_edges": data.get("flow_edges") or [],
        }
    )
    return [dict(base) for _ in asset_specs]


def parse_attachments_batch_and_store(
    asset_ids: list[str],
    user_id: str | None,
    *,
    user_prompt: str = "",
) -> dict[str, Any] | None:
    """一次视觉调用解析全部附件，并写回各 asset 的 parse_result。"""
    if len(asset_ids) > MAX_ATTACH_FILES:
        raise ValueError(f"最多 {MAX_ATTACH_FILES} 个附件")

    assets: list[dict[str, Any]] = []
    for aid in asset_ids:
        asset = get_asset(aid, user_id)
        if not asset:
            raise ValueError(f"附件不存在: {aid}")
        assets.append(asset)

    pending = [a for a in assets if a.get("parse_status") != "done"]
    if not pending:
        return None

    for asset in pending:
        update_asset_parse(asset["id"], parse_status="processing")

    asset_specs: list[dict[str, Any]] = []
    vision_frames: list[tuple[str, bytes, str]] = []
    txt_inline: list[str] = []
    txt_local_results: dict[str, dict[str, Any]] = {}

    try:
        for idx, asset in enumerate(assets, start=1):
            mime = str(asset.get("mime_type") or "image/jpeg")
            kind = _asset_kind_label(mime)
            raw = read_bytes(asset["storage_key"])
            spec: dict[str, Any] = {"index": idx, "asset_id": asset["id"], "kind_label": kind, "mime": mime}

            if mime == "text/plain":
                txt_result = parse_text_doc(raw)
                if txt_result.get("error"):
                    raise ValueError(str(txt_result.get("error")))
                txt_local_results[asset["id"]] = txt_result
                body = str(txt_result.get("text_content") or "").strip()
                summary = str(txt_result.get("summary") or "文本文档")
                txt_inline.append(f"附件 {idx}（TXT）— {summary}\n{body[:3000]}")
                spec["page_count"] = 0
                asset_specs.append(spec)
                continue

            if mime == "application/pdf":
                pages = pdf_to_images(raw)
                if not pages:
                    raise ValueError(f"附件 {idx} PDF 无有效页面")
                if len(vision_frames) + len(pages) > MAX_VISION_FRAMES_PER_REQUEST:
                    raise ValueError(
                        f"附件页数/图片过多（>{MAX_VISION_FRAMES_PER_REQUEST} 帧），"
                        "请减少附件数量或拆分 PDF 后重试"
                    )
                spec["page_count"] = len(pages)
                for page_no, (img_bytes, img_mime) in enumerate(pages, start=1):
                    label = f"附件 {idx}（PDF 第 {page_no}/{len(pages)} 页）"
                    vision_frames.append((label, img_bytes, img_mime))
                asset_specs.append(spec)
                continue

            if len(vision_frames) + 1 > MAX_VISION_FRAMES_PER_REQUEST:
                raise ValueError(
                    f"附件页数/图片过多（>{MAX_VISION_FRAMES_PER_REQUEST} 帧），请减少附件数量后重试"
                )
            spec["page_count"] = 1
            vision_frames.append((f"附件 {idx}（{kind}）", raw, mime))
            asset_specs.append(spec)

        # 仅 TXT：不调视觉 API，但仍扣视觉免费额度
        if not vision_frames:
            vision_quota_meta = None
            need_charge = [a for a in pending if not _asset_vision_quota_charged(a)]
            if need_charge:
                vision_cfg_txt = resolve_vision_ai_credentials(user_id)
                from core.services.ai.user_ai_daily_quota_service import pop_quota_meta
                vision_quota_meta = pop_quota_meta(vision_cfg_txt)
            for asset in pending:
                aid = asset["id"]
                if aid in txt_local_results:
                    update_asset_parse(
                        aid,
                        parse_status="done",
                        parse_result=txt_local_results[aid],
                        asset_type="text_doc",
                    )
                elif asset.get("parse_status") == "processing":
                    update_asset_parse(aid, parse_status="done", parse_result={"summary": "空附件"})
            return vision_quota_meta

        need_charge = [a for a in pending if not _asset_vision_quota_charged(a)]
        from core.services.ai.user_ai_daily_quota_service import pop_quota_meta
        if need_charge:
            vision_cfg = resolve_vision_ai_credentials(user_id)
            vision_quota_meta = pop_quota_meta(vision_cfg)
        else:
            vision_cfg = resolve_vision_ai_credentials_only(user_id)
            vision_quota_meta = None
        prompt = _build_batch_prompt(
            asset_specs=asset_specs,
            user_prompt=user_prompt,
            txt_inline=txt_inline,
        )
        data = vision_chat_json_batch(prompt, vision_frames, cfg=vision_cfg)

        by_index: dict[int, dict[str, Any]] = {}
        for item in data.get("attachments") or []:
            if not isinstance(item, dict):
                continue
            try:
                n = int(item.get("index"))
            except (TypeError, ValueError):
                continue
            by_index[n] = _normalize_attachment_result(item)

        if not by_index:
            per_asset = _fallback_results_from_overall(data, asset_specs)
        else:
            per_asset = []
            for spec in asset_specs:
                idx = spec["index"]
                if idx in by_index:
                    per_asset.append(by_index[idx])
                else:
                    per_asset.append(
                        _normalize_attachment_result(
                            {"summary": str(data.get("overall_summary") or "附件解析完成")}
                        )
                    )

        for spec, result in zip(asset_specs, per_asset):
            aid = spec["asset_id"]
            asset = get_asset(aid, user_id)
            if not asset or asset.get("parse_status") == "done":
                continue
            if aid in txt_local_results:
                update_asset_parse(
                    aid,
                    parse_status="done",
                    parse_result=txt_local_results[aid],
                    asset_type="text_doc",
                )
                continue
            atype = _classify_asset_type(spec["mime"], str(result.get("asset_type") or ""))
            if result.get("error"):
                update_asset_parse(aid, parse_status="error", parse_result=result)
            else:
                update_asset_parse(
                    aid,
                    parse_status="done",
                    parse_result=result,
                    asset_type=atype,
                )
        return vision_quota_meta

    except Exception as exc:
        err = {"error": str(exc), "ui_elements": []}
        for asset in pending:
            current = get_asset(asset["id"], user_id)
            if current and current.get("parse_status") != "done":
                update_asset_parse(asset["id"], parse_status="error", parse_result=err)
        raise ValueError(str(exc)) from exc
