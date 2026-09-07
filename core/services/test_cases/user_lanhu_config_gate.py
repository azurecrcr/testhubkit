#!/usr/bin/env python3
"""蓝湖树恢复门控（隔离模块）：软删文档 + 登录会话内才自动恢复树。"""
from __future__ import annotations

from typing import Any

from core.services.test_cases.user_lanhu_config_db import (
    clear_lanhu_tree_session,
    clear_user_lanhu_credentials,
    get_user_lanhu_config,
    set_lanhu_tree_session,
)
from core.services.test_cases.user_lanhu_docs_db import (
    get_user_lanhu_doc,
    list_user_lanhu_docs,
    upsert_user_lanhu_doc_by_url,
)


def get_effective_user_lanhu_config(user_id: str) -> dict[str, Any]:
    """当前会话允许恢复时，返回活动文档（或最新未删文档）的蓝湖树凭证。"""
    uid = str(user_id or "").strip()
    config = get_user_lanhu_config(uid)
    config["lanhu_tree_enabled"] = False
    if not uid:
        return config
    if not config.get("lanhu_tree_restorable"):
        return config

    docs = list_user_lanhu_docs(uid)
    if not docs:
        return config

    active_id = str(config.get("active_lanhu_doc_id") or "").strip()
    doc = get_user_lanhu_doc(uid, active_id) if active_id else None
    if not doc:
        doc = docs[0]
        activate_lanhu_doc_for_tree(uid, str(doc.get("id") or ""))

    return {
        **config,
        "lanhu_cookie": str(doc.get("cookie") or ""),
        "lanhu_url": str(doc.get("url") or ""),
        "lanhu_tree_enabled": True,
        "active_lanhu_doc_id": str(doc.get("id") or ""),
    }


def activate_lanhu_doc_for_tree(user_id: str, doc_id: str) -> None:
    uid = str(user_id or "").strip()
    did = str(doc_id or "").strip()
    if not uid or not did:
        return
    doc = get_user_lanhu_doc(uid, did)
    if not doc:
        return
    set_lanhu_tree_session(
        uid,
        doc_id=did,
        cookie=str(doc.get("cookie") or ""),
        url=str(doc.get("url") or ""),
        restorable=True,
    )


def sync_lanhu_tree_session_from_credentials(
    user_id: str,
    cookie: str,
    url: str,
    *,
    name: str = "",
) -> None:
    uid = str(user_id or "").strip()
    cookie = str(cookie or "").strip()
    url = str(url or "").strip()
    if not uid or not cookie or not url:
        return
    doc = upsert_user_lanhu_doc_by_url(
        uid,
        {
            "name": name or "文档",
            "cookie": cookie,
            "url": url,
            "lanhu_cookie": cookie,
            "lanhu_url": url,
        },
    )
    activate_lanhu_doc_for_tree(uid, str(doc.get("id") or ""))


def on_user_lanhu_doc_deleted(user_id: str, deleted_doc: dict[str, Any]) -> None:
    uid = str(user_id or "").strip()
    if not uid:
        return
    config = get_user_lanhu_config(uid)
    active_id = str(config.get("active_lanhu_doc_id") or "").strip()
    deleted_id = str(deleted_doc.get("id") or "").strip()
    if active_id and deleted_id and active_id == deleted_id:
        clear_lanhu_tree_session(uid)
    if not list_user_lanhu_docs(uid):
        clear_user_lanhu_credentials(uid)


def on_user_lanhu_logout(user_id: str) -> None:
    uid = str(user_id or "").strip()
    if uid:
        clear_lanhu_tree_session(uid)
