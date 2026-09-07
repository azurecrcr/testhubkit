#!/usr/bin/env python3
"""用户蓝湖需求文档列表：每用户可保存多条 Cookie+URL 文档。"""
from __future__ import annotations

import re
import time
import uuid
from typing import Any, Optional

from core.services.test_cases.lanhu_doc_url_validator import assert_lanhu_doc_url_https_prefix
from core.services.test_cases.lanhu_requirement_service import _parse_lanhu_url
from core.services.test_cases.stash_db import get_connection

_ACTIVE_DOC_SQL = " AND (is_deleted = 0 OR is_deleted IS NULL)"

_DUPLICATE_MSG = "该蓝湖文档已添加，请勿重复添加"

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS user_lanhu_docs (
    id CHAR(32) NOT NULL PRIMARY KEY,
    user_id CHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL DEFAULT '',
    lanhu_cookie TEXT NOT NULL,
    lanhu_url VARCHAR(2048) NOT NULL DEFAULT '',
    lanhu_doc_key VARCHAR(128) NOT NULL DEFAULT '',
    is_deleted TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_user_lanhu_docs_user (user_id, updated_at DESC),
    INDEX idx_user_lanhu_docs_url (user_id, lanhu_url(255)),
    INDEX idx_user_lanhu_docs_key (user_id, lanhu_doc_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())



def _normalize_lanhu_doc_url(url: str) -> str:
    """保存/查重用的文档级 URL：去掉 pageId 等页面参数，避免同一文档重复入库。"""
    u = str(url or "").strip()
    if not u:
        return ""
    u = re.sub(r"(?i)([?&])pageId=[^&]*&?", r"\1", u)
    u = re.sub(r"(?i)([?&])page_id=[^&]*&?", r"\1", u)
    u = re.sub(r"[?&]$", "", u)
    u = re.sub(r"\?&", "?", u)
    u = re.sub(r"&&+", "&", u)
    return u


def _find_legacy_pid_doc(user_id: str, url: str) -> dict[str, Any] | None:
    """docId 键升级前已保存的 pid 文档，避免 upsert 重复创建。"""
    uid = str(user_id or "").strip()
    norm = _normalize_lanhu_doc_url(url)
    if not uid or not norm:
        return None
    try:
        params = _parse_lanhu_url(norm)
    except ValueError:
        return None
    doc_id = str(params.get("doc_id") or "").strip()
    pid = str(params.get("project_id") or "").strip()
    if not doc_id or not pid:
        return None
    return _find_doc_by_key(uid, f"pid:{pid}")

def extract_lanhu_doc_key(url: str) -> str:
    """从蓝湖 URL 提取文档唯一键：优先 docId，其次 pid，最后整段 URL。"""
    raw = _normalize_lanhu_doc_url(url)
    if not raw:
        return ""
    try:
        params = _parse_lanhu_url(raw)
    except ValueError:
        return f"url:{raw}"
    doc_id = str(params.get("doc_id") or "").strip()
    pid = str(params.get("project_id") or "").strip()
    if doc_id:
        return f"doc:{doc_id}"
    if pid:
        return f"pid:{pid}"
    return f"url:{raw}"


def _column_exists(cur, column: str) -> bool:
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_lanhu_docs' AND COLUMN_NAME = %s",
        (column,),
    )
    row = cur.fetchone() or {}
    return int(row.get("n") or 0) > 0


def ensure_user_lanhu_docs_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
            if not _column_exists(cur, "lanhu_doc_key"):
                cur.execute(
                    "ALTER TABLE user_lanhu_docs "
                    "ADD COLUMN lanhu_doc_key VARCHAR(128) NOT NULL DEFAULT '' AFTER lanhu_url"
                )
                cur.execute(
                    "ALTER TABLE user_lanhu_docs "
                    "ADD INDEX idx_user_lanhu_docs_key (user_id, lanhu_doc_key)"
                )
            if not _column_exists(cur, "is_deleted"):
                cur.execute(
                    "ALTER TABLE user_lanhu_docs "
                    "ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER lanhu_doc_key"
                )
            cur.execute(
                "SELECT id, lanhu_url FROM user_lanhu_docs WHERE lanhu_doc_key = '' OR lanhu_doc_key IS NULL"
            )
            for row in cur.fetchall() or []:
                key = extract_lanhu_doc_key(str(row.get("lanhu_url") or ""))
                cur.execute(
                    "UPDATE user_lanhu_docs SET lanhu_doc_key = %s WHERE id = %s",
                    (key, row.get("id")),
                )
        conn.commit()
    finally:
        conn.close()


def _row_to_doc(row: dict[str, Any]) -> dict[str, Any]:
    created = row.get("created_at")
    updated = row.get("updated_at")
    url = str(row.get("lanhu_url") or "")
    doc_key = str(row.get("lanhu_doc_key") or "") or extract_lanhu_doc_key(url)
    return {
        "id": str(row.get("id") or ""),
        "name": str(row.get("name") or ""),
        "cookie": str(row.get("lanhu_cookie") or ""),
        "url": url,
        "lanhuDocKey": doc_key,
        "createdAt": int(created.timestamp() * 1000) if hasattr(created, "timestamp") else None,
        "updatedAt": int(updated.timestamp() * 1000) if hasattr(updated, "timestamp") else None,
        "created_at": str(created or ""),
        "updated_at": str(updated or ""),
    }


def _find_doc_by_key(user_id: str, doc_key: str, exclude_id: Optional[str] = None) -> Optional[dict[str, Any]]:
    uid = str(user_id or "").strip()
    key = str(doc_key or "").strip()
    if not uid or not key:
        return None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if exclude_id:
                cur.execute(
                    """
                    SELECT id, name, lanhu_cookie, lanhu_url, lanhu_doc_key, created_at, updated_at
                    FROM user_lanhu_docs
                    WHERE user_id = %s AND lanhu_doc_key = %s AND id <> %s AND (is_deleted = 0 OR is_deleted IS NULL)
                    LIMIT 1
                    """,
                    (uid, key, exclude_id),
                )
            else:
                cur.execute(
                    """
                    SELECT id, name, lanhu_cookie, lanhu_url, lanhu_doc_key, created_at, updated_at
                    FROM user_lanhu_docs
                    WHERE user_id = %s AND lanhu_doc_key = %s AND (is_deleted = 0 OR is_deleted IS NULL)
                    LIMIT 1
                    """,
                    (uid, key),
                )
            row = cur.fetchone()
        return _row_to_doc(row) if row else None
    finally:
        conn.close()


def _find_doc_by_url(user_id: str, url: str) -> Optional[dict[str, Any]]:
    uid = str(user_id or "").strip()
    u = str(url or "").strip()
    if not uid or not u:
        return None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, lanhu_cookie, lanhu_url, lanhu_doc_key, created_at, updated_at
                FROM user_lanhu_docs
                WHERE user_id = %s AND lanhu_url = %s AND (is_deleted = 0 OR is_deleted IS NULL)
                LIMIT 1
                """,
                (uid, u),
            )
            row = cur.fetchone()
        return _row_to_doc(row) if row else None
    finally:
        conn.close()


def list_user_lanhu_docs(user_id: str) -> list[dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return []
    ensure_user_lanhu_docs_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, lanhu_cookie, lanhu_url, lanhu_doc_key, created_at, updated_at
                FROM user_lanhu_docs
                WHERE user_id = %s AND (is_deleted = 0 OR is_deleted IS NULL)
                ORDER BY updated_at DESC
                """,
                (uid,),
            )
            rows = cur.fetchall() or []
        return [_row_to_doc(r) for r in rows]
    finally:
        conn.close()


def get_user_lanhu_doc(user_id: str, doc_id: str) -> Optional[dict[str, Any]]:
    uid = str(user_id or "").strip()
    did = str(doc_id or "").strip()
    if not uid or not did:
        return None
    ensure_user_lanhu_docs_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, lanhu_cookie, lanhu_url, lanhu_doc_key, created_at, updated_at
                FROM user_lanhu_docs
                WHERE user_id = %s AND id = %s AND (is_deleted = 0 OR is_deleted IS NULL)
                LIMIT 1
                """,
                (uid, did),
            )
            row = cur.fetchone()
        return _row_to_doc(row) if row else None
    finally:
        conn.close()


def create_user_lanhu_doc(user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    from core.services.test_cases.user_lanhu_doc_quota_service import (
        assert_user_may_create_lanhu_doc,
    )

    uid = str(user_id or "").strip()
    if not uid:
        raise ValueError("请先登录")
    assert_user_may_create_lanhu_doc(uid)
    name = str(data.get("name") or "").strip()
    cookie = str(data.get("cookie") or data.get("lanhu_cookie") or "").strip()
    url = str(data.get("url") or data.get("lanhu_url") or "").strip()
    assert_lanhu_doc_url_https_prefix(url)
    url = _normalize_lanhu_doc_url(url)
    if not name:
        raise ValueError("请填写文档名称")
    if not cookie or not url:
        raise ValueError("请填写 Cookie 和 URL")
    doc_key = extract_lanhu_doc_key(url)
    ensure_user_lanhu_docs_table()
    if _find_doc_by_key(uid, doc_key):
        raise ValueError(_DUPLICATE_MSG)
    if _find_legacy_pid_doc(uid, url):
        raise ValueError(_DUPLICATE_MSG)
    soft = _find_doc_by_key_any(uid, doc_key)
    if soft and not get_user_lanhu_doc(uid, soft["id"]):
        return _restore_soft_deleted_doc(uid, soft["id"], {"name": name, "cookie": cookie, "url": url})
    doc_id = uuid.uuid4().hex
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_lanhu_docs
                (id, user_id, name, lanhu_cookie, lanhu_url, lanhu_doc_key, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (doc_id, uid, name, cookie, url, doc_key, now, now),
            )
        conn.commit()
    finally:
        conn.close()
    doc = get_user_lanhu_doc(uid, doc_id)
    if not doc:
        raise RuntimeError("创建文档失败")
    return doc


def update_user_lanhu_doc(user_id: str, doc_id: str, data: dict[str, Any]) -> dict[str, Any]:
    uid = str(user_id or "").strip()
    did = str(doc_id or "").strip()
    if not uid or not did:
        raise ValueError("无效的文档")
    existing = get_user_lanhu_doc(uid, did)
    if not existing:
        raise ValueError("文档不存在")
    name = str(data.get("name") or existing.get("name") or "").strip()
    cookie = str(data.get("cookie") or data.get("lanhu_cookie") or existing.get("cookie") or "").strip()
    url = str(data.get("url") or data.get("lanhu_url") or existing.get("url") or "").strip()
    assert_lanhu_doc_url_https_prefix(url)
    url = _normalize_lanhu_doc_url(url)
    if not name:
        raise ValueError("请填写文档名称")
    if not cookie or not url:
        raise ValueError("请填写 Cookie 和 URL")
    doc_key = extract_lanhu_doc_key(url)
    dup = _find_doc_by_key(uid, doc_key, exclude_id=did)
    if dup:
        raise ValueError(_DUPLICATE_MSG)
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE user_lanhu_docs
                SET name = %s, lanhu_cookie = %s, lanhu_url = %s, lanhu_doc_key = %s, updated_at = %s
                WHERE user_id = %s AND id = %s
                """,
                (name, cookie, url, doc_key, now, uid, did),
            )
        conn.commit()
    finally:
        conn.close()
    doc = get_user_lanhu_doc(uid, did)
    if not doc:
        raise RuntimeError("更新文档失败")
    return doc



def _restore_soft_deleted_doc(user_id: str, doc_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """将软删文档恢复为有效文档并更新字段。"""
    uid = str(user_id or "").strip()
    did = str(doc_id or "").strip()
    name = str(data.get("name") or "").strip() or "文档"
    cookie = str(data.get("cookie") or data.get("lanhu_cookie") or "").strip()
    raw_url = str(data.get("url") or data.get("lanhu_url") or "").strip()
    assert_lanhu_doc_url_https_prefix(raw_url)
    url = _normalize_lanhu_doc_url(raw_url)
    if not cookie or not url:
        raise ValueError("请填写 Cookie 和 URL")
    doc_key = extract_lanhu_doc_key(url)
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE user_lanhu_docs
                SET name = %s, lanhu_cookie = %s, lanhu_url = %s, lanhu_doc_key = %s,
                    is_deleted = 0, updated_at = %s
                WHERE user_id = %s AND id = %s
                """,
                (name, cookie, url, doc_key, now, uid, did),
            )
        conn.commit()
    finally:
        conn.close()
    doc = get_user_lanhu_doc(uid, did)
    if not doc:
        raise RuntimeError("恢复文档失败")
    return doc


def _find_doc_by_key_any(user_id: str, doc_key: str) -> Optional[dict[str, Any]]:
    uid = str(user_id or "").strip()
    key = str(doc_key or "").strip()
    if not uid or not key:
        return None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, lanhu_cookie, lanhu_url, lanhu_doc_key, created_at, updated_at
                FROM user_lanhu_docs
                WHERE user_id = %s AND lanhu_doc_key = %s
                LIMIT 1
                """,
                (uid, key),
            )
            row = cur.fetchone()
        return _row_to_doc(row) if row else None
    finally:
        conn.close()

def upsert_user_lanhu_doc_by_url(user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    uid = str(user_id or "").strip()
    if not uid:
        raise ValueError("请先登录")
    raw_url = str(data.get("url") or data.get("lanhu_url") or "").strip()
    if not raw_url:
        raise ValueError("请填写 URL")
    ensure_user_lanhu_docs_table()
    url = _normalize_lanhu_doc_url(raw_url)
    payload = dict(data)
    payload["url"] = url
    payload["lanhu_url"] = url
    doc_key = extract_lanhu_doc_key(url)
    existing = _find_doc_by_url(uid, url) or _find_doc_by_key(uid, doc_key)
    if not existing:
        existing = _find_legacy_pid_doc(uid, url)
    if not existing:
        existing = _find_doc_by_key_any(uid, doc_key)
    if existing:
        if get_user_lanhu_doc(uid, existing["id"]):
            return update_user_lanhu_doc(uid, existing["id"], payload)
        return _restore_soft_deleted_doc(uid, existing["id"], payload)
    return create_user_lanhu_doc(uid, payload)


def delete_user_lanhu_doc(user_id: str, doc_id: str) -> dict:
    """删除用户蓝湖文档记录，并物理清理关联用例/页面缓存等。"""
    from core.services.test_cases.user_lanhu_doc_purge_db import (
        purge_user_lanhu_doc_related_data,
    )

    uid = str(user_id or "").strip()
    did = str(doc_id or "").strip()
    if not uid or not did:
        return {"deleted": False, "purged": {}}
    existing = get_user_lanhu_doc(uid, did)
    if not existing:
        return {"deleted": False, "purged": {}}
    purged = purge_user_lanhu_doc_related_data(uid, existing)
    ensure_user_lanhu_docs_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            now = _now_str()
            cur.execute(
                "UPDATE user_lanhu_docs SET is_deleted = 1, updated_at = %s "
                "WHERE user_id = %s AND id = %s AND (is_deleted = 0 OR is_deleted IS NULL)",
                (now, uid, did),
            )
            deleted = cur.rowcount > 0
        conn.commit()
        if deleted:
            from core.services.test_cases.user_lanhu_config_gate import (
                on_user_lanhu_doc_deleted,
            )

            on_user_lanhu_doc_deleted(uid, existing)
        return {"deleted": deleted, "purged": purged}
    finally:
        conn.close()


def import_user_lanhu_docs(user_id: str, docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        raise ValueError("请先登录")
    if not isinstance(docs, list):
        raise ValueError("docs 必须为数组")
    for item in docs:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or item.get("lanhu_url") or "").strip()
        cookie = str(item.get("cookie") or item.get("lanhu_cookie") or "").strip()
        if not url or not cookie:
            continue
        name = str(item.get("name") or "").strip() or "文档"
        upsert_user_lanhu_doc_by_url(uid, {"name": name, "cookie": cookie, "url": url})
    return list_user_lanhu_docs(uid)
