"""蓝湖需求树：按用户缓存单页需求文本与字数。"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from core.services.test_cases.mysql_db import get_connection

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS tc_lanhu_page_content_cache (
    user_id CHAR(32) NOT NULL,
    doc_id VARCHAR(64) NOT NULL,
    page_id VARCHAR(64) NOT NULL,
    page_name VARCHAR(200) NULL,
    lanhu_url VARCHAR(2048) NOT NULL DEFAULT '',
    content_text MEDIUMTEXT NOT NULL,
    content_chars INT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (user_id, doc_id, page_id),
    INDEX idx_tc_lanhu_page_cache_user_doc (user_id, doc_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def ensure_lanhu_page_cache_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
    finally:
        conn.close()


def upsert_page_cache(
    *,
    user_id: str,
    doc_id: str,
    page_id: str,
    page_name: str | None,
    lanhu_url: str,
    content_text: str,
    content_chars: int,
) -> None:
    ensure_lanhu_page_cache_table()
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_lanhu_page_content_cache
                    (user_id, doc_id, page_id, page_name, lanhu_url,
                     content_text, content_chars, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    page_name = VALUES(page_name),
                    lanhu_url = VALUES(lanhu_url),
                    content_text = VALUES(content_text),
                    content_chars = VALUES(content_chars),
                    updated_at = VALUES(updated_at)
                """,
                (
                    user_id,
                    doc_id,
                    page_id,
                    (page_name or "")[:200] or None,
                    (lanhu_url or "")[:2048],
                    content_text or "",
                    int(content_chars or 0),
                    now,
                ),
            )
    finally:
        conn.close()


def list_page_cache_for_doc(user_id: str, doc_id: str) -> list[dict[str, Any]]:
    ensure_lanhu_page_cache_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT page_id, page_name, content_text, content_chars, updated_at
                FROM tc_lanhu_page_content_cache
                WHERE user_id = %s AND doc_id = %s
                ORDER BY updated_at DESC
                """,
                (user_id, doc_id),
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()
    out: list[dict[str, Any]] = []
    for row in rows:
        out.append(
            {
                "page_id": row.get("page_id") or "",
                "page_name": row.get("page_name") or "",
                "content_text": row.get("content_text") or "",
                "content_chars": int(row.get("content_chars") or 0),
                "updated_at": str(row.get("updated_at") or ""),
            }
        )
    return out


def sql_exclude_pages_bound_to_other_doc(table_alias: str = "c") -> str:
    """排除 page 在缓存中已绑定其它需求文档的脏数据行。"""
    t = table_alias
    return (
        f" AND ({t}.lanhu_page_id = '' OR NOT EXISTS ("
        f" SELECT 1 FROM tc_lanhu_page_content_cache p"
        f" WHERE p.user_id = {t}.user_id AND p.page_id = {t}.lanhu_page_id"
        f" AND p.doc_id != {t}.lanhu_doc_id"
        f"))"
    )


def assert_page_belongs_to_requirement_doc(
    user_id: str,
    lanhu_doc_id: str,
    lanhu_page_id: str,
) -> None:
    """保存前校验：需求页若已在缓存中绑定其它 doc，则拒绝跨文档写入。"""
    uid = str(user_id or "").strip()
    doc_id = str(lanhu_doc_id or "").strip()
    page_id = str(lanhu_page_id or "").strip()
    if not uid or not doc_id or not page_id:
        return
    ensure_lanhu_page_cache_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM tc_lanhu_page_content_cache "
                "WHERE user_id = %s AND page_id = %s AND doc_id != %s LIMIT 1",
                (uid, page_id, doc_id),
            )
            conflict = cur.fetchone()
    finally:
        conn.close()
    if conflict:
        raise ValueError("该需求页属于其他蓝湖需求文档，请在正确的项目/文档下编辑用例")


def sql_exclude_pages_bound_to_other_doc(table_alias: str = "c") -> str:
    """排除 page 在缓存中已绑定其它需求文档的脏数据行。"""
    t = table_alias
    return (
        f" AND ({t}.lanhu_page_id = '' OR NOT EXISTS ("
        f" SELECT 1 FROM tc_lanhu_page_content_cache p"
        f" WHERE p.user_id = {t}.user_id AND p.page_id = {t}.lanhu_page_id"
        f" AND p.doc_id != {t}.lanhu_doc_id"
        f"))"
    )


def assert_page_belongs_to_requirement_doc(
    user_id: str,
    lanhu_doc_id: str,
    lanhu_page_id: str,
) -> None:
    """保存前校验：需求页若已在缓存中绑定其它 doc，则拒绝跨文档写入。"""
    uid = str(user_id or "").strip()
    doc_id = str(lanhu_doc_id or "").strip()
    page_id = str(lanhu_page_id or "").strip()
    if not uid or not doc_id or not page_id:
        return
    ensure_lanhu_page_cache_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM tc_lanhu_page_content_cache "
                "WHERE user_id = %s AND page_id = %s AND doc_id != %s LIMIT 1",
                (uid, page_id, doc_id),
            )
            conflict = cur.fetchone()
    finally:
        conn.close()
    if conflict:
        raise ValueError("该需求页属于其他蓝湖需求文档，请在正确的项目/文档下编辑用例")
