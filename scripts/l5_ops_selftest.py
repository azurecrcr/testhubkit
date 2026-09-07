# -*- coding: utf-8 -*-
"""自测：治理看板 / 缺陷 enrich·relate / 审计 / 度量 detail；清理 L5SELFTEST_OPS_。"""
from __future__ import annotations

import time
import traceback

PREFIX = "L5SELFTEST_OPS_" + time.strftime("%Y%m%d%H%M%S")


def main() -> int:
    from core.services.l5_bridge.schema_l5 import ensure_l5_tables
    from core.services.case_management import project_db, case_db, member_db
    from core.services.defect_management import defect_db
    from core.services.l5_bridge.governance_l5 import list_cases_board_l5
    from core.services.l5_bridge.activity_l5 import (
        update_defect_enrich_l5,
        relate_defects_l5,
        list_relations_l5,
        list_defect_activity_l5,
        list_audit_l5,
        write_audit_l5,
    )
    from core.services.l5_bridge.metrics_l5 import (
        project_metrics_l5,
        project_metrics_detail_l5,
    )
    from core.services.test_cases.mysql_db import get_connection

    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM cm_projects ORDER BY updated_at DESC LIMIT 1")
            row = cur.fetchone()
            uid = str((row or {}).get("user_id") or "")
            if not uid:
                cur.execute("SELECT id FROM hub_users ORDER BY created_at DESC LIMIT 1")
                uid = str((cur.fetchone() or {}).get("id") or "")
            cur.execute(
                "SELECT id FROM hub_users WHERE id <> %s ORDER BY created_at DESC LIMIT 1",
                (uid,),
            )
            uid2 = str((cur.fetchone() or {}).get("id") or "")
    finally:
        conn.close()
    if not uid:
        print("no user")
        return 2

    proj = project_db.create_project(uid, name=PREFIX, description="ops selftest")
    pid = str(proj.get("id") or "")
    if uid2:
        try:
            member_db.invite_member(
                project_id=pid, target_user_id=uid2, role="member", invited_by=uid
            )
        except Exception:  # noqa: BLE001
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

    case_db.create_case(
        uid, pid, {"title": PREFIX + "_ready", "status": "ready", "priority": "P1"}
    )
    case_db.create_case(
        uid, pid, {"title": PREFIX + "_draft", "status": "draft", "priority": "P2"}
    )

    board = list_cases_board_l5(uid, pid, status="ready")
    assert board.get("total") >= 1, "board ready"
    assert all(i.get("can_enter_plan") for i in board.get("items") or []), "gate"

    d1 = defect_db.create_defect(
        project_id=pid,
        reporter_id=uid,
        title=PREFIX + "_d1",
        description="ops",
        severity="major",
    )
    d2 = defect_db.create_defect(
        project_id=pid,
        reporter_id=uid,
        title=PREFIX + "_d2",
        description="ops2",
        severity="minor",
    )
    did1 = str(d1.get("id") or "")
    did2 = str(d2.get("id") or "")

    updated = update_defect_enrich_l5(
        defect_id=did1,
        actor_id=uid,
        repro_steps="1. open\n2. click",
        actual_result="crash",
        expected_result="ok",
        environment="qa-chrome",
        module="login",
        find_phase="回归",
        defect_type="功能",
        priority="P1",
    )
    assert (updated.get("repro_steps") or "").startswith("1."), "enrich"
    acts = list_defect_activity_l5(did1)
    assert any(a.get("action") == "enrich_update" for a in acts), "activity"

    relate_defects_l5(did1, did2, "related")
    rels = list_relations_l5(did1)
    assert len(rels) >= 1, "relations"

    write_audit_l5(pid, uid, "ops_selftest", ref_type="project", ref_id=pid)
    audits = list_audit_l5(uid, pid, limit=20)
    assert any(a.get("action") == "ops_selftest" for a in audits), "audit"

    m0 = project_metrics_l5(uid, pid)
    m1 = project_metrics_detail_l5(uid, pid)
    assert m0.get("cases", {}).get("total") >= 2
    assert "exec_trend_14d" in m1
    # 旧方法不被污染
    assert "exec_trend_14d" not in m0

    print("OPS_SELFTEST_OK", pid[:8], "cases", m1["cases"]["total"])

    # cleanup
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM cm_projects WHERE name LIKE %s", (PREFIX + "%",))
            ids = [str(r.get("id")) for r in (cur.fetchall() or [])]
            for i in ids:
                cur.execute(
                    "SELECT id FROM dm_defects WHERE project_id=%s", (i,)
                )
                dids = [str(r.get("id")) for r in (cur.fetchall() or [])]
                for d in dids:
                    cur.execute("DELETE FROM dm_defect_activity_l5 WHERE defect_id=%s", (d,))
                    cur.execute("DELETE FROM dm_defect_watchers_l5 WHERE defect_id=%s", (d,))
                    cur.execute(
                        "DELETE FROM dm_defect_relations_l5 WHERE from_id=%s OR to_id=%s",
                        (d, d),
                    )
                    cur.execute("DELETE FROM dm_defect_case_links WHERE defect_id=%s", (d,))
                cur.execute("DELETE FROM dm_defects WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_project_audit_l5 WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_case_revisions_l5 WHERE case_id IN (SELECT id FROM cm_test_cases WHERE project_id=%s)", (i,))
                cur.execute("DELETE FROM cm_executions WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_test_cases WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_project_members WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_projects WHERE id=%s", (i,))
            print("cleaned", len(ids))
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
