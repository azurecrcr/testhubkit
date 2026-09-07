# -*- coding: utf-8 -*-
"""L5 自测脚本：在容器内跑，创建 L5SELFTEST_ 数据并清理。"""
from __future__ import annotations

import sys
import time
import traceback

PREFIX = "L5SELFTEST_PALL_" + time.strftime("%Y%m%d%H%M%S")


def main() -> int:
    from core.services.l5_bridge.schema_l5 import ensure_l5_tables
    from core.services.case_management import project_db, case_db, member_db
    from core.services.defect_management import defect_db
    from core.services.l5_bridge.case_link_sync_l5 import set_case_links_and_sync_refs_l5
    from core.services.l5_bridge.execution_defect import (
        create_execution_and_maybe_defect_l5,
        get_regression_flag_l5,
        after_defect_status_change_l5,
    )
    from core.services.l5_bridge.plan_run_l5 import (
        create_plan_l5,
        create_run_l5,
        add_run_items_l5,
        execute_run_item_l5,
        list_run_items_l5,
        run_stats_l5,
    )
    from core.services.l5_bridge.revision_baseline_l5 import save_case_revision_l5
    from core.services.l5_bridge.metrics_l5 import project_metrics_l5, export_defects_csv_l5
    from core.services.l5_bridge.nav_meta_l5 import serialize_case_l5, serialize_defect_l5
    from core.services.l5_bridge.activity_l5 import (
        update_defect_enrich_l5,
        list_defect_activity_l5,
    )

    ensure_l5_tables()
    print("[ok] ensure_l5_tables")

    # 找一个真实用户：取 cm_projects 最新 owner
    from core.services.test_cases.mysql_db import get_connection

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT user_id FROM cm_projects ORDER BY updated_at DESC LIMIT 1"
            )
            row = cur.fetchone()
            if not row:
                cur.execute("SELECT id FROM users ORDER BY created_at DESC LIMIT 1")
                row = cur.fetchone()
                uid = str((row or {}).get("id") or "")
            else:
                uid = str(row.get("user_id") or "")
            cur.execute(
                "SELECT id FROM users WHERE id <> %s ORDER BY created_at DESC LIMIT 1",
                (uid,),
            )
            row2 = cur.fetchone()
            uid2 = str((row2 or {}).get("id") or "")
    finally:
        conn.close()
    if not uid:
        print("[fail] no user")
        return 2
    print("[ok] users", uid[:8], uid2[:8] if uid2 else "-")

    proj = project_db.create_project(uid, name=PREFIX, description="l5 selftest")
    pid = str(proj.get("id") or "")
    print("[ok] project", pid[:8])

    # 确保二人团队（缺陷门槛）
    if uid2:
        try:
            member_db.add_member(pid, uid2, "editor", invited_by=uid)
        except Exception:
            try:
                # 有的实现是 invite
                pass
            except Exception:
                pass
        # 直接插入成员表兜底
        try:
            from core.services.case_management.member_db import ensure_owner_member

            ensure_owner_member(pid, uid)
        except Exception:
            pass
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT IGNORE INTO cm_project_members "
                    "(project_id, user_id, role, invited_by, created_at) "
                    "VALUES (%s,%s,'editor',%s,NOW())",
                    (pid, uid2, uid),
                )
        finally:
            conn.close()

    # suite optional
    suite_id = None
    try:
        from core.services.case_management import suite_db

        suite = suite_db.create_suite(uid, pid, {"name": "L5Suite"})
        suite_id = str(suite.get("id") or "") or None
    except Exception as e:
        print("[warn] suite", e)

    c1 = case_db.create_case(
        uid,
        pid,
        {
            "title": PREFIX + "_case_ready",
            "status": "ready",
            "priority": "P1",
            "suite_id": suite_id,
            "steps": [{"action": "step1", "expected": "ok"}],
        },
    )
    c2 = case_db.create_case(
        uid,
        pid,
        {
            "title": PREFIX + "_case_draft",
            "status": "draft",
            "priority": "P2",
            "suite_id": suite_id,
        },
    )
    cid1 = str(c1.get("id") or "")
    cid2 = str(c2.get("id") or "")
    print("[ok] cases", cid1[:8], cid2[:8])

    # 旧执行路径回归
    from core.services.case_management.execution_db import create_execution

    old_exe = create_execution(uid, cid1, result="pass", comment="old path")
    assert old_exe.get("result") == "pass"
    print("[ok] legacy execution")

    # L5 fail + defect
    out = create_execution_and_maybe_defect_l5(
        uid, cid1, result="fail", comment="boom", create_defect=True, defect_opts={"severity": "major"}
    )
    defect = out.get("defect") or {}
    did = str(defect.get("id") or "")
    assert did, "defect not created"
    print("[ok] fail->defect", defect.get("display_id"))

    # links sync
    set_case_links_and_sync_refs_l5(defect_id=did, project_id=pid, case_ids=[cid1, cid2])
    c1b = case_db.get_case(cid1)
    assert c1b.get("defect_ref"), "defect_ref empty"
    print("[ok] defect_ref", c1b.get("defect_ref"))

    sc = serialize_case_l5(cid1)
    sd = serialize_defect_l5(did)
    assert sc and sd and sd.get("cases_summary") is not None
    print("[ok] serialize l5")

    # enrich no attachment
    update_defect_enrich_l5(
        defect_id=did,
        actor_id=uid,
        repro_steps="1 open app",
        actual_result="crash",
        environment="chrome",
    )
    print("[ok] enrich")

    # status -> regression
    prev = defect.get("status")
    # open -> confirmed -> in_progress -> resolved
    d = defect_db.update_defect(defect_id=did, actor_id=uid, status="confirmed")
    d = defect_db.update_defect(defect_id=did, actor_id=uid, status="in_progress")
    d = defect_db.update_defect(defect_id=did, actor_id=uid, status="resolved")
    after_defect_status_change_l5(d, previous_status="in_progress")
    flag = get_regression_flag_l5(cid1)
    assert flag and flag.get("status") == "pending"
    print("[ok] regression pending")

    # plan/run: only ready cases
    plan = create_plan_l5(uid, pid, name=PREFIX + "_plan")
    run = create_run_l5(uid, str(plan.get("id")), name="run1", environment="qa")
    added = add_run_items_l5(uid, str(run.get("id")), [cid1, cid2])
    assert added.get("added") == 1  # draft skipped
    items = list_run_items_l5(uid, str(run.get("id")))
    assert len(items) == 1
    execute_run_item_l5(uid, str(items[0].get("id")), result="pass", comment="reg ok")
    stats = run_stats_l5(uid, str(run.get("id")))
    assert stats.get("pass") == 1
    print("[ok] plan/run", stats)

    save_case_revision_l5(uid, cid1)
    print("[ok] case revision")

    acts = list_defect_activity_l5(did)
    print("[ok] activity", len(acts))

    metrics = project_metrics_l5(uid, pid)
    csv_text = export_defects_csv_l5(uid, pid)
    assert "display_id" in csv_text
    print("[ok] metrics cases", metrics.get("cases", {}).get("total"), "csv_len", len(csv_text))

    # cleanup
    try:
        defect_db.delete_defect(did)
    except Exception:
        pass
    try:
        # force delete project if available
        project_db.delete_project(uid, pid, force=True)
    except TypeError:
        try:
            project_db.delete_project(uid, pid)
        except Exception as e:
            print("[warn] delete project", e)
            # soft fallback: rename
            try:
                project_db.update_project(uid, pid, {"name": PREFIX + "_DONE_DELETE"})
            except Exception:
                pass
    except Exception as e:
        print("[warn] delete project", e)

    # purge leftover by name prefix
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM cm_projects WHERE name LIKE %s", (PREFIX + "%",))
            ids = [str(r.get("id")) for r in (cur.fetchall() or [])]
            for i in ids:
                cur.execute("DELETE FROM dm_defect_case_links WHERE defect_id IN (SELECT id FROM dm_defects WHERE project_id=%s)", (i,))
                cur.execute("DELETE FROM dm_defect_handlers WHERE defect_id IN (SELECT id FROM dm_defects WHERE project_id=%s)", (i,))
                cur.execute("DELETE FROM dm_defect_comments WHERE defect_id IN (SELECT id FROM dm_defects WHERE project_id=%s)", (i,))
                cur.execute("DELETE FROM dm_defect_activity_l5 WHERE defect_id IN (SELECT id FROM dm_defects WHERE project_id=%s)", (i,))
                cur.execute("DELETE FROM dm_defects WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_executions WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_case_regression_flags_l5 WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_test_run_items_l5 WHERE run_id IN (SELECT id FROM cm_test_runs_l5 WHERE project_id=%s)", (i,))
                cur.execute("DELETE FROM cm_test_runs_l5 WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_test_plans_l5 WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_case_revisions_l5 WHERE case_id IN (SELECT id FROM cm_test_cases WHERE project_id=%s)", (i,))
                cur.execute("DELETE FROM cm_test_cases WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_suites WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_project_members WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_projects WHERE id=%s", (i,))
                cur.execute("DELETE FROM dm_project_counters WHERE project_id=%s", (i,))
            print("[ok] cleaned projects", len(ids))
    finally:
        conn.close()

    print("ALL_L5_SELFTEST_PASSED")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
