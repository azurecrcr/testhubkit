"""需求页思维导图：解析蓝湖 URL 与读写业务。"""
from __future__ import annotations

from typing import Any

from core.services.test_cases.requirement_case_service import resolve_requirement_keys
from core.services.test_cases.requirement_mindmap_db import (
    get_requirement_mindmap,
    list_requirement_mindmaps_for_user,
    list_requirement_mindmaps_for_user_in_requirement_doc,
    upsert_requirement_mindmap,
)


def load_requirement_mindmap(user_id: str, *, lanhu_url: str, page_id: str | None = None) -> dict[str, Any] | None:
    page_from_client = str(page_id or "").strip()
    keys = resolve_requirement_keys(
        lanhu_url,
        page_from_client or None,
        explicit_page_id=bool(page_from_client),
    )
    if page_from_client and keys["lanhu_page_id"] != page_from_client:
        return None
    row = get_requirement_mindmap(
        user_id,
        lanhu_pid=keys["lanhu_pid"],
        lanhu_doc_id=keys["lanhu_doc_id"],
        lanhu_page_id=keys["lanhu_page_id"],
    )
    if row and page_from_client and str(row.get("lanhu_page_id") or "").strip() != page_from_client:
        return None
    return row


def save_requirement_mindmap(user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    url = str(data.get("lanhu_url") or "").strip()
    page_id = data.get("page_id") or data.get("lanhu_page_id")
    page_from_client = str(page_id or "").strip()
    keys = resolve_requirement_keys(
        url,
        page_from_client or None,
        explicit_page_id=bool(page_from_client),
    )
    payload = {
        **keys,
        "lanhu_url": url,
        "page_name": str(data.get("page_name") or ""),
        "template_id": data.get("template_id"),
        "payload": data.get("payload") or {},
        "source": str(data.get("source") or "manual_edit"),
    }
    return upsert_requirement_mindmap(user_id, payload)


def list_designed_requirement_mindmaps(user_id: str, *, limit: int = 500) -> list[dict[str, Any]]:
    return list_requirement_mindmaps_for_user(user_id, limit=limit)


def list_designed_requirement_mindmaps_for_requirement_doc(
    user_id: str,
    *,
    lanhu_pid: str = "",
    lanhu_doc_id: str = "",
    limit: int = 500,
) -> list[dict[str, Any]]:
    return list_requirement_mindmaps_for_user_in_requirement_doc(
        user_id,
        lanhu_pid=lanhu_pid,
        lanhu_doc_id=lanhu_doc_id,
        limit=limit,
    )
