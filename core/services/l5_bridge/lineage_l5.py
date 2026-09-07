# -*- coding: utf-8 -*-
"""血缘聚合（新方法，不改 get_case/get_defect）。"""

from __future__ import annotations

from typing import Any

from core.services.case_management.access import assert_project_viewer
from core.services.l5_bridge.nav_meta_l5 import serialize_case_l5, serialize_defect_l5
from core.services.l5_bridge.schema_l5 import ensure_l5_tables
from core.services.test_cases.mysql_db import get_connection


def get_case_lineage_l5(user_id: str, case_id: str) -> dict[str, Any]:
    ensure_l5_tables()
    item = serialize_case_l5(case_id)
    if not item:
        raise ValueError("用例不存在")
    pid = str(item.get("project_id") or "")
    assert_project_viewer(user_id, pid)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_executions WHERE case_id=%s",
                (case_id,),
            )
            row = cur.fetchone() or {}
            execution_total = int(row.get("c") or 0)
            # 抽屉预览只需少量；完整列表由前端弹窗走 executions 接口
            cur.execute(
                "SELECT id, result, comment, executed_at, defect_id "
                "FROM cm_executions WHERE case_id=%s ORDER BY executed_at DESC LIMIT 3",
                (case_id,),
            )
            exes = cur.fetchall() or []
    finally:
        conn.close()
    source = str(item.get("source") or "")
    source_ref = str(item.get("source_ref") or "")
    workbench_hint = None
    if source == "workbench" and source_ref:
        parts = source_ref.split("|")
        # 仅给前端可读说明；不回传 source_ref 原文（无展示价值，易干扰）
        workbench_hint = {
            "lanhu_pid": parts[0] if len(parts) > 0 else "",
            "lanhu_doc_id": parts[1] if len(parts) > 1 else "",
            "lanhu_page_id": parts[2] if len(parts) > 2 else "",
        }
    return {
        "case": {
            "id": item.get("id"),
            "title": item.get("title"),
            "status": item.get("status"),
            "priority": item.get("priority"),
            "last_result": item.get("last_result"),
            "defect_ref": item.get("defect_ref"),
            "review_badge": item.get("review_badge"),
            "project_id": pid,
        },
        "workbench": workbench_hint,
        "defects": item.get("defects") or [],
        "regression": item.get("regression"),
        "execution_total": execution_total,
        "executions": [
            {
                "id": str(r.get("id") or ""),
                "result": str(r.get("result") or ""),
                "comment": str(r.get("comment") or ""),
                "executed_at": str(r.get("executed_at") or ""),
                "defect_id": str(r.get("defect_id") or "") or None,
            }
            for r in exes
        ],
        "deep_links": item.get("deep_links") or {},
        "no_workbench_writeback": True,
    }


def get_defect_lineage_l5(user_id: str, defect_id: str) -> dict[str, Any]:
    from core.services.defect_management.access import assert_defect_viewer
    from core.services.l5_bridge.activity_l5 import list_defect_activity_l5

    ensure_l5_tables()
    item = serialize_defect_l5(defect_id)
    if not item:
        raise ValueError("缺陷不存在")
    pid = str(item.get("project_id") or "")
    assert_defect_viewer(user_id, pid, require_team=True)
    acts = list_defect_activity_l5(defect_id, limit=15)
    return {
        "defect": {
            "id": item.get("id"),
            "display_id": item.get("display_id"),
            "title": item.get("title"),
            "status": item.get("status"),
            "severity": item.get("severity"),
            "priority": item.get("priority"),
            "project_id": pid,
            "environment": item.get("environment"),
            "module": item.get("module"),
            "evidence_url": item.get("evidence_url"),
            "no_attachments": True,
        },
        "cases_summary": item.get("cases_summary") or [],
        "activity_preview": acts,
        "deep_link": item.get("deep_link"),
    }
