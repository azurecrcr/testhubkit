# -*- coding: utf-8 -*-
"""P8 自测：overrides 真差异化 + denied 审计；清理 L5SELFTEST_P8_。"""
from __future__ import annotations

import time
import traceback

PREFIX = "L5SELFTEST_P8_" + time.strftime("%Y%m%d%H%M%S")


def main() -> int:
    from core.services.l5_bridge.schema_l5 import ensure_l5_tables
    from core.services.case_management import project_db, member_db
    from core.services.case_management.access import CmAccessError
    from core.services.defect_management import defect_db
    from core.services.l5_bridge.access_l5 import (
        assert_l5_action,
        assert_l5_defect_action_l5,
        save_project_l5_settings_l5,
        get_project_l5_settings,
    )
    from core.services.l5_bridge.activity_l5 import list_audit_filtered_l5
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
    if not uid or not uid2:
        print("need 2 users")
        return 2

    proj = project_db.create_project(uid, name=PREFIX, description="p8")
    pid = str(proj.get("id") or "")
    member_db.invite_member(
        project_id=pid, target_user_id=uid2, role="viewer", invited_by=uid
    )

    # overrides off: viewer cannot plan.release via editor path - gate.evaluate ok for viewer
    assert_l5_action(uid2, pid, "gate.evaluate")
    try:
        assert_l5_action(uid2, pid, "plan.release")
        raise AssertionError("viewer should fail plan.release when overrides off")
    except CmAccessError:
        pass

    # overrides on: plan.release requires owner by default
    save_project_l5_settings_l5(
        uid,
        pid,
        {
            "overrides_enabled": True,
            "reporter_can_edit": False,
            "action_min_roles": {"plan.release": "owner"},
        },
    )
    s = get_project_l5_settings(pid)
    assert s.get("overrides_enabled") is True
    try:
        assert_l5_action(uid2, pid, "plan.release")
        raise AssertionError("viewer should fail owner-gated release")
    except CmAccessError:
        pass
    assert_l5_action(uid, pid, "plan.release")

    # reporter_can_edit=false blocks viewer reporter enrich
    d = defect_db.create_defect(
        project_id=pid, reporter_id=uid2, title=PREFIX + "_d", description="x"
    )
    did = str(d.get("id") or "")
    try:
        assert_l5_defect_action_l5(uid2, did, "defect.enrich")
        raise AssertionError("reporter viewer should be denied enrich")
    except CmAccessError:
        pass

    save_project_l5_settings_l5(uid, pid, {"reporter_can_edit": True})
    assert_l5_defect_action_l5(uid2, did, "defect.enrich")

    denied = list_audit_filtered_l5(uid, pid, action="access.denied", limit=20)
    assert len(denied) >= 1
    print("P8_SELFTEST_OK", len(denied))

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM cm_projects WHERE name LIKE %s", (PREFIX + "%",))
            for i in [str(r.get("id")) for r in (cur.fetchall() or [])]:
                cur.execute("DELETE FROM dm_defects WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_project_audit_l5 WHERE project_id=%s", (i,))
                cur.execute("DELETE FROM cm_project_l5_settings WHERE project_id=%s", (i,))
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
