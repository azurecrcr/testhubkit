# -*- coding: utf-8 -*-
"""深链与详情增强（新方法，不改旧 get_case/get_defect）。"""

from __future__ import annotations

from typing import Any

from core.services.case_management.case_db import get_case
from core.services.defect_management import defect_db
from core.services.l5_bridge.schema_l5 import ensure_l5_tables
from core.services.test_cases.mysql_db import get_connection


def build_case_deep_link(project_id: str, case_id: str) -> str:
    return "/tool/case-management?project_id=%s&case_id=%s" % (
        str(project_id or "").strip(),
        str(case_id or "").strip(),
    )


def build_defect_deep_link(project_id: str, defect_id: str) -> str:
    return "/tool/defect-management?project_id=%s&defect_id=%s" % (
        str(project_id or "").strip(),
        str(defect_id or "").strip(),
    )


def list_defect_ids_for_case_l5(case_id: str) -> list[str]:
    ensure_l5_tables()
    cid = str(case_id or "").strip()
    if not cid:
        return []
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT defect_id FROM dm_defect_case_links WHERE case_id = %s",
                (cid,),
            )
            return [str(r.get("defect_id") or "") for r in (cur.fetchall() or []) if r.get("defect_id")]
    finally:
        conn.close()


def list_defects_for_case_l5(case_id: str) -> list[dict[str, Any]]:
    ids = list_defect_ids_for_case_l5(case_id)
    out = []
    for did in ids:
        item = defect_db.get_defect(did)
        if item:
            out.append(
                {
                    "id": item.get("id"),
                    "display_id": item.get("display_id"),
                    "title": item.get("title"),
                    "status": item.get("status"),
                    "severity": item.get("severity"),
                    "project_id": item.get("project_id"),
                    "deep_link": build_defect_deep_link(
                        str(item.get("project_id") or ""), str(item.get("id") or "")
                    ),
                }
            )
    return out


def serialize_case_l5(case_id: str) -> dict[str, Any] | None:
    """新序列化：在旧 get_case 结果上追加 defects / deep_links / regression。"""
    from core.services.l5_bridge.execution_defect import get_regression_flag_l5

    case = get_case(case_id)
    if not case:
        return None
    ensure_l5_tables()
    defects = list_defects_for_case_l5(case_id)
    pid = str(case.get("project_id") or "")
    flag = get_regression_flag_l5(case_id)
    item = dict(case)
    item["defects"] = defects
    item["defect_ids"] = [d.get("id") for d in defects]
    item["regression"] = flag
    item["deep_links"] = {
        "case": build_case_deep_link(pid, case_id),
        "defects": [d.get("deep_link") for d in defects if d.get("deep_link")],
    }
    return item


def serialize_defect_l5(defect_id: str) -> dict[str, Any] | None:
    """新序列化：追加 cases_summary（含 last_result）与深链。"""
    item = defect_db.get_defect(defect_id)
    if not item:
        return None
    ensure_l5_tables()
    pid = str(item.get("project_id") or "")
    case_ids = item.get("case_ids") or []
    briefs = []
    conn = get_connection()
    try:
        if case_ids:
            with conn.cursor() as cur:
                fmt = ",".join(["%s"] * len(case_ids))
                cur.execute(
                    "SELECT id, title, last_result, status, is_deleted FROM cm_test_cases "
                    "WHERE project_id = %s AND id IN (" + fmt + ")",
                    tuple([pid] + list(case_ids)),
                )
                rows = {str(r.get("id") or ""): r for r in (cur.fetchall() or [])}
            for cid in case_ids:
                r = rows.get(str(cid)) or {}
                briefs.append(
                    {
                        "id": cid,
                        "title": str(r.get("title") or cid),
                        "last_result": str(r.get("last_result") or "") or None,
                        "status": str(r.get("status") or "") or None,
                        "is_deleted": int(r.get("is_deleted") or 0) == 1,
                        "deep_link": build_case_deep_link(pid, str(cid)),
                    }
                )
    finally:
        conn.close()
    out = dict(item)
    out["cases"] = briefs
    out["cases_summary"] = briefs
    out["deep_link"] = build_defect_deep_link(pid, defect_id)
    out["no_attachments"] = True
    # enrich optional L5 columns if present on row via raw query
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT source_execution_id, repro_steps, expected_result, actual_result, "
                "environment, module, find_phase, defect_type, priority, evidence_url "
                "FROM dm_defects WHERE id = %s LIMIT 1",
                (defect_id,),
            )
            row = cur.fetchone() or {}
        for k in (
            "source_execution_id",
            "repro_steps",
            "expected_result",
            "actual_result",
            "environment",
            "module",
            "find_phase",
            "defect_type",
            "priority",
            "evidence_url",
        ):
            if k in row:
                out[k] = row.get(k)
    finally:
        conn.close()
    return out
