# -*- coding: utf-8 -*-
"""CM 库治理看板（新查询，不改 list_cases）。"""

from __future__ import annotations

from typing import Any

from core.services.case_management.access import assert_project_viewer
from core.services.l5_bridge.schema_l5 import ensure_l5_tables
from core.services.test_cases.mysql_db import get_connection


def list_cases_board_l5(
    user_id: str,
    project_id: str,
    *,
    status: str = "",
    last_result: str = "",
    regression: str = "",
    q: str = "",
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    """筛选看板：status / last_result / regression=pending。"""
    assert_project_viewer(user_id, project_id)
    ensure_l5_tables()
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 50), 200))
    offset = (page - 1) * page_size
    where = ["c.project_id = %s", "c.is_deleted = 0"]
    params: list[Any] = [project_id]
    st = str(status or "").strip().lower()
    if st:
        where.append("c.status = %s")
        params.append(st)
    lr = str(last_result or "").strip().lower()
    if lr == "__none__":
        where.append("(c.last_result IS NULL OR c.last_result = '')")
    elif lr:
        where.append("c.last_result = %s")
        params.append(lr)
    reg = str(regression or "").strip().lower()
    if reg == "pending":
        where.append(
            "EXISTS (SELECT 1 FROM cm_case_regression_flags_l5 r "
            "WHERE r.case_id = c.id AND r.status = 'pending')"
        )
    query = str(q or "").strip()
    if query:
        where.append("c.title LIKE %s")
        params.append("%" + query[:100] + "%")
    where_sql = " AND ".join(where)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(1) AS c FROM cm_test_cases c WHERE " + where_sql,
                tuple(params),
            )
            total = int((cur.fetchone() or {}).get("c") or 0)
            cur.execute(
                "SELECT c.id, c.title, c.priority, c.status, c.last_result, c.last_executed_at, "
                "c.defect_ref, c.review_badge, c.updated_at, "
                "(SELECT r.status FROM cm_case_regression_flags_l5 r WHERE r.case_id=c.id LIMIT 1) AS regression_status "
                "FROM cm_test_cases c WHERE "
                + where_sql
                + " ORDER BY c.updated_at DESC LIMIT %s OFFSET %s",
                tuple(params + [page_size, offset]),
            )
            rows = cur.fetchall() or []
        items = []
        for r in rows:
            items.append(
                {
                    "id": str(r.get("id") or ""),
                    "title": str(r.get("title") or ""),
                    "priority": str(r.get("priority") or ""),
                    "status": str(r.get("status") or ""),
                    "last_result": str(r.get("last_result") or "") or None,
                    "last_executed_at": str(r.get("last_executed_at") or "") or None,
                    "defect_ref": str(r.get("defect_ref") or "") or None,
                    "review_badge": str(r.get("review_badge") or "") or None,
                    "regression_status": str(r.get("regression_status") or "") or None,
                    "updated_at": str(r.get("updated_at") or ""),
                    "can_enter_plan": str(r.get("status") or "") == "ready",
                }
            )
        return {"items": items, "total": total, "page": page, "page_size": page_size}
    finally:
        conn.close()


def mark_cases_ready_gate_hint_l5(case_ids: list[str]) -> dict[str, Any]:
    """只读提示：哪些可进计划。"""
    ids = [str(x).strip() for x in (case_ids or []) if str(x).strip()]
    if not ids:
        return {"ready": [], "blocked": []}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            fmt = ",".join(["%s"] * len(ids))
            cur.execute(
                "SELECT id, title, status FROM cm_test_cases WHERE id IN (" + fmt + ") AND is_deleted=0",
                tuple(ids),
            )
            rows = cur.fetchall() or []
        ready, blocked = [], []
        for r in rows:
            item = {"id": str(r.get("id") or ""), "title": str(r.get("title") or ""), "status": str(r.get("status") or "")}
            if item["status"] == "ready":
                ready.append(item)
            else:
                blocked.append(item)
        return {"ready": ready, "blocked": blocked}
    finally:
        conn.close()
