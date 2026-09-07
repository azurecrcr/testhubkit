"""管理员查看用户投稿建议（只读列表，独立于投稿提交与邮件通知）。"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from core.services.feedback import feedback_db


def _fmt_dt(value: Any) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return str(value or "")


def list_feedback_admin(*, page: int = 1, page_size: int = 20) -> dict[str, Any]:
    page = max(1, int(page or 1))
    page_size = max(1, min(50, int(page_size or 20)))
    total = feedback_db.count_all_feedback()
    rows = feedback_db.list_feedback_for_admin(page=page, page_size=page_size)
    images_by_fid: dict[str, list[dict[str, Any]]] = {}
    try:
        from core.services.feedback.feedback_image_db import list_images_by_feedback_ids

        fids = [str(r.get("id") or "") for r in rows if r.get("id")]
        for img in list_images_by_feedback_ids(fids):
            fid = str(img.get("feedback_id") or "")
            if not fid:
                continue
            images_by_fid.setdefault(fid, []).append(
                {
                    "id": img.get("id") or "",
                    "file_name": img.get("file_name") or "",
                    "mime_type": img.get("mime_type") or "",
                    "url": "/api/feedback/admin/images/" + str(img.get("id") or ""),
                }
            )
    except Exception:
        images_by_fid = {}

    items = []
    for row in rows:
        fid = row.get("id") or ""
        items.append(
            {
                "id": fid,
                "content": row.get("content") or "",
                "contact": row.get("contact") or "",
                "page_url": row.get("page_url") or "",
                "client_ip": row.get("client_ip") or "",
                "hub_user_id": row.get("hub_user_id") or None,
                "created_at": _fmt_dt(row.get("created_at")),
                "email_sent": bool(row.get("email_sent")),
                "sms_sent": bool(row.get("sms_sent")),
                "images": images_by_fid.get(str(fid), []),
            }
        )
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def get_feedback_admin_detail(feedback_id: str) -> dict[str, Any] | None:
    """管理员查看单条投稿详情（含图片元数据）。新方法，不影响分页列表。"""
    row = feedback_db.get_feedback_by_id(feedback_id)
    if not row:
        return None
    fid = str(row.get("id") or "")
    images: list[dict[str, Any]] = []
    try:
        from core.services.feedback.feedback_image_db import list_images_by_feedback_ids

        for img in list_images_by_feedback_ids([fid]):
            images.append(
                {
                    "id": img.get("id") or "",
                    "file_name": img.get("file_name") or "",
                    "mime_type": img.get("mime_type") or "",
                    "url": "/api/feedback/admin/images/" + str(img.get("id") or ""),
                }
            )
    except Exception:
        images = []
    return {
        "id": fid,
        "content": row.get("content") or "",
        "contact": row.get("contact") or "",
        "page_url": row.get("page_url") or "",
        "client_ip": row.get("client_ip") or "",
        "hub_user_id": row.get("hub_user_id") or None,
        "created_at": _fmt_dt(row.get("created_at")),
        "email_sent": bool(row.get("email_sent")),
        "sms_sent": bool(row.get("sms_sent")),
        "images": images,
        "image_count": len(images),
    }
