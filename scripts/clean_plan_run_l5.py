# -*- coding: utf-8 -*-
"""清空测试计划 / 轮次 / 条目历史数据。"""
from __future__ import annotations

from core.services.test_cases.mysql_db import get_connection


def main() -> int:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for sql in (
                "DELETE FROM cm_test_run_items_l5",
                "DELETE FROM cm_test_runs_l5",
                "DELETE FROM cm_test_plans_l5",
                "DELETE FROM cm_project_audit_l5 WHERE action IN ("
                "'run.create','plan.bind_baseline','plan.release_status')",
            ):
                cur.execute(sql)
                print(sql.split()[2], cur.rowcount)
        conn.commit()
    finally:
        conn.close()
    print("CLEAN_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
