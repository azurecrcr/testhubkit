# -*- coding: utf-8 -*-
"""补齐缺口自测：证据强制、断链检测；清理 L5SELFTEST_GAP_。"""
from __future__ import annotations

import time
import traceback

PREFIX = "L5SELFTEST_GAP_" + time.strftime("%Y%m%d%H%M%S")


def main() -> int:
    from core.services.l5_bridge.schema_l5 import ensure_l5_tables
    from core.services.case_management import project_db, case_db, member_db
    from core.services.defect_management import defect_db
    from core.services.l5_bridge.activity_l5 import (
        update_defect_enrich_l5,
        validate_defect_evidence_l5,
    )
    from core.services.l5_bridge.workbench_sync_l5 import detect_broken_source_links_l5
    from core.services.l5_bridge.metrics_l5 import project_metrics_decision_l5
    from core.services.test_cases.mysql_db import get_connection

    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM cm_projects ORDER BY updated_at DESC LIMIT 1")
            uid = str((cur.fetchone() or {}).get("user_id") or "")
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
        return 2

    proj = project_db.create_project(uid, name=PREFIX, description="gap")
    pid = str(proj.get("id") or "")
    if uid2:
        try:
            member_db.invite_member(
                project_id=pid, target_user_id=uid2, role="member", invited_by=uid
            )
        except Exception:
            pass

    case_db.create_case(
        uid,
        pid,
        {
            "title": PREFIX + "_wb",
            "status": "draft",
            "source": "workbench",
            "source_ref": "badref",
        },
    )
    broken = detect_broken_source_links_l5(uid, pid)
    assert broken.get("broken_count", 0) >= 1, broken
    print("[gap] broken-sources ok", broken["broken_count"])

    d = defect_db.create_defect(
        project_id=pid, reporter_id=uid, title=PREFIX + "_d", description="x", severity="minor"
    )
    did = str(d.get("id") or "")
    try:
        update_defect_enrich_l5(
            defect_id=did,
            actor_id=uid,
            repro_steps="ab",
            expected_result="cd",
            actual_result="ef",
            environment="gh",
            enforce_evidence=True,
        )
        raise AssertionError("should fail evidence")
    except ValueError:
        pass
    update_defect_enrich_l5(
        defect_id=did,
        actor_id=uid,
        repro_steps="repro steps long",
        expected_result="expect ok now",
        actual_result="actual fail xx",
        environment="qa-chrome",
        evidence_url="https://example.com/x",
        enforce_evidence=True,
    )
    validate_defect_evidence_l5(did, policy="strict")
    m = project_metrics_decision_l5(uid, pid)
    assert m.get("decision") is True
    print("[gap] evidence+metrics ok")

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM cm_projects WHERE name LIKE %s", (PREFIX + "%",))
            ids = [str(r.get("id")) for r in (cur.fetchall() or [])]
            for i in ids:
                cur.execute("SELECT id FROM dm_defects WHERE project_id=%s", (i,))
                for drow in cur.fetchall() or []:
                    did2 = str(drow.get("id"))
                    cur.execute("DELETE FROM dm_defect_activity_l5 WHERE defect_id=%s", (did2,))
                cur.execute("DELETE FROM dm_defects WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_test_cases WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_project_members WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_projects WHERE id=%s", (i,))
            print("cleaned", len(ids))
    finally:
        conn.close()
    print("GAP_SELFTEST_OK")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
