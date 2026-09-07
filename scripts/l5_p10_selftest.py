# -*- coding: utf-8 -*-
"""P10 自测：决策度量 MTTR；清理 L5SELFTEST_P10_。"""
from __future__ import annotations

import time
import traceback

PREFIX = "L5SELFTEST_P10_" + time.strftime("%Y%m%d%H%M%S")


def main() -> int:
    from core.services.l5_bridge.schema_l5 import ensure_l5_tables
    from core.services.case_management import project_db, member_db
    from core.services.defect_management import defect_db
    from core.services.l5_bridge.regression_flow_l5 import update_defect_status_l5
    from core.services.l5_bridge.metrics_l5 import project_metrics_decision_l5
    from core.services.test_cases.mysql_db import get_connection

    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM cm_projects ORDER BY updated_at DESC LIMIT 1")
            uid = str((cur.fetchone() or {}).get("user_id") or "")
            cur.execute(
                "SELECT id FROM hub_users WHERE id <> %s ORDER BY created_at DESC LIMIT 1",
                (uid,),
            )
            uid2 = str((cur.fetchone() or {}).get("id") or "")
    finally:
        conn.close()
    if not uid:
        return 2
    proj = project_db.create_project(uid, name=PREFIX, description="p10")
    pid = str(proj.get("id") or "")
    if uid2:
        try:
            member_db.invite_member(
                project_id=pid, target_user_id=uid2, role="member", invited_by=uid
            )
        except Exception:
            conn = get_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT IGNORE INTO cm_project_members "
                        "(id, project_id, user_id, role, invited_by, created_at) "
                        "VALUES (REPLACE(UUID(),'-',''), %s, %s, 'member', %s, NOW())",
                        (pid, uid2, uid),
                    )
            finally:
                conn.close()
    else:
        print("need uid2 for team_ready")
        return 2

    d = defect_db.create_defect(
        project_id=pid, reporter_id=uid, title=PREFIX + "_d", description="x", severity="major"
    )
    did = str(d.get("id") or "")
    update_defect_status_l5(uid, did, status="closed", mark_regression=False)

    m = project_metrics_decision_l5(uid, pid)
    assert m.get("decision") is True
    assert m.get("mttr_minutes") is not None, m
    assert int(m.get("closed_or_resolved") or 0) >= 1, m
    print("P10_SELFTEST_OK", m.get("mttr_minutes"), m.get("closed_or_resolved"))

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM cm_projects WHERE name LIKE %s", (PREFIX + "%",))
            for i in [str(r.get("id")) for r in (cur.fetchall() or [])]:
                cur.execute("SELECT id FROM dm_defects WHERE project_id=%s", (i,))
                for row in cur.fetchall() or []:
                    cur.execute(
                        "DELETE FROM dm_defect_activity_l5 WHERE defect_id=%s",
                        (str(row.get("id")),),
                    )
                cur.execute("DELETE FROM dm_defects WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_project_members WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_projects WHERE id=%s", (i,))
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
