# -*- coding: utf-8 -*-
"""双向追溯：links 真源 → 同步 defect_ref（新方法，不改 set_case_links 本体）。"""

from __future__ import annotations

from typing import Any

from core.services.defect_management import defect_db
from core.services.l5_bridge.schema_l5 import ensure_l5_tables
from core.services.test_cases.mysql_db import get_connection


def _display_ids_for_case(case_id: str) -> list[str]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT d.number FROM dm_defect_case_links l "
                "JOIN dm_defects d ON d.id = l.defect_id "
                "WHERE l.case_id = %s ORDER BY d.number ASC",
                (case_id,),
            )
            return ["D-%s" % int(r.get("number") or 0) for r in (cur.fetchall() or [])]
    finally:
        conn.close()


def rebuild_defect_ref_for_case_l5(case_id: str) -> str:
    ensure_l5_tables()
    cid = str(case_id or "").strip()
    refs = _display_ids_for_case(cid)
    ref_str = ",".join(refs)[:128] if refs else None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cm_test_cases SET defect_ref = %s WHERE id = %s",
                (ref_str, cid),
            )
    finally:
        conn.close()
    return ref_str or ""


def set_case_links_and_sync_refs_l5(
    *, defect_id: str, project_id: str, case_ids: list[str]
) -> dict[str, Any]:
    """调用现有 set_case_links，再同步受影响用例的 defect_ref。"""
    ensure_l5_tables()
    did = str(defect_id or "").strip()
    # 关联前的旧用例集合
    old_ids: list[str] = []
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT case_id FROM dm_defect_case_links WHERE defect_id = %s",
                (did,),
            )
            old_ids = [str(r.get("case_id") or "") for r in (cur.fetchall() or [])]
    finally:
        conn.close()

    result = defect_db.set_case_links(
        defect_id=did, project_id=project_id, case_ids=case_ids
    )
    new_ids = [str(x) for x in (result.get("case_ids") or [])]
    affected = set(old_ids) | set(new_ids)
    refs = {}
    for cid in affected:
        if cid:
            refs[cid] = rebuild_defect_ref_for_case_l5(cid)
    return {"case_ids": new_ids, "defect_refs": refs}
