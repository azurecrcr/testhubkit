# -*- coding: utf-8 -*-
"""回归强制闭环封装（新 API 用；不改旧 update_defect）。"""

from __future__ import annotations

from typing import Any

from core.services.defect_management import defect_db
from core.services.defect_management.access import assert_defect_editor
from core.services.l5_bridge.activity_l5 import record_defect_activity_l5, write_audit_l5
from core.services.l5_bridge.execution_defect import (
    apply_regression_execution_l5,
    clear_regression_flag_l5,
    get_regression_flag_l5,
    mark_cases_pending_regression_l5,
)
from core.services.l5_bridge.schema_l5 import ensure_l5_tables
from core.services.test_cases.mysql_db import get_connection


def update_defect_status_l5(
    user_id: str,
    defect_id: str,
    *,
    status: str,
    mark_regression: bool = True,
) -> dict[str, Any]:
    """新方法：状态变更 + 可选关单回归标记。旧 update_defect 行为不变。"""
    ensure_l5_tables()
    item = defect_db.get_defect(defect_id)
    if not item:
        raise ValueError("缺陷不存在")
    pid = str(item.get("project_id") or "")
    assert_defect_editor(user_id, pid, require_team=True)
    prev = str(item.get("status") or "")
    updated = defect_db.update_defect(defect_id=defect_id, actor_id=user_id, status=status)
    new_st = str((updated or {}).get("status") or status)
    record_defect_activity_l5(
        defect_id,
        user_id,
        "status_change_l5",
        {"from": prev, "to": new_st, "mark_regression": bool(mark_regression)},
    )
    write_audit_l5(
        pid,
        user_id,
        "defect.status",
        ref_type="defect",
        ref_id=defect_id,
        payload={"from": prev, "to": new_st},
    )
    if mark_regression and new_st in ("resolved", "closed") and new_st != prev:
        marked = mark_cases_pending_regression_l5(defect_id)
        write_audit_l5(
            pid,
            user_id,
            "regression.pending",
            ref_type="defect",
            ref_id=defect_id,
            payload=marked,
        )
        try:
            from core.services.l5_bridge.notify_l5 import notify_regression_pending_l5

            notify_regression_pending_l5(user_id, defect_id)
        except Exception:  # noqa: BLE001
            pass
    if new_st != prev:
        try:
            from core.services.l5_bridge.notify_l5 import notify_defect_status_l5

            notify_defect_status_l5(
                user_id,
                defect_id,
                status=new_st,
                previous_status=prev,
            )
        except Exception:  # noqa: BLE001
            pass
    return updated or item


def clear_regression_on_pass_l5(
    user_id: str, case_id: str, execution_id: str
) -> dict[str, Any]:
    """新方法：显式清回归（通常由 L5 执行路径调用）。"""
    from core.services.case_management.access import assert_project_editor
    from core.services.case_management.case_db import get_case

    case = get_case(case_id)
    if not case:
        raise ValueError("用例不存在")
    assert_project_editor(user_id, str(case.get("project_id") or ""))
    out = apply_regression_execution_l5(user_id, execution_id)
    if out.get("applied") and out.get("action") == "cleared":
        write_audit_l5(
            str(case.get("project_id") or ""),
            user_id,
            "regression.cleared",
            ref_type="case",
            ref_id=case_id,
            payload={"execution_id": execution_id, "defect_id": out.get("defect_id")},
        )
    return out


def list_pending_regression_l5(user_id: str, project_id: str) -> dict[str, Any]:
    from core.services.case_management.access import assert_project_viewer

    assert_project_viewer(user_id, project_id)
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT r.case_id, r.defect_id, r.status, r.updated_at, c.title "
                "FROM cm_case_regression_flags_l5 r "
                "LEFT JOIN cm_test_cases c ON c.id=r.case_id "
                "WHERE r.project_id=%s AND r.status='pending' ORDER BY r.updated_at DESC",
                (project_id,),
            )
            rows = cur.fetchall() or []
        items = [
            {
                "case_id": str(r.get("case_id") or ""),
                "title": str(r.get("title") or ""),
                "defect_id": str(r.get("defect_id") or ""),
                "status": str(r.get("status") or ""),
                "updated_at": str(r.get("updated_at") or ""),
                "flag": get_regression_flag_l5(str(r.get("case_id") or "")),
            }
            for r in rows
        ]
        return {"items": items, "total": len(items)}
    finally:
        conn.close()


def force_clear_regression_l5(user_id: str, case_id: str) -> dict[str, Any]:
    """运维用：手动清标记（写审计）。"""
    from core.services.case_management.access import assert_project_editor
    from core.services.case_management.case_db import get_case

    case = get_case(case_id)
    if not case:
        raise ValueError("用例不存在")
    pid = str(case.get("project_id") or "")
    assert_project_editor(user_id, pid)
    clear_regression_flag_l5(case_id)
    write_audit_l5(pid, user_id, "regression.force_clear", ref_type="case", ref_id=case_id)
    return {"ok": True, "case_id": case_id}
