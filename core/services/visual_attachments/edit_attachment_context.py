"""智能编辑附件：发送前仅登记上下文，视觉解析在 smart-edit 发送时一次完成。"""
from __future__ import annotations

from typing import Any

from core.services.visual_attachments.attachment_db import get_asset
from core.services.visual_attachments.context_builder import create_lightweight_attachment_context
from core.services.visual_attachments.limits import MAX_ATTACH_FILES


def prepare_edit_attachment_context(
    *,
    user_id: str | None,
    asset_ids: list[str],
    user_prompt: str = "",
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    if not asset_ids:
        raise ValueError("缺少 asset_ids")
    if len(asset_ids) > MAX_ATTACH_FILES:
        raise ValueError(f"最多 {MAX_ATTACH_FILES} 个附件参与编辑")

    normalized: list[str] = []
    for raw_id in asset_ids:
        aid = str(raw_id or "").strip()
        if not aid or aid in normalized:
            continue
        normalized.append(aid)

    for aid in normalized:
        if not get_asset(aid, user_id):
            raise ValueError(f"附件不存在: {aid}")

    ctx = create_lightweight_attachment_context(
        user_id=user_id,
        asset_ids=normalized,
        user_prompt=user_prompt,
        include_in_generation=True,
    )
    return ctx, None
