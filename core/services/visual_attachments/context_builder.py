"""附件上下文合并与 prompt 注入。"""
from __future__ import annotations

from typing import Any

from core.services.visual_attachments.attachment_db import get_asset, get_context, insert_context
from core.services.visual_attachments.limits import (
    MAX_API_ENDPOINTS_TOTAL,
    MAX_ATTACH_FILES,
    MAX_PROMPT_BLOCK_CHARS,
    MAX_TEXT_BODY_CHARS_EACH,
    MAX_UI_ELEMENTS_TOTAL,
)


def merge_parse_results(assets: list[dict[str, Any]]) -> dict[str, Any]:
    merged: dict[str, Any] = {
        "summary_parts": [],
        "text_bodies": [],
        "ui_elements": [],
        "flow_nodes": [],
        "flow_edges": [],
        "api_endpoints": [],
    }
    elem_idx = 0
    for asset in assets:
        result = asset.get("parse_result") or {}
        if not isinstance(result, dict):
            continue
        s = str(result.get("summary") or "").strip()
        if s:
            merged["summary_parts"].append(s)
        body = str(result.get("text_content") or "").strip()
        if body:
            merged["text_bodies"].append(
                {
                    "title": s or str(asset.get("asset_type") or "文本文档"),
                    "content": body,
                    "source_asset_id": asset.get("id"),
                }
            )
        for el in result.get("ui_elements") or []:
            if not isinstance(el, dict):
                continue
            elem_idx += 1
            item = dict(el)
            item["element_key"] = str(item.get("element_key") or f"elem_{elem_idx}")
            item["source_asset_id"] = asset.get("id")
            merged["ui_elements"].append(item)
        for node in result.get("flow_nodes") or []:
            if isinstance(node, dict):
                merged["flow_nodes"].append(dict(node))
        for edge in result.get("flow_edges") or []:
            if isinstance(edge, dict):
                merged["flow_edges"].append(dict(edge))
        for ep in result.get("api_endpoints") or []:
            if isinstance(ep, dict):
                merged["api_endpoints"].append(dict(ep))
    return merged


def build_prompt_block(merged: dict[str, Any], *, user_prompt: str = "") -> str:
    lines: list[str] = ["【附件解析摘要】"]
    summaries = merged.get("summary_parts") or []
    if summaries:
        lines.append("；".join(summaries[:MAX_ATTACH_FILES]))
    ui_written = 0
    ep_written = 0
    for doc in merged.get("text_bodies") or []:
        title = str(doc.get("title") or "文本文档").strip()
        content = str(doc.get("content") or "").strip()[:MAX_TEXT_BODY_CHARS_EACH]
        if content:
            lines.append(f"\n--- {title} ---\n{content}")
    elements = merged.get("ui_elements") or []
    if elements:
        lines.append("\n【UI 元素清单】")
        for el in elements:
            if ui_written >= MAX_UI_ELEMENTS_TOTAL:
                lines.append(f"- … 其余 {len(elements) - ui_written} 个元素已省略")
                break
            lines.append(
                f"- [{el.get('element_key')}] {el.get('type')}: {el.get('label')} "
                f"(文案: {el.get('text', '')}, 区域: {el.get('region', '')})"
            )
            ui_written += 1
    endpoints = merged.get("api_endpoints") or []
    if endpoints:
        lines.append("\n【接口端点】")
        for ep in endpoints:
            if ep_written >= MAX_API_ENDPOINTS_TOTAL:
                lines.append(f"- … 其余 {len(endpoints) - ep_written} 个端点已省略")
                break
            lines.append(f"- {ep.get('method')} {ep.get('path')}: {ep.get('summary', '')}")
            ep_written += 1
    up = (user_prompt or "").strip()
    if up:
        lines.append(f"\n【用户范围约束】\n{up}")
    block = "\n".join(lines)
    if len(block) > MAX_PROMPT_BLOCK_CHARS:
        block = block[:MAX_PROMPT_BLOCK_CHARS].rstrip() + "\n…（附件摘要已截断）"
    return block


def create_attachment_context(
    *,
    user_id: str | None,
    asset_ids: list[str],
    user_prompt: str = "",
    include_in_generation: bool = True,
    include_in_validation: bool = True,
) -> dict[str, Any]:
    if len(asset_ids) > MAX_ATTACH_FILES:
        raise ValueError(f"最多 {MAX_ATTACH_FILES} 个附件参与生成")
    assets: list[dict[str, Any]] = []
    for aid in asset_ids:
        asset = get_asset(aid, user_id)
        if not asset:
            raise ValueError(f"附件不存在: {aid}")
        if asset.get("parse_status") != "done":
            raise ValueError(f"附件 {aid} 尚未解析完成")
        assets.append(asset)
    merged = merge_parse_results(assets)
    prompt_block = build_prompt_block(merged, user_prompt=user_prompt)
    ctx = insert_context(
        user_id=user_id,
        asset_ids=asset_ids,
        prompt_block=prompt_block,
        include_in_generation=include_in_generation,
        include_in_validation=include_in_validation,
        meta={
            "stats": {
                "assets": len(assets),
                "ui_elements": len(merged.get("ui_elements") or []),
            }
        },
    )
    ctx["prompt_block_preview"] = prompt_block[:2000]
    return ctx


def inject_attachment_context_into_prompt(
    prompt: str,
    context_id: str | None,
    user_id: str | None,
) -> str:
    if not context_id:
        return prompt
    ctx = get_context(context_id, user_id)
    if not ctx:
        return prompt
    block = str(ctx.get("prompt_block") or "").strip()
    if not block:
        return prompt
    if len(block) > MAX_PROMPT_BLOCK_CHARS:
        block = block[:MAX_PROMPT_BLOCK_CHARS].rstrip() + "\n…（附件摘要已截断）"
    return f"{block}\n\n【用户提示词】\n{prompt.strip()}"


def create_lightweight_attachment_context(
    *,
    user_id: str | None,
    asset_ids: list[str],
    user_prompt: str = "",
    include_in_generation: bool = True,
    include_in_validation: bool = True,
) -> dict[str, Any]:
    """仅登记附件上下文，不预解析；发送时由视觉模型直接读取附件。"""
    if len(asset_ids) > MAX_ATTACH_FILES:
        raise ValueError(f"最多 {MAX_ATTACH_FILES} 个附件参与编辑")
    for aid in asset_ids:
        asset = get_asset(aid, user_id)
        if not asset:
            raise ValueError(f"附件不存在: {aid}")
    prompt_block = f"【视觉直连附件】共 {len(asset_ids)} 个附件"
    up = (user_prompt or "").strip()
    if up:
        prompt_block += f"\n【用户范围约束】\n{up[:500]}"
    ctx = insert_context(
        user_id=user_id,
        asset_ids=asset_ids,
        prompt_block=prompt_block,
        include_in_generation=include_in_generation,
        include_in_validation=include_in_validation,
        meta={"mode": "vision_direct", "assets": len(asset_ids)},
    )
    ctx["prompt_block_preview"] = prompt_block[:2000]
    return ctx
