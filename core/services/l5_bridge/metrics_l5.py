# -*- coding: utf-8 -*-
"""项目度量与缺陷导出（只读）。"""

from __future__ import annotations

import csv
import io
from typing import Any

from core.services.case_management.access import assert_project_viewer
from core.services.l5_bridge.schema_l5 import ensure_l5_tables
from core.services.test_cases.mysql_db import get_connection


def project_metrics_l5(user_id: str, project_id: str) -> dict[str, Any]:
    assert_project_viewer(user_id, project_id)
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(1) AS c FROM cm_test_cases WHERE project_id=%s AND is_deleted=0",
                (project_id,),
            )
            case_total = int((cur.fetchone() or {}).get("c") or 0)
            cur.execute(
                "SELECT status, COUNT(1) AS c FROM cm_test_cases "
                "WHERE project_id=%s AND is_deleted=0 GROUP BY status",
                (project_id,),
            )
            by_status = {str(r.get("status") or ""): int(r.get("c") or 0) for r in (cur.fetchall() or [])}
            cur.execute(
                "SELECT last_result, COUNT(1) AS c FROM cm_test_cases "
                "WHERE project_id=%s AND is_deleted=0 AND last_result IS NOT NULL GROUP BY last_result",
                (project_id,),
            )
            by_last = {str(r.get("last_result") or ""): int(r.get("c") or 0) for r in (cur.fetchall() or [])}
            cur.execute(
                "SELECT COUNT(1) AS c FROM cm_executions WHERE project_id=%s "
                "AND executed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
                (project_id,),
            )
            exec_30 = int((cur.fetchone() or {}).get("c") or 0)
            cur.execute(
                "SELECT result, COUNT(1) AS c FROM cm_executions WHERE project_id=%s "
                "AND executed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY result",
                (project_id,),
            )
            exec_by = {str(r.get("result") or ""): int(r.get("c") or 0) for r in (cur.fetchall() or [])}
            pass_n = exec_by.get("pass", 0)
            pass_rate = round(100.0 * pass_n / exec_30, 1) if exec_30 else 0.0
            cur.execute(
                "SELECT status, COUNT(1) AS c FROM dm_defects WHERE project_id=%s GROUP BY status",
                (project_id,),
            )
            defect_by = {str(r.get("status") or ""): int(r.get("c") or 0) for r in (cur.fetchall() or [])}
            cur.execute(
                "SELECT COUNT(1) AS c FROM cm_case_regression_flags_l5 "
                "WHERE project_id=%s AND status='pending'",
                (project_id,),
            )
            pending_reg = int((cur.fetchone() or {}).get("c") or 0)
            # reopen rough: closed then open activity not tracked historically → use status counts
            cur.execute(
                "SELECT COUNT(1) AS c FROM dm_defects WHERE project_id=%s",
                (project_id,),
            )
            defect_total = int((cur.fetchone() or {}).get("c") or 0)
        return {
            "project_id": project_id,
            "cases": {"total": case_total, "by_status": by_status, "by_last_result": by_last},
            "executions_30d": {"total": exec_30, "by_result": exec_by, "pass_rate": pass_rate},
            "defects": {"total": defect_total, "by_status": defect_by},
            "pending_regression": pending_reg,
        }
    finally:
        conn.close()


def project_metrics_detail_l5(user_id: str, project_id: str) -> dict[str, Any]:
    """新方法：在基础度量上附加近14日执行趋势（不改 project_metrics_l5）。"""
    base = project_metrics_l5(user_id, project_id)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT DATE(executed_at) AS d, result, COUNT(1) AS c "
                "FROM cm_executions WHERE project_id=%s "
                "AND executed_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY) "
                "GROUP BY DATE(executed_at), result ORDER BY d ASC",
                (project_id,),
            )
            rows = cur.fetchall() or []
        trend_map: dict[str, dict[str, int]] = {}
        for r in rows:
            d = str(r.get("d") or "")
            if hasattr(r.get("d"), "strftime"):
                d = r.get("d").strftime("%Y-%m-%d")
            trend_map.setdefault(d, {"pass": 0, "fail": 0, "blocked": 0, "skip": 0, "total": 0})
            res = str(r.get("result") or "")
            cnt = int(r.get("c") or 0)
            if res in trend_map[d]:
                trend_map[d][res] += cnt
            trend_map[d]["total"] += cnt
        trend = [{"date": k, **v} for k, v in sorted(trend_map.items())]
        base = dict(base)
        base["exec_trend_14d"] = trend
        return base
    finally:
        conn.close()


def project_metrics_decision_l5(user_id: str, project_id: str) -> dict[str, Any]:
    """新方法：决策度量（MTTR / 未关闭严重度），不改 project_metrics_l5。"""
    base = project_metrics_detail_l5(user_id, project_id)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT created_at, updated_at, status, severity FROM dm_defects WHERE project_id=%s",
                (project_id,),
            )
            rows = cur.fetchall() or []
        mttrs = []
        open_by_sev: dict[str, int] = {}
        closed_n = 0
        for r in rows:
            sev = str(r.get("severity") or "normal")
            st = str(r.get("status") or "")
            if st not in ("closed", "rejected"):
                open_by_sev[sev] = open_by_sev.get(sev, 0) + 1
            if st in ("closed", "resolved"):
                closed_n += 1
                try:
                    c0 = r.get("created_at")
                    c1 = r.get("updated_at")
                    if c0 and c1 and hasattr(c0, "timestamp") and hasattr(c1, "timestamp"):
                        # 以分钟存中位数，前端按阈值切换展示
                        mttrs.append((c1.timestamp() - c0.timestamp()) / 60.0)
                except Exception:  # noqa: BLE001
                    pass
        mttr_minutes = None
        if mttrs:
            mttrs.sort()
            mttr_minutes = round(mttrs[len(mttrs) // 2], 2)
        base = dict(base)
        base["mttr_minutes"] = mttr_minutes
        base["mttr_hours"] = (
            round(mttr_minutes / 60.0, 2) if mttr_minutes is not None else None
        )
        base["open_by_severity"] = open_by_sev
        base["closed_or_resolved"] = closed_n
        base["decision"] = True
        return base
    finally:
        conn.close()


def export_defects_csv_l5(user_id: str, project_id: str) -> str:
    from core.services.defect_management.defect_db import _load_handlers_map, _user_brief

    assert_project_viewer(user_id, project_id)
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, number, title, status, severity, priority, reporter_id, "
                "assignee_id, created_at, updated_at "
                "FROM dm_defects WHERE project_id=%s ORDER BY number ASC",
                (project_id,),
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()

    ids = [str(r.get("id") or "") for r in rows if r.get("id")]
    handlers_map = _load_handlers_map(ids) if ids else {}

    def _person_label(uid: str) -> str:
        uid = str(uid or "").strip()
        if not uid:
            return ""
        brief = _user_brief(uid)
        return str(
            brief.get("display_name")
            or brief.get("label")
            or brief.get("email")
            or brief.get("phone_masked")
            or uid
        )

    def _handlers_label(defect_id: str, assignee_id: str) -> str:
        items = handlers_map.get(defect_id) or []
        labels: list[str] = []
        for h in items:
            label = str(
                h.get("display_name")
                or h.get("label")
                or h.get("email")
                or h.get("user_id")
                or ""
            ).strip()
            if label:
                labels.append(label)
        if not labels and assignee_id:
            labels.append(_person_label(assignee_id))
        return "; ".join(labels)

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "display_id",
            "title",
            "status",
            "severity",
            "priority",
            "reporter",
            "handlers",
            "created_at",
            "updated_at",
        ]
    )
    for r in rows:
        did = str(r.get("id") or "")
        w.writerow(
            [
                "D-%s" % int(r.get("number") or 0),
                r.get("title") or "",
                r.get("status") or "",
                r.get("severity") or "",
                r.get("priority") or "",
                _person_label(str(r.get("reporter_id") or "")),
                _handlers_label(did, str(r.get("assignee_id") or "")),
                r.get("created_at") or "",
                r.get("updated_at") or "",
            ]
        )
    return buf.getvalue()
