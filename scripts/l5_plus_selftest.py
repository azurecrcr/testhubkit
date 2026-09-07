# -*- coding: utf-8 -*-
"""L5+ P1–P10 合并自测；清理 L5SELFTEST_PLUS_ 数据。不改工作台。"""
from __future__ import annotations

import time
import traceback

PREFIX = "L5SELFTEST_PLUS_" + time.strftime("%Y%m%d%H%M%S")


def _cleanup(prefix: str) -> int:
    from core.services.test_cases.mysql_db import get_connection

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM cm_projects WHERE name LIKE %s", (prefix + "%",))
            ids = [str(r.get("id")) for r in (cur.fetchall() or [])]
            for i in ids:
                cur.execute("SELECT id FROM dm_defects WHERE project_id=%s", (i,))
                dids = [str(r.get("id")) for r in (cur.fetchall() or [])]
                for d in dids:
                    cur.execute("DELETE FROM dm_defect_activity_l5 WHERE defect_id=%s", (d,))
                    cur.execute("DELETE FROM dm_defect_watchers_l5 WHERE defect_id=%s", (d,))
                    cur.execute(
                        "DELETE FROM dm_defect_relations_l5 WHERE from_id=%s OR to_id=%s", (d, d)
                    )
                    cur.execute("DELETE FROM dm_defect_case_links WHERE defect_id=%s", (d,))
                cur.execute("DELETE FROM dm_defects WHERE project_id=%s", (i,))
                cur.execute(
                    "DELETE FROM cm_test_run_items_l5 WHERE run_id IN "
                    "(SELECT id FROM cm_test_runs_l5 WHERE project_id=%s)",
                    (i,),
                )
                cur.execute("DELETE FROM cm_test_runs_l5 WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_test_plans_l5 WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_case_regression_flags_l5 WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_project_audit_l5 WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_workbench_sync_batches_l5 WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_project_l5_settings WHERE project_id=%s", (i,))
                cur.execute(
                    "DELETE FROM cm_case_revisions_l5 WHERE case_id IN "
                    "(SELECT id FROM cm_test_cases WHERE project_id=%s)",
                    (i,),
                )
                cur.execute("DELETE FROM cm_executions WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_test_cases WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_project_members WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_projects WHERE id=%s", (i,))
            return len(ids)
    finally:
        conn.close()


def main() -> int:
    from core.services.l5_bridge.schema_l5 import ensure_l5_tables
    from core.services.case_management import project_db, case_db, member_db
    from core.services.defect_management import defect_db
    from core.services.l5_bridge.case_link_sync_l5 import set_case_links_and_sync_refs_l5
    from core.services.l5_bridge.lineage_l5 import get_case_lineage_l5, get_defect_lineage_l5
    from core.services.l5_bridge.regression_flow_l5 import (
        update_defect_status_l5,
        list_pending_regression_l5,
    )
    from core.services.l5_bridge.execution_defect import create_execution_and_maybe_defect_l5
    from core.services.l5_bridge.plan_run_l5 import (
        create_plan_l5,
        create_run_l5,
        add_run_items_l5,
        execute_run_item_l5,
        list_run_items_l5,
        build_run_report_l5,
    )
    from core.services.l5_bridge.gate_l5 import set_plan_release_status_l5
    from core.services.l5_bridge.activity_l5 import (
        update_defect_enrich_l5,
        validate_defect_evidence_l5,
        list_audit_filtered_l5,
        export_audit_csv_l5,
    )
    from core.services.l5_bridge.metrics_l5 import project_metrics_decision_l5
    from core.services.l5_bridge.release_pack_l5 import build_release_pack_l5
    from core.services.l5_bridge.access_l5 import assert_l5_action, get_project_l5_settings
    from core.services.l5_bridge.workbench_sync_l5 import list_sync_batches_l5
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

    proj = project_db.create_project(uid, name=PREFIX, description="l5plus")
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

    c_ready = case_db.create_case(
        uid,
        pid,
        {
            "title": PREFIX + "_ready",
            "status": "ready",
            "priority": "P1",
            "source": "workbench",
            "source_ref": "pid|doc|page",
        },
    )
    cid = str(c_ready.get("id") or "")

    # P1 lineage
    lin = get_case_lineage_l5(uid, cid)
    assert lin.get("case", {}).get("id") == cid
    print("[P1] lineage ok")

    # fail + defect
    exe_pack = create_execution_and_maybe_defect_l5(
        uid, cid, result="fail", comment="boom", create_defect=True
    )
    did = str((exe_pack.get("defect") or {}).get("id") or "")
    assert did
    set_case_links_and_sync_refs_l5(defect_id=did, project_id=pid, case_ids=[cid])
    dlin = get_defect_lineage_l5(uid, did)
    assert dlin.get("defect", {}).get("id") == did
    print("[P1] defect lineage ok")

    # P7 enrich evidence
    update_defect_enrich_l5(
        defect_id=did,
        actor_id=uid,
        repro_steps="step one two",
        expected_result="should pass",
        actual_result="did fail xx",
        environment="qa-chrome",
        evidence_url="https://example.com/evidence",
        enforce_evidence=True,
    )
    validate_defect_evidence_l5(did, policy="text_only")
    print("[P7] evidence ok")

    # P2 regression on close
    update_defect_status_l5(uid, did, status="closed", mark_regression=True)
    pending = list_pending_regression_l5(uid, pid)
    assert pending.get("total", 0) >= 1
    # clear via pass
    create_execution_and_maybe_defect_l5(uid, cid, result="pass", comment="regressed")
    pending2 = list_pending_regression_l5(uid, pid)
    assert pending2.get("total", 0) == 0
    print("[P2] regression loop ok")

    # P4 release status — manual only
    plan = create_plan_l5(uid, pid, name=PREFIX + "_plan")
    plan_id = str(plan.get("id") or "")
    run = create_run_l5(uid, plan_id, name="R1", run_type="regression", environment="qa")
    run_id = str(run.get("id") or "")
    assert str(run.get("run_type") or "") in ("regression", "custom")
    add_run_items_l5(uid, run_id, [cid])
    items = list_run_items_l5(uid, run_id)
    assert items
    execute_run_item_l5(uid, str(items[0]["id"]), result="pass")
    report = build_run_report_l5(uid, run_id)
    assert report.get("stats", {}).get("pass") >= 1
    print("[P3] report ok")

    set_plan_release_status_l5(uid, plan_id, "released")
    set_plan_release_status_l5(uid, plan_id, "passed")
    set_plan_release_status_l5(uid, plan_id, "failed")
    set_plan_release_status_l5(uid, plan_id, "open")
    print("[P4] release status ok")

    # P6 batches list (empty ok)
    batches = list_sync_batches_l5(uid, pid)
    assert isinstance(batches, list)
    print("[P6] sync batches ok")

    # P8 audit
    assert_l5_action(uid, pid, "plan.release")
    audits = list_audit_filtered_l5(uid, pid, limit=50)
    assert len(audits) >= 1
    csv_txt = export_audit_csv_l5(uid, pid)
    assert "action" in csv_txt
    settings = get_project_l5_settings(pid)
    assert "overrides_enabled" in settings
    print("[P8] audit ok")

    # P10
    metrics = project_metrics_decision_l5(uid, pid)
    assert metrics.get("decision") is True
    pack = build_release_pack_l5(uid, pid, plan_id=plan_id)
    assert "red_items" in pack and "release_status" in (pack.get("plan") or {})
    print("[P10] metrics+pack ok")

    n = _cleanup(PREFIX)
    print("L5PLUS_SELFTEST_OK cleaned", n)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        try:
            _cleanup(PREFIX)
        except Exception:
            pass
        raise SystemExit(1)
