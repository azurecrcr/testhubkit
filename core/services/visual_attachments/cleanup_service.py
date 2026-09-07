"""过期视觉附件与上下文清理。"""
from __future__ import annotations

import os

from core.services.visual_attachments.asset_store import delete_files
from core.services.visual_attachments.attachment_db import (
    delete_asset as db_delete_asset,
    delete_context as db_delete_context,
    ensure_tables,
    list_expired_assets,
    list_expired_contexts,
)


def _batch_size() -> int:
    try:
        size = int(os.environ.get("VISUAL_ATTACH_CLEANUP_BATCH_SIZE", "200"))
    except ValueError:
        size = 200
    return max(1, min(size, 1000))


def purge_expired_visual_attachments_batch(*, batch_size: int | None = None) -> dict[str, int]:
    ensure_tables()
    size = batch_size or _batch_size()
    stats = {"assets": 0, "contexts": 0}

    for row in list_expired_assets(limit=size):
        delete_files(row.get("storage_key") or "", row.get("thumb_key"))
        db_delete_asset(row.get("id") or "", row.get("user_id"))
        stats["assets"] += 1

    for row in list_expired_contexts(limit=size):
        db_delete_context(row.get("id") or "")
        stats["contexts"] += 1

    return stats


def purge_all_expired_visual_attachments(*, max_batches: int = 100) -> dict[str, int]:
    total = {"assets": 0, "contexts": 0}
    for _ in range(max(1, max_batches)):
        stats = purge_expired_visual_attachments_batch()
        total["assets"] += stats["assets"]
        total["contexts"] += stats["contexts"]
        if stats["assets"] == 0 and stats["contexts"] == 0:
            break
    return total
