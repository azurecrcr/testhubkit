"""按蓝湖需求页持久化思维导图（与表格用例隔离）。"""
from __future__ import annotations

import json
import time
from typing import Any, Optional

from core.services.test_cases.lanhu_page_cache_db import (
    assert_page_belongs_to_requirement_doc,
    sql_exclude_pages_bound_to_other_doc,
)
from core.services.test_cases.mysql_db import get_connection

_TABLE_SQL = (
    "CREATE TABLE IF NOT EXISTS tc_requirement_mindmaps ("
    " id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,"
    " user_id CHAR(32) NOT NULL,"
    " lanhu_pid VARCHAR(64) NOT NULL DEFAULT '',"
    " lanhu_doc_id VARCHAR(64) NOT NULL DEFAULT '',"
    " lanhu_page_id VARCHAR(64) NOT NULL DEFAULT '',"
    " requirement_id VARCHAR(64) NOT NULL,"
    " lanhu_url VARCHAR(2048) NOT NULL DEFAULT '',"
    " page_name VARCHAR(512) NOT NULL DEFAULT '',"
    " template_id VARCHAR(64) NULL,"
    " payload_json LONGTEXT NOT NULL,"
    " case_count INT NOT NULL DEFAULT 0,"
    " source VARCHAR(32) NOT NULL DEFAULT 'manual_edit',"
    " updated_at DATETIME NOT NULL,"
    " created_at DATETIME NOT NULL,"
    " UNIQUE KEY uk_user_requirement_mindmap (user_id, lanhu_pid, lanhu_doc_id, lanhu_page_id),"
    " INDEX idx_user_mindmap_updated (user_id, updated_at)"
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
)

_MAX_PAYLOAD_BYTES = 16 * 1024 * 1024


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _resolve_case_name_col_idx(columns: list[Any]) -> int:
    for i, col in enumerate(columns or []):
        if str(col or "").strip() == "用例名称":
            return i
    return 0


def count_mindmap_case_rows(payload: dict[str, Any]) -> int:
    if not isinstance(payload, dict):
        return 0
    rows = payload.get("rows") or []
    if not isinstance(rows, list):
        return 0
    columns = payload.get("columns") or []
    name_idx = _resolve_case_name_col_idx(columns if isinstance(columns, list) else [])
    count = 0
    for row in rows:
        if not isinstance(row, list):
            continue
        if name_idx < len(row) and str(row[name_idx] or "").strip():
            count += 1
            continue
        if any(str(cell or "").strip() for cell in row):
            count += 1
    if count:
        return count
    mind = payload.get("mind")
    if isinstance(mind, dict):
        data = mind.get("data") or {}
        children = data.get("children") if isinstance(data, dict) else None
        if isinstance(children, list) and children:
            return len(children)
    return 0


def ensure_requirement_mindmap_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
    finally:
        conn.close()


def get_requirement_mindmap(
    user_id: str,
    *,
    lanhu_pid: str,
    lanhu_doc_id: str,
    lanhu_page_id: str,
) -> Optional[dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return None
    ensure_requirement_mindmap_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT requirement_id, lanhu_pid, lanhu_doc_id, lanhu_page_id, "
                "lanhu_url, page_name, template_id, payload_json, case_count, "
                "source, updated_at, created_at FROM tc_requirement_mindmaps "
                "WHERE user_id = %s AND lanhu_pid = %s AND lanhu_doc_id = %s "
                "AND lanhu_page_id = %s LIMIT 1",
                (uid, lanhu_pid or "", lanhu_doc_id or "", lanhu_page_id or ""),
            )
            row = cur.fetchone()
        if not row:
            return None
        try:
            payload = json.loads(row.get("payload_json") or "{}")
        except json.JSONDecodeError:
            payload = {}
        return {
            "requirement_id": str(row.get("requirement_id") or ""),
            "lanhu_pid": str(row.get("lanhu_pid") or ""),
            "lanhu_doc_id": str(row.get("lanhu_doc_id") or ""),
            "lanhu_page_id": str(row.get("lanhu_page_id") or ""),
            "lanhu_url": str(row.get("lanhu_url") or ""),
            "page_name": str(row.get("page_name") or ""),
            "template_id": row.get("template_id"),
            "payload": payload,
            "case_count": int(row.get("case_count") or 0),
            "source": str(row.get("source") or ""),
            "updated_at": str(row.get("updated_at") or ""),
            "created_at": str(row.get("created_at") or ""),
        }
    finally:
        conn.close()


def list_requirement_mindmaps_for_user(user_id: str, *, limit: int = 500) -> list[dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return []
    ensure_requirement_mindmap_table()
    lim = max(1, min(int(limit or 500), 1000))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT requirement_id, lanhu_pid, lanhu_doc_id, lanhu_page_id, "
                "lanhu_url, page_name, template_id, case_count, updated_at "
                "FROM tc_requirement_mindmaps "
                "WHERE user_id = %s AND case_count > 0 "
                "ORDER BY updated_at DESC LIMIT %s",
                (uid, lim),
            )
            rows = cur.fetchall() or []
        out: list[dict[str, Any]] = []
        for row in rows:
            out.append({
                "requirement_id": str(row.get("requirement_id") or ""),
                "lanhu_pid": str(row.get("lanhu_pid") or ""),
                "lanhu_doc_id": str(row.get("lanhu_doc_id") or ""),
                "lanhu_page_id": str(row.get("lanhu_page_id") or ""),
                "lanhu_url": str(row.get("lanhu_url") or ""),
                "page_name": str(row.get("page_name") or ""),
                "template_id": row.get("template_id"),
                "case_count": int(row.get("case_count") or 0),
                "updated_at": str(row.get("updated_at") or ""),
            })
        return out
    finally:
        conn.close()


def list_requirement_mindmaps_for_user_in_requirement_doc(
    user_id: str,
    *,
    lanhu_pid: str = "",
    lanhu_doc_id: str = "",
    limit: int = 500,
) -> list[dict[str, Any]]:
    """按用户 + 需求文档列出已有导图用例的需求页（用例评审专用）。"""
    uid = str(user_id or "").strip()
    doc_id = str(lanhu_doc_id or "").strip()
    pid = str(lanhu_pid or "").strip()
    if not uid or not doc_id:
        return []
    ensure_requirement_mindmap_table()
    lim = max(1, min(int(limit or 500), 1000))
    page_doc_filter = sql_exclude_pages_bound_to_other_doc("c")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if pid:
                cur.execute(
                    "SELECT c.requirement_id, c.lanhu_pid, c.lanhu_doc_id, c.lanhu_page_id, "
                    "c.lanhu_url, c.page_name, c.template_id, c.case_count, c.updated_at "
                    "FROM tc_requirement_mindmaps c "
                    "WHERE c.user_id = %s AND c.lanhu_doc_id = %s AND c.lanhu_pid = %s "
                    "AND c.case_count > 0"
                    + page_doc_filter
                    + " ORDER BY c.updated_at DESC LIMIT %s",
                    (uid, doc_id, pid, lim),
                )
            else:
                cur.execute(
                    "SELECT c.requirement_id, c.lanhu_pid, c.lanhu_doc_id, c.lanhu_page_id, "
                    "c.lanhu_url, c.page_name, c.template_id, c.case_count, c.updated_at "
                    "FROM tc_requirement_mindmaps c "
                    "WHERE c.user_id = %s AND c.lanhu_doc_id = %s AND c.case_count > 0"
                    + page_doc_filter
                    + " ORDER BY c.updated_at DESC LIMIT %s",
                    (uid, doc_id, lim),
                )
            rows = cur.fetchall() or []
        out: list[dict[str, Any]] = []
        for row in rows:
            out.append({
                "requirement_id": str(row.get("requirement_id") or ""),
                "lanhu_pid": str(row.get("lanhu_pid") or ""),
                "lanhu_doc_id": str(row.get("lanhu_doc_id") or ""),
                "lanhu_page_id": str(row.get("lanhu_page_id") or ""),
                "lanhu_url": str(row.get("lanhu_url") or ""),
                "page_name": str(row.get("page_name") or ""),
                "template_id": row.get("template_id"),
                "case_count": int(row.get("case_count") or 0),
                "updated_at": str(row.get("updated_at") or ""),
            })
        return out
    finally:
        conn.close()





def upsert_requirement_mindmap(user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    uid = str(user_id or "").strip()
    if not uid:
        raise ValueError("请先登录")
    lanhu_pid = str(data.get("lanhu_pid") or "").strip()
    lanhu_doc_id = str(data.get("lanhu_doc_id") or "").strip()
    lanhu_page_id = str(data.get("lanhu_page_id") or "").strip()
    requirement_id = str(data.get("requirement_id") or lanhu_page_id or lanhu_doc_id or "").strip()
    if not requirement_id:
        raise ValueError("无法识别需求 ID，请确认蓝湖 URL 含 docId/pageId")
    assert_page_belongs_to_requirement_doc(uid, lanhu_doc_id, lanhu_page_id)
    payload = data.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("payload 必须是对象")
    if payload.get("scope") != "mindmap":
        payload = dict(payload)
        payload["scope"] = "mindmap"
    case_count = count_mindmap_case_rows(payload)
    if case_count <= 0:
        raise ValueError("思维导图无有效用例，无法保存")
    source = str(data.get("source") or "manual_edit")
    now = _now_str()
    ensure_requirement_mindmap_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT created_at FROM tc_requirement_mindmaps "
                "WHERE user_id=%s AND lanhu_pid=%s AND lanhu_doc_id=%s AND lanhu_page_id=%s LIMIT 1",
                (uid, lanhu_pid, lanhu_doc_id, lanhu_page_id),
            )
            existing = cur.fetchone()
            created_at = str(existing.get("created_at") or now) if existing else now
            raw = json.dumps(payload, ensure_ascii=False)
            if len(raw.encode("utf-8")) > _MAX_PAYLOAD_BYTES:
                raise ValueError("思维导图数据过大，请减少用例后重试")
            cur.execute(
                "INSERT INTO tc_requirement_mindmaps ("
                "user_id, lanhu_pid, lanhu_doc_id, lanhu_page_id, requirement_id, "
                "lanhu_url, page_name, template_id, payload_json, case_count, source, "
                "updated_at, created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                "ON DUPLICATE KEY UPDATE requirement_id=VALUES(requirement_id), "
                "lanhu_url=VALUES(lanhu_url), page_name=VALUES(page_name), "
                "template_id=VALUES(template_id), payload_json=VALUES(payload_json), "
                "case_count=VALUES(case_count), source=VALUES(source), updated_at=VALUES(updated_at)",
                (
                    uid,
                    lanhu_pid,
                    lanhu_doc_id,
                    lanhu_page_id,
                    requirement_id,
                    str(data.get("lanhu_url") or ""),
                    str(data.get("page_name") or ""),
                    str(data.get("template_id") or "") or None,
                    raw,
                    case_count,
                    source,
                    now,
                    created_at,
                ),
            )
    finally:
        conn.close()
    return {
        "requirement_id": requirement_id,
        "lanhu_pid": lanhu_pid,
        "lanhu_doc_id": lanhu_doc_id,
        "lanhu_page_id": lanhu_page_id,
        "case_count": case_count,
        "updated_at": now,
    }
