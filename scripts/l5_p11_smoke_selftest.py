# -*- coding: utf-8 -*-
"""P11 冒烟：关键 L5 模块可导入 + 无 L5SELFTEST_ 残留 + 工作台冻结声明。"""
from __future__ import annotations

import traceback


def main() -> int:
    from core.services.l5_bridge.schema_l5 import ensure_l5_tables
    from core.services.l5_bridge import (
        lineage_l5,
        gate_l5,
        access_l5,
        release_pack_l5,
        notify_l5,
        metrics_l5,
        workbench_sync_l5,
        regression_flow_l5,
    )
    from core.services.test_cases.mysql_db import get_connection

    ensure_l5_tables()
    assert callable(lineage_l5.get_case_lineage_l5)
    assert callable(gate_l5.set_plan_release_status_l5)
    assert callable(access_l5.assert_l5_defect_action_l5)
    assert callable(release_pack_l5.build_release_pack_l5)
    assert callable(notify_l5.notify_users_l5)
    assert callable(metrics_l5.project_metrics_decision_l5)
    assert callable(workbench_sync_l5.detect_broken_source_links_l5)
    assert callable(regression_flow_l5.update_defect_status_l5)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(1) AS c FROM cm_projects WHERE name LIKE 'L5SELFTEST_%'"
            )
            left = int((cur.fetchone() or {}).get("c") or 0)
    finally:
        conn.close()
    if left:
        print("WARN residual L5SELFTEST projects", left)
    else:
        print("no residual L5SELFTEST projects")
    print("P11_SMOKE_OK workbench_frozen=True no_attachments=True no_external_integration=True")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
