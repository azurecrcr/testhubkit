"""需求用例：解析蓝湖 URL 与读写业务。"""
from __future__ import annotations

from typing import Any

from core.services.test_cases.lanhu_requirement_service import _parse_lanhu_url
from core.services.test_cases.requirement_case_db import (
    get_requirement_case,
    list_requirement_cases_for_user,
    list_requirement_cases_for_user_in_requirement_doc,
    upsert_requirement_case,
)


def resolve_requirement_keys(
    lanhu_url: str,
    page_id: str | None = None,
    *,
    explicit_page_id: bool = False,
) -> dict[str, str]:
    url = str(lanhu_url or "").strip()
    if not url:
        raise ValueError("请提供蓝湖文档 URL")
    params = _parse_lanhu_url(url)
    pid = str(params.get("project_id") or "")
    doc_id = str(params.get("doc_id") or "")
    page_from_query = str(page_id or "").strip()
    if explicit_page_id:
        page = page_from_query
    else:
        page = page_from_query or str(params.get("page_id") or "").strip()
    if not doc_id:
        raise ValueError("URL 缺少 docId，无法关联需求")
    requirement_id = page or doc_id
    return {
        "lanhu_pid": pid,
        "lanhu_doc_id": doc_id,
        "lanhu_page_id": page,
        "requirement_id": requirement_id,
    }


def load_requirement_cases(user_id: str, *, lanhu_url: str, page_id: str | None = None) -> dict[str, Any] | None:
    page_from_client = str(page_id or "").strip()
    keys = resolve_requirement_keys(
        lanhu_url,
        page_from_client or None,
        explicit_page_id=bool(page_from_client),
    )
    if page_from_client and keys["lanhu_page_id"] != page_from_client:
        return None
    row = get_requirement_case(
        user_id,
        lanhu_pid=keys["lanhu_pid"],
        lanhu_doc_id=keys["lanhu_doc_id"],
        lanhu_page_id=keys["lanhu_page_id"],
    )
    if row and page_from_client and str(row.get("lanhu_page_id") or "").strip() != page_from_client:
        return None
    return row


def save_requirement_cases(user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    url = str(data.get("lanhu_url") or "").strip()
    page_id = data.get("page_id") or data.get("lanhu_page_id")
    page_from_client = str(page_id or "").strip()
    keys = resolve_requirement_keys(
        url,
        page_from_client or None,
        explicit_page_id=bool(page_from_client),
    )
    merge_mode = str(data.get("merge_mode") or "overwrite").strip()
    payload = {
        **keys,
        "lanhu_url": url,
        "page_name": str(data.get("page_name") or ""),
        "template_id": data.get("template_id"),
        "payload": data.get("payload") or {},
        "source": str(data.get("source") or "manual_edit"),
        "merge_mode": merge_mode,
    }
    # 前端清空表格会传 allow_clear/force_clear；必须透传，否则 upsert 会 skipped_empty_overwrite
    if data.get("allow_clear") or data.get("force_clear") or data.get("allow_empty_overwrite"):
        payload["allow_clear"] = True
        payload["force_clear"] = True
    return upsert_requirement_case(user_id, payload)


def list_designed_requirement_cases(user_id: str, *, limit: int = 500) -> list[dict[str, Any]]:
    return list_requirement_cases_for_user(user_id, limit=limit)


def list_designed_requirement_cases_for_requirement_doc(
    user_id: str,
    *,
    lanhu_pid: str = "",
    lanhu_doc_id: str = "",
    limit: int = 500,
) -> list[dict[str, Any]]:
    return list_requirement_cases_for_user_in_requirement_doc(
        user_id,
        lanhu_pid=lanhu_pid,
        lanhu_doc_id=lanhu_doc_id,
        limit=limit,
    )
