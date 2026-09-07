"""删除用户蓝湖需求文档时，级联物理清理关联 DB 数据（与单页删除逻辑隔离）。"""
from __future__ import annotations

from typing import Any

from core.services.test_cases.lanhu_page_cache_db import ensure_lanhu_page_cache_table
from core.services.test_cases.lanhu_requirement_service import _parse_lanhu_url
from core.services.test_cases.page_generation_lock_db import ensure_page_generation_lock_table
from core.services.test_cases.requirement_case_db import ensure_requirement_case_table
from core.services.test_cases.stash_db import get_connection
from core.services.test_cases.user_lanhu_docs_db import (
    _normalize_lanhu_doc_url,
    extract_lanhu_doc_key,
    get_user_lanhu_doc,
)


def _resolve_lanhu_identifiers(doc: dict[str, Any]) -> dict[str, str]:
    url = str(doc.get("url") or doc.get("lanhu_url") or "").strip()
    norm_url = _normalize_lanhu_doc_url(url)
    doc_key = str(doc.get("lanhuDocKey") or doc.get("lanhu_doc_key") or "").strip()
    if not doc_key:
        doc_key = extract_lanhu_doc_key(url)
    lanhu_doc_id = ""
    lanhu_pid = ""
    if norm_url or url:
        try:
            params = _parse_lanhu_url(norm_url or url)
            lanhu_doc_id = str(params.get("doc_id") or "").strip()
            lanhu_pid = str(params.get("project_id") or "").strip()
        except ValueError:
            pass
    if doc_key.startswith("pid:") and not lanhu_pid:
        lanhu_pid = doc_key[4:].strip()
    return {
        "internal_id": str(doc.get("id") or "").strip(),
        "lanhu_doc_id": lanhu_doc_id,
        "lanhu_pid": lanhu_pid,
        "lanhu_doc_key": doc_key,
        "lanhu_url_norm": norm_url or url,
    }


def purge_user_lanhu_doc_related_data(user_id: str, doc: dict[str, Any]) -> dict[str, int]:
    """物理删除指定需求文档下的用例、页面需求缓存、生成锁等。"""
    uid = str(user_id or "").strip()
    if not uid or not doc:
        return {}
    ids = _resolve_lanhu_identifiers(doc)
    ensure_requirement_case_table()
    ensure_lanhu_page_cache_table()
    ensure_page_generation_lock_table()

    stats = {
        "requirement_cases": 0,
        "page_cache": 0,
        "page_gen_locks": 0,
    }
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            case_clauses: list[str] = []
            case_params: list[Any] = [uid]
            if ids["lanhu_doc_id"]:
                case_clauses.append("(lanhu_doc_id = %s)")
                case_params.append(ids["lanhu_doc_id"])
            if ids["lanhu_pid"]:
                case_clauses.append("(lanhu_pid = %s AND (lanhu_doc_id = '' OR lanhu_doc_id IS NULL))")
                case_params.append(ids["lanhu_pid"])
            if ids["lanhu_url_norm"]:
                case_clauses.append("(lanhu_url LIKE %s)")
                case_params.append(ids["lanhu_url_norm"] + "%")
            if case_clauses:
                cur.execute(
                    "DELETE FROM tc_requirement_cases WHERE user_id = %s AND ("
                    + " OR ".join(case_clauses)
                    + ")",
                    tuple(case_params),
                )
                stats["requirement_cases"] = int(cur.rowcount or 0)

            cache_doc_ids: list[str] = []
            if ids["lanhu_doc_id"]:
                cache_doc_ids.append(ids["lanhu_doc_id"])
            if ids["internal_id"] and ids["internal_id"] not in cache_doc_ids:
                cache_doc_ids.append(ids["internal_id"])
            if cache_doc_ids:
                placeholders = ", ".join(["%s"] * len(cache_doc_ids))
                cur.execute(
                    f"DELETE FROM tc_lanhu_page_content_cache "
                    f"WHERE user_id = %s AND doc_id IN ({placeholders})",
                    tuple([uid, *cache_doc_ids]),
                )
                stats["page_cache"] = int(cur.rowcount or 0)

            lock_clauses: list[str] = []
            lock_params: list[Any] = [uid]
            if ids["lanhu_doc_id"]:
                lock_clauses.append("lanhu_doc_id = %s")
                lock_params.append(ids["lanhu_doc_id"])
            if ids["lanhu_url_norm"]:
                lock_clauses.append("lanhu_url LIKE %s")
                lock_params.append(ids["lanhu_url_norm"] + "%")
            if lock_clauses:
                cur.execute(
                    "DELETE FROM tc_user_page_generation_lock WHERE user_id = %s AND ("
                    + " OR ".join(lock_clauses)
                    + ")",
                    tuple(lock_params),
                )
                stats["page_gen_locks"] = int(cur.rowcount or 0)

        conn.commit()
        return stats
    finally:
        conn.close()


def purge_user_lanhu_doc_by_id(user_id: str, doc_id: str) -> dict[str, Any]:
    uid = str(user_id or "").strip()
    did = str(doc_id or "").strip()
    if not uid or not did:
        return {"found": False, "purged": {}}
    doc = get_user_lanhu_doc(uid, did)
    if not doc:
        return {"found": False, "purged": {}}
    return {"found": True, "purged": purge_user_lanhu_doc_related_data(uid, doc)}
