"""按蓝湖需求（pageId/docId）持久化测试用例表格。"""
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
    "CREATE TABLE IF NOT EXISTS tc_requirement_cases ("
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
    " row_count INT NOT NULL DEFAULT 0,"
    " source VARCHAR(32) NOT NULL DEFAULT 'manual_edit',"
    " updated_at DATETIME NOT NULL,"
    " created_at DATETIME NOT NULL,"
    " UNIQUE KEY uk_user_requirement (user_id, lanhu_pid, lanhu_doc_id, lanhu_page_id),"
    " INDEX idx_user_req_id (user_id, requirement_id),"
    " INDEX idx_user_updated (user_id, updated_at)"
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


def _row_has_case_content(row: Any, *, name_col_idx: int = 0) -> bool:
    if not isinstance(row, list):
        return bool(str(row or "").strip())
    if name_col_idx < len(row) and str(row[name_col_idx] or "").strip():
        return True
    for i, cell in enumerate(row):
        if i == name_col_idx:
            continue
        if str(cell or "").strip():
            return True
    return False


def sanitize_requirement_case_payload(
    payload: dict[str, Any],
    *,
    dedupe_exact_rows: bool = False,
) -> dict[str, Any]:
    """Remove placeholder empty rows; optionally drop exact duplicate rows."""
    if not isinstance(payload, dict):
        return payload if isinstance(payload, dict) else {}
    columns = payload.get("columns") or []
    rows = payload.get("rows") or []
    if not isinstance(rows, list):
        return dict(payload)
    name_idx = _resolve_case_name_col_idx(columns if isinstance(columns, list) else [])
    seen: set[str] = set()
    cleaned: list[Any] = []
    for row in rows:
        if not _row_has_case_content(row, name_col_idx=name_idx):
            continue
        if dedupe_exact_rows:
            key = (
                json.dumps(row, ensure_ascii=False, sort_keys=True)
                if isinstance(row, (list, dict))
                else str(row)
            )
            if key in seen:
                continue
            seen.add(key)
        cleaned.append(row)
    out = dict(payload)
    out["rows"] = cleaned
    return out


def count_requirement_case_content_rows(payload: dict[str, Any]) -> int:
    return len((sanitize_requirement_case_payload(payload).get("rows") or []))


def ensure_requirement_case_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
    finally:
        conn.close()


def get_requirement_case(
    user_id: str,
    *,
    lanhu_pid: str,
    lanhu_doc_id: str,
    lanhu_page_id: str,
) -> Optional[dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return None
    ensure_requirement_case_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT requirement_id, lanhu_pid, lanhu_doc_id, lanhu_page_id, "
                "lanhu_url, page_name, template_id, payload_json, row_count, "
                "source, updated_at, created_at FROM tc_requirement_cases "
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
            "row_count": int(row.get("row_count") or 0),
            "source": str(row.get("source") or ""),
            "updated_at": str(row.get("updated_at") or ""),
            "created_at": str(row.get("created_at") or ""),
        }
    finally:
        conn.close()


def upsert_requirement_case(user_id: str, data: dict[str, Any]) -> dict[str, Any]:
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
    merge_mode = str(data.get("merge_mode") or "overwrite").strip()
    source = str(data.get("source") or "manual_edit")
    dedupe_rows = merge_mode == "append" or source == "generation"
    now = _now_str()
    ensure_requirement_case_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT created_at, payload_json, row_count FROM tc_requirement_cases "
                "WHERE user_id=%s AND lanhu_pid=%s AND lanhu_doc_id=%s AND lanhu_page_id=%s LIMIT 1",
                (uid, lanhu_pid, lanhu_doc_id, lanhu_page_id),
            )
            existing = cur.fetchone()
            created_at = str(existing.get("created_at") or now) if existing else now
            if merge_mode == "append" and existing and existing.get("payload_json"):
                try:
                    existing_payload = json.loads(existing["payload_json"])
                    if isinstance(existing_payload, dict) and isinstance(existing_payload.get("rows"), list):
                        existing_payload = sanitize_requirement_case_payload(
                            existing_payload, dedupe_exact_rows=True
                        )
                        payload = sanitize_requirement_case_payload(payload, dedupe_exact_rows=True)
                        new_rows = payload.get("rows") or []
                        existing_rows = existing_payload.get("rows") or []
                        seen = set()
                        merged = []
                        for row in existing_rows + new_rows:
                            key = json.dumps(row, ensure_ascii=False, sort_keys=True) if isinstance(row, (list, dict)) else str(row)
                            if key not in seen:
                                seen.add(key)
                                merged.append(row)
                        payload["rows"] = merged
                        if isinstance(existing_payload.get("columns"), list) and existing_payload.get("columns"):
                            payload["columns"] = existing_payload["columns"]
                except (json.JSONDecodeError, TypeError):
                    pass
            payload = sanitize_requirement_case_payload(payload, dedupe_exact_rows=dedupe_rows)
            row_count = count_requirement_case_content_rows(payload)
            allow_clear = bool(
                data.get("allow_clear")
                or data.get("force_clear")
                or data.get("allow_empty_overwrite")
            )
            existing_row_count = 0
            if existing:
                existing_row_count = int(existing.get("row_count") or 0)
                if existing_row_count <= 0 and existing.get("payload_json"):
                    try:
                        existing_payload = json.loads(existing["payload_json"])
                        if isinstance(existing_payload, dict):
                            existing_row_count = count_requirement_case_content_rows(existing_payload)
                    except (json.JSONDecodeError, TypeError):
                        existing_row_count = 0
            # 防护：禁止用空表 overwrite 已有非空用例（避免切页/离页误保存导致数据丢失）
            if (
                existing
                and existing_row_count > 0
                and row_count == 0
                and merge_mode != "append"
                and not allow_clear
            ):
                cur.execute(
                    "UPDATE tc_requirement_cases SET "
                    "requirement_id=%s, lanhu_url=%s, page_name=%s, template_id=%s, "
                    "updated_at=%s "
                    "WHERE user_id=%s AND lanhu_pid=%s AND lanhu_doc_id=%s AND lanhu_page_id=%s",
                    (
                        requirement_id,
                        str(data.get("lanhu_url") or ""),
                        str(data.get("page_name") or ""),
                        str(data.get("template_id") or "") or None,
                        now,
                        uid,
                        lanhu_pid,
                        lanhu_doc_id,
                        lanhu_page_id,
                    ),
                )
                return {
                    "requirement_id": requirement_id,
                    "lanhu_pid": lanhu_pid,
                    "lanhu_doc_id": lanhu_doc_id,
                    "lanhu_page_id": lanhu_page_id,
                    "row_count": existing_row_count,
                    "updated_at": now,
                    "skipped_empty_overwrite": True,
                }
            raw = json.dumps(payload, ensure_ascii=False)
            if len(raw.encode("utf-8")) > _MAX_PAYLOAD_BYTES:
                raise ValueError("用例数据过大，请减少行数后重试")
            cur.execute(
                "INSERT INTO tc_requirement_cases ("
                "user_id, lanhu_pid, lanhu_doc_id, lanhu_page_id, requirement_id, "
                "lanhu_url, page_name, template_id, payload_json, row_count, source, "
                "updated_at, created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                "ON DUPLICATE KEY UPDATE requirement_id=VALUES(requirement_id), "
                "lanhu_url=VALUES(lanhu_url), page_name=VALUES(page_name), "
                "template_id=VALUES(template_id), payload_json=VALUES(payload_json), "
                "row_count=VALUES(row_count), source=VALUES(source), updated_at=VALUES(updated_at)",
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
                    row_count,
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
        "row_count": row_count,
        "updated_at": now,
    }

def list_requirement_cases_for_user(user_id: str, *, limit: int = 500) -> list[dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return []
    ensure_requirement_case_table()
    lim = max(1, min(int(limit or 500), 1000))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT requirement_id, lanhu_pid, lanhu_doc_id, lanhu_page_id, "
                "lanhu_url, page_name, template_id, row_count, updated_at "
                "FROM tc_requirement_cases "
                "WHERE user_id = %s AND row_count > 0 "
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
                "row_count": int(row.get("row_count") or 0),
                "updated_at": str(row.get("updated_at") or ""),
            })
        return out
    finally:
        conn.close()


def list_requirement_cases_for_user_in_requirement_doc(
    user_id: str,
    *,
    lanhu_pid: str = "",
    lanhu_doc_id: str = "",
    limit: int = 500,
) -> list[dict[str, Any]]:
    """按用户 + 需求文档列出已有表格用例的需求页（用例评审专用）。"""
    uid = str(user_id or "").strip()
    doc_id = str(lanhu_doc_id or "").strip()
    pid = str(lanhu_pid or "").strip()
    if not uid or not doc_id:
        return []
    ensure_requirement_case_table()
    lim = max(1, min(int(limit or 500), 1000))
    page_doc_filter = sql_exclude_pages_bound_to_other_doc("c")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if pid:
                cur.execute(
                    "SELECT c.requirement_id, c.lanhu_pid, c.lanhu_doc_id, c.lanhu_page_id, "
                    "c.lanhu_url, c.page_name, c.template_id, c.row_count, c.updated_at "
                    "FROM tc_requirement_cases c "
                    "WHERE c.user_id = %s AND c.lanhu_doc_id = %s AND c.lanhu_pid = %s "
                    "AND c.row_count > 0"
                    + page_doc_filter
                    + " ORDER BY c.updated_at DESC LIMIT %s",
                    (uid, doc_id, pid, lim),
                )
            else:
                cur.execute(
                    "SELECT c.requirement_id, c.lanhu_pid, c.lanhu_doc_id, c.lanhu_page_id, "
                    "c.lanhu_url, c.page_name, c.template_id, c.row_count, c.updated_at "
                    "FROM tc_requirement_cases c "
                    "WHERE c.user_id = %s AND c.lanhu_doc_id = %s AND c.row_count > 0"
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
                "row_count": int(row.get("row_count") or 0),
                "updated_at": str(row.get("updated_at") or ""),
            })
        return out
    finally:
        conn.close()


def delete_requirement_case_for_page(
    user_id: str,
    *,
    lanhu_pid: str,
    lanhu_doc_id: str,
    lanhu_page_id: str,
    source_only: str | None = None,
) -> bool:
    uid = str(user_id or "").strip()
    if not uid or not lanhu_page_id:
        return False
    ensure_requirement_case_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if source_only:
                cur.execute(
                    """
                    DELETE FROM tc_requirement_cases
                    WHERE user_id = %s AND lanhu_pid = %s AND lanhu_doc_id = %s
                      AND lanhu_page_id = %s AND source = %s
                    """,
                    (uid, lanhu_pid or "", lanhu_doc_id or "", lanhu_page_id, source_only),
                )
            else:
                cur.execute(
                    """
                    DELETE FROM tc_requirement_cases
                    WHERE user_id = %s AND lanhu_pid = %s AND lanhu_doc_id = %s
                      AND lanhu_page_id = %s
                    """,
                    (uid, lanhu_pid or "", lanhu_doc_id or "", lanhu_page_id),
                )
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    finally:
        conn.close()

