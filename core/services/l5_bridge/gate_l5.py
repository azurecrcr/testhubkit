# -*- coding: utf-8 -*-
"""计划发布状态（手动：发布 / 取消发布 / 通过 / 未通过）。"""

from __future__ import annotations

import time
from typing import Any

from core.services.case_management.access import assert_project_editor
from core.services.l5_bridge.activity_l5 import write_audit_l5
from core.services.l5_bridge.schema_l5 import ensure_l5_tables
from core.services.test_cases.mysql_db import get_connection

# open=未发布；released=已发布；passed=通过；failed=未通过
# releasable 为历史值，读写时归一为 released
_STATUS_SET = frozenset({"open", "released", "passed", "failed", "releasable"})
_PUBLISHED = frozenset({"released", "passed", "failed", "releasable"})


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def normalize_release_status(status: str | None) -> str:
    st = str(status or "open").strip().lower() or "open"
    if st == "releasable":
        return "released"
    if st not in ("open", "released", "passed", "failed"):
        return "open"
    return st


def is_plan_published(status: str | None) -> bool:
    return normalize_release_status(status) != "open"


def is_plan_execution_locked(status: str | None) -> bool:
    """通过 / 未通过后锁定执行与用例变更。"""
    return normalize_release_status(status) in ("passed", "failed")


def assert_plan_execution_unlocked_l5(user_id: str, *, plan_id: str | None = None, run_id: str | None = None) -> None:
    """执行/加用例前校验：已判定则拦截。"""
    from core.services.l5_bridge.plan_run_l5 import get_plan_l5, get_run_l5

    pid = str(plan_id or "").strip()
    if not pid and run_id:
        run = get_run_l5(user_id, str(run_id))
        pid = str(run.get("plan_id") or "")
    if not pid:
        return
    plan = get_plan_l5(user_id, pid)
    if is_plan_execution_locked(plan.get("release_status")):
        st = normalize_release_status(plan.get("release_status"))
        label = "通过" if st == "passed" else "未通过"
        raise ValueError("计划已判定为「%s」，执行已锁定；如需修改请先取消发布" % label)


def count_plan_executed_l5(user_id: str, plan_id: str) -> dict[str, int]:
    """统计计划下已登记结果的用例条数。"""
    from core.services.l5_bridge.plan_run_l5 import get_plan_l5

    get_plan_l5(user_id, plan_id)
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT "
                "COUNT(1) AS total, "
                "SUM(CASE WHEN i.result IS NOT NULL AND i.result<>'' THEN 1 ELSE 0 END) AS executed "
                "FROM cm_test_run_items_l5 i "
                "JOIN cm_test_runs_l5 r ON r.id=i.run_id "
                "WHERE r.plan_id=%s",
                (plan_id,),
            )
            row = cur.fetchone() or {}
        return {
            "total": int(row.get("total") or 0),
            "executed": int(row.get("executed") or 0),
        }
    finally:
        conn.close()


def _reset_plan_executions(plan_id: str) -> int:
    """清空计划下全部执行结果，用例 last_result 恢复未测。返回清空的条目数。"""
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM cm_test_runs_l5 WHERE plan_id=%s", (plan_id,))
            run_ids = [str(r.get("id") or "") for r in (cur.fetchall() or []) if r.get("id")]
            if not run_ids:
                return 0
            placeholders = ",".join(["%s"] * len(run_ids))
            cur.execute(
                "SELECT DISTINCT case_id FROM cm_test_run_items_l5 "
                "WHERE run_id IN (" + placeholders + ")",
                tuple(run_ids),
            )
            case_ids = [str(r.get("case_id") or "") for r in (cur.fetchall() or []) if r.get("case_id")]
            cur.execute(
                "SELECT COUNT(1) AS c FROM cm_test_run_items_l5 "
                "WHERE run_id IN (" + placeholders + ") "
                "AND result IS NOT NULL AND result<>''",
                tuple(run_ids),
            )
            cleared = int((cur.fetchone() or {}).get("c") or 0)
            cur.execute(
                "UPDATE cm_test_run_items_l5 "
                "SET result=NULL, comment=NULL, execution_id=NULL, updated_at=%s "
                "WHERE run_id IN (" + placeholders + ")",
                (now,) + tuple(run_ids),
            )
            cur.execute(
                "UPDATE cm_test_runs_l5 SET status='not_started', updated_at=%s "
                "WHERE plan_id=%s",
                (now, plan_id),
            )
            if case_ids:
                cph = ",".join(["%s"] * len(case_ids))
                cur.execute(
                    "UPDATE cm_test_cases "
                    "SET last_result=NULL, last_executed_at=NULL, updated_at=%s "
                    "WHERE id IN (" + cph + ")",
                    (now,) + tuple(case_ids),
                )
            return cleared
    finally:
        conn.close()


def set_plan_release_status_l5(
    user_id: str,
    plan_id: str,
    status: str,
    *,
    rules: dict | None = None,  # 兼容旧调用签名，已忽略
) -> dict[str, Any]:
    from core.services.l5_bridge.plan_run_l5 import get_plan_l5

    plan = get_plan_l5(user_id, plan_id)
    pid = str(plan.get("project_id") or "")
    assert_project_editor(user_id, pid)
    raw = str(status or "").strip().lower()
    if raw not in _STATUS_SET:
        raise ValueError("status 无效")
    st = normalize_release_status(raw)
    cur = normalize_release_status(plan.get("release_status"))

    cleared = 0
    if st == "open":
        cleared = _reset_plan_executions(plan_id)
    elif st in ("passed", "failed") and cur == "open":
        raise ValueError("请先发布计划，再标记通过/未通过")

    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur_db:
            cur_db.execute(
                "UPDATE cm_test_plans_l5 SET release_status=%s, updated_at=%s WHERE id=%s",
                (st, _now(), plan_id),
            )
    finally:
        conn.close()
    write_audit_l5(
        pid,
        user_id,
        "plan.release_status",
        ref_type="plan",
        ref_id=plan_id,
        payload={"status": st, "cleared_executions": cleared},
    )
    item = get_plan_l5(user_id, plan_id)
    item["release_status"] = normalize_release_status(item.get("release_status"))
    item["cleared_executions"] = cleared
    try:
        from core.services.l5_bridge.notify_l5 import notify_plan_release_status_l5

        notify_plan_release_status_l5(
            user_id,
            plan_id,
            status=st,
            previous_status=cur,
            cleared_executions=cleared,
        )
    except Exception:  # noqa: BLE001
        pass
    return item
