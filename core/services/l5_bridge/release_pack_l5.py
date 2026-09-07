# -*- coding: utf-8 -*-
"""发版追溯包（内部审计用，无外部集成）。"""

from __future__ import annotations

import time
from typing import Any

from core.services.case_management.access import assert_project_viewer
from core.services.l5_bridge.activity_l5 import list_audit_l5
from core.services.l5_bridge.plan_run_l5 import get_plan_l5, list_runs_l5
from core.services.l5_bridge.schema_l5 import ensure_l5_tables
from core.services.test_cases.mysql_db import get_connection


def build_release_pack_l5(
    user_id: str,
    project_id: str,
    *,
    plan_id: str,
) -> dict[str, Any]:
    assert_project_viewer(user_id, project_id)
    ensure_l5_tables()
    plan = get_plan_l5(user_id, plan_id)
    if str(plan.get("project_id")) != str(project_id):
        raise ValueError("计划不属于该项目")
    runs = list_runs_l5(user_id, plan_id)
    red: list[str] = []
    cases = []
    defects = []
    pending = []
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT DISTINCT c.id, c.title, c.status, c.last_result, c.defect_ref "
                "FROM cm_test_cases c "
                "JOIN cm_test_run_items_l5 i ON i.case_id=c.id "
                "JOIN cm_test_runs_l5 r ON r.id=i.run_id "
                "WHERE r.plan_id=%s AND c.is_deleted=0",
                (plan_id,),
            )
            for r in cur.fetchall() or []:
                row = {
                    "id": str(r.get("id") or ""),
                    "title": str(r.get("title") or ""),
                    "status": str(r.get("status") or ""),
                    "last_result": str(r.get("last_result") or "") or None,
                    "defect_ref": str(r.get("defect_ref") or "") or None,
                }
                cases.append(row)
                if not row["last_result"]:
                    red.append("未执行：" + row["title"])
                elif row["last_result"] == "fail" and not row["defect_ref"]:
                    red.append("失败未转缺陷：" + row["title"])
            cur.execute(
                "SELECT id, number, title, status, severity FROM dm_defects WHERE project_id=%s",
                (project_id,),
            )
            for r in cur.fetchall() or []:
                defects.append(
                    {
                        "id": str(r.get("id") or ""),
                        "display_id": "D-%s" % int(r.get("number") or 0),
                        "title": str(r.get("title") or ""),
                        "status": str(r.get("status") or ""),
                        "severity": str(r.get("severity") or ""),
                    }
                )
            cur.execute(
                "SELECT case_id, defect_id FROM cm_case_regression_flags_l5 "
                "WHERE project_id=%s AND status='pending'",
                (project_id,),
            )
            for r in cur.fetchall() or []:
                pending.append(
                    {"case_id": str(r.get("case_id") or ""), "defect_id": str(r.get("defect_id") or "")}
                )
                red.append("待回归 case=%s" % r.get("case_id"))
    finally:
        conn.close()
    audits = list_audit_l5(user_id, project_id, limit=30)
    return {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
        "generated_by": user_id,
        "project_id": project_id,
        "plan": {
            "id": plan.get("id"),
            "name": plan.get("name"),
            "release_status": plan.get("release_status") or "open",
        },
        "runs": [{"id": r.get("id"), "name": r.get("name"), "status": r.get("status")} for r in runs],
        "cases": cases,
        "defects": defects,
        "pending_regression": pending,
        "audit_summary": audits,
        "red_items": red,
        "no_attachments": True,
        "no_external_integration": True,
        "workbench_frozen": True,
    }
