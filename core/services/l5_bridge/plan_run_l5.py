# -*- coding: utf-8 -*-
"""测试计划 / 轮次（全新表与方法，旧散装执行保留）。"""

from __future__ import annotations

import time
import uuid
from typing import Any

from core.services.case_management.access import assert_project_editor, assert_project_viewer
from core.services.l5_bridge.execution_defect import apply_regression_execution_l5
from core.services.l5_bridge.schema_l5 import ensure_l5_tables
from core.services.test_cases.mysql_db import get_connection


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _new_id() -> str:
    return uuid.uuid4().hex


def create_plan_l5(
    user_id: str,
    project_id: str,
    *,
    name: str,
    description: str = "",
) -> dict[str, Any]:
    assert_project_editor(user_id, project_id)
    ensure_l5_tables()
    name_n = str(name or "").strip()
    if not name_n:
        raise ValueError("计划名称不能为空")
    pid = _new_id()
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO cm_test_plans_l5 "
                "(id, project_id, name, description, owner_id, status, created_at, updated_at) "
                "VALUES (%s,%s,%s,%s,%s,'draft',%s,%s)",
                (pid, project_id, name_n[:200], str(description or "")[:2000], user_id, now, now),
            )
    finally:
        conn.close()
    # 一计划唯一执行集：创建时自动建默认 run
    run = create_run_l5(user_id, pid, name=name_n[:200], run_type="custom")
    plan = get_plan_l5(user_id, pid)
    plan["run_id"] = str(run.get("id") or "")
    return plan


def get_plan_run_l5(user_id: str, plan_id: str) -> dict[str, Any]:
    """取计划及其唯一 run；若缺失则补建一个（新数据约定：一计划一轮）。"""
    plan = get_plan_l5(user_id, plan_id)
    runs = list_runs_l5(user_id, plan_id)
    if runs:
        run = runs[0]
    else:
        run = create_run_l5(
            user_id,
            plan_id,
            name=str(plan.get("name") or "默认")[:200],
            run_type="custom",
        )
    return {
        "plan": plan,
        "run": run,
        "run_id": str(run.get("id") or ""),
    }


def create_plan_bundle_l5(
    user_id: str,
    project_id: str,
    *,
    name: str,
    description: str = "",
    case_ids: list[str] | None = None,
    assignee_id: str | None = None,
) -> dict[str, Any]:
    """工作台新建向导专用：创建计划并可一次性加入用例（不影响 create_plan_l5）。"""
    plan = create_plan_l5(
        user_id, project_id, name=name, description=description
    )
    run_id = str(plan.get("run_id") or "")
    add_result: dict[str, Any] = {"added": 0, "updated": 0}
    ids = [str(x).strip() for x in (case_ids or []) if str(x).strip()]
    aid = str(assignee_id or "").strip()
    if ids:
        if not aid:
            raise ValueError("添加用例时必须指定执行人")
        if not run_id:
            raise ValueError("计划执行集不存在")
        add_result = add_run_items_l5(
            user_id, run_id, ids, assignee_id=aid
        )
    return {
        "plan": plan,
        "run_id": run_id,
        "added": int(add_result.get("added") or 0),
        "updated": int(add_result.get("updated") or 0),
    }


def get_plan_l5(user_id: str, plan_id: str) -> dict[str, Any]:
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM cm_test_plans_l5 WHERE id=%s LIMIT 1", (plan_id,))
            row = cur.fetchone()
            if not row:
                raise ValueError("计划不存在")
            assert_project_viewer(user_id, str(row.get("project_id") or ""))
            item = {k: row.get(k) for k in row.keys()} if hasattr(row, "keys") else dict(row)
            try:
                from core.services.l5_bridge.gate_l5 import normalize_release_status

                item["release_status"] = normalize_release_status(item.get("release_status"))
            except Exception:  # noqa: BLE001
                pass
            return item
    finally:
        conn.close()


def list_plans_l5(user_id: str, project_id: str) -> list[dict[str, Any]]:
    """负责人看全部计划；其他成员只看「有分配给自己用例」的计划。"""
    from core.services.case_management.member_db import get_member_role

    assert_project_viewer(user_id, project_id)
    ensure_l5_tables()
    role = get_member_role(user_id, project_id) or "viewer"
    is_owner = role == "owner"
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if is_owner:
                cur.execute(
                    "SELECT * FROM cm_test_plans_l5 WHERE project_id=%s "
                    "ORDER BY updated_at DESC",
                    (project_id,),
                )
            else:
                cur.execute(
                    "SELECT DISTINCT p.* FROM cm_test_plans_l5 p "
                    "INNER JOIN cm_test_runs_l5 r ON r.plan_id = p.id "
                    "INNER JOIN cm_test_run_items_l5 i ON i.run_id = r.id "
                    "WHERE p.project_id=%s AND i.assignee_id=%s "
                    "ORDER BY p.updated_at DESC",
                    (project_id, user_id),
                )
            rows = cur.fetchall() or []
        items = [
            {k: r.get(k) for k in r.keys()} if hasattr(r, "keys") else dict(r)
            for r in rows
        ]
        try:
            from core.services.l5_bridge.gate_l5 import normalize_release_status

            for it in items:
                it["release_status"] = normalize_release_status(it.get("release_status"))
        except Exception:  # noqa: BLE001
            pass
        return items
    finally:
        conn.close()


def list_plans_payload_l5(user_id: str, project_id: str) -> dict[str, Any]:
    from core.services.case_management.member_db import get_member_role

    assert_project_viewer(user_id, project_id)
    role = get_member_role(user_id, project_id) or "viewer"
    is_owner = role == "owner"
    return {
        "items": list_plans_l5(user_id, project_id),
        "is_owner": is_owner,
        "scope": "all" if is_owner else "assigned",
    }


def delete_plan_l5(user_id: str, plan_id: str) -> dict[str, Any]:
    """删除测试计划及其执行集/条目（独立方法，不影响其它计划读写）。"""
    from core.services.case_management.access import assert_project_owner
    from core.services.case_management.project_db import touch_project

    plan = get_plan_l5(user_id, plan_id)
    project_id = str(plan.get("project_id") or "")
    assert_project_owner(user_id, project_id)
    pid = str(plan_id or "").strip()
    if not pid:
        raise ValueError("计划不存在")

    ensure_l5_tables()
    run_ids: list[str] = []
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM cm_test_runs_l5 WHERE plan_id=%s",
                (pid,),
            )
            run_rows = cur.fetchall() or []
            run_ids = [
                str(r.get("id") or "").strip()
                for r in run_rows
                if str(r.get("id") or "").strip()
            ]
            if run_ids:
                ph = ",".join(["%s"] * len(run_ids))
                cur.execute(
                    "DELETE FROM cm_test_run_items_l5 WHERE run_id IN (" + ph + ")",
                    tuple(run_ids),
                )
                # 历史执行记录保留，仅解除与本计划轮次的关联
                try:
                    cur.execute(
                        "UPDATE cm_executions SET run_id=NULL WHERE run_id IN ("
                        + ph
                        + ")",
                        tuple(run_ids),
                    )
                except Exception:  # noqa: BLE001
                    pass
                cur.execute(
                    "DELETE FROM cm_test_runs_l5 WHERE plan_id=%s",
                    (pid,),
                )
            cur.execute("DELETE FROM cm_test_plans_l5 WHERE id=%s", (pid,))
            if cur.rowcount <= 0:
                raise ValueError("计划不存在或已删除")
    finally:
        conn.close()
    touch_project(project_id)
    return {
        "ok": True,
        "plan_id": pid,
        "name": str(plan.get("name") or ""),
        "removed_runs": len(run_ids),
    }

def create_run_l5(
    user_id: str,
    plan_id: str,
    *,
    name: str,
    build_no: str = "",
    environment: str = "",
    run_type: str = "custom",
) -> dict[str, Any]:
    plan = get_plan_l5(user_id, plan_id)
    assert_project_editor(user_id, str(plan.get("project_id") or ""))
    ensure_l5_tables()
    rt = str(run_type or "custom").strip().lower()
    if rt not in ("smoke", "full", "regression", "custom"):
        rt = "custom"
    rid = _new_id()
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO cm_test_runs_l5 "
                "(id, plan_id, project_id, name, build_no, environment, run_type, status, created_at, updated_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,'not_started',%s,%s)",
                (
                    rid,
                    plan_id,
                    plan.get("project_id"),
                    str(name or "Run")[:200],
                    str(build_no or "")[:100] or None,
                    str(environment or "")[:200] or None,
                    rt,
                    now,
                    now,
                ),
            )
            cur.execute(
                "UPDATE cm_test_plans_l5 SET status='active', updated_at=%s WHERE id=%s",
                (now, plan_id),
            )
    finally:
        conn.close()
    from core.services.l5_bridge.activity_l5 import write_audit_l5

    write_audit_l5(
        str(plan.get("project_id") or ""),
        user_id,
        "run.create",
        ref_type="run",
        ref_id=rid,
        payload={"plan_id": plan_id, "run_type": rt},
    )
    return get_run_l5(user_id, rid)


def get_run_l5(user_id: str, run_id: str) -> dict[str, Any]:
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM cm_test_runs_l5 WHERE id=%s LIMIT 1", (run_id,))
            row = cur.fetchone()
            if not row:
                raise ValueError("轮次不存在")
            assert_project_viewer(user_id, str(row.get("project_id") or ""))
            return {k: row.get(k) for k in row.keys()} if hasattr(row, "keys") else dict(row)
    finally:
        conn.close()


def list_runs_l5(user_id: str, plan_id: str) -> list[dict[str, Any]]:
    """新方法：按计划列出轮次（不改 create_run_l5）。"""
    plan = get_plan_l5(user_id, plan_id)
    assert_project_viewer(user_id, str(plan.get("project_id") or ""))
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM cm_test_runs_l5 WHERE plan_id=%s ORDER BY created_at ASC LIMIT 1",
                (str(plan_id or "").strip(),),
            )
            rows = cur.fetchall() or []
        return [{k: r.get(k) for k in r.keys()} if hasattr(r, "keys") else dict(r) for r in rows]
    finally:
        conn.close()


def add_run_items_l5(
    user_id: str,
    run_id: str,
    case_ids: list[str],
    *,
    assignee_id: str | None = None,
) -> dict[str, Any]:
    from core.services.l5_bridge.gate_l5 import assert_plan_execution_unlocked_l5

    run = get_run_l5(user_id, run_id)
    assert_project_editor(user_id, str(run.get("project_id") or ""))
    assert_plan_execution_unlocked_l5(user_id, run_id=run_id)
    ids = [str(x).strip() for x in (case_ids or []) if str(x).strip()]
    aid = str(assignee_id or "").strip() or None
    if not aid:
        raise ValueError("请指定执行人")
    from core.services.case_management.member_db import get_member_role

    if not get_member_role(aid, str(run.get("project_id") or "")):
        raise ValueError("执行人必须是项目成员")
    now = _now()
    added = 0
    updated = 0
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for cid in ids:
                cur.execute(
                    "SELECT status FROM cm_test_cases WHERE id=%s AND project_id=%s AND is_deleted=0",
                    (cid, run.get("project_id")),
                )
                row = cur.fetchone()
                if not row:
                    continue
                if str(row.get("status") or "") != "ready":
                    continue
                cur.execute(
                    "SELECT id FROM cm_test_run_items_l5 WHERE run_id=%s AND case_id=%s LIMIT 1",
                    (run_id, cid),
                )
                exist = cur.fetchone()
                if exist:
                    cur.execute(
                        "UPDATE cm_test_run_items_l5 SET assignee_id=%s, updated_at=%s WHERE id=%s",
                        (aid, now, exist.get("id")),
                    )
                    updated += 1
                    continue
                cur.execute(
                    "INSERT INTO cm_test_run_items_l5 "
                    "(id, run_id, case_id, assignee_id, result, comment, execution_id, updated_at) "
                    "VALUES (%s,%s,%s,%s,NULL,NULL,NULL,%s)",
                    (_new_id(), run_id, cid, aid, now),
                )
                added += 1
    finally:
        conn.close()
    touched = added + updated
    if touched > 0 and aid:
        try:
            from core.services.l5_bridge.notify_l5 import notify_plan_cases_assigned_l5

            notify_plan_cases_assigned_l5(
                user_id,
                str(run.get("plan_id") or ""),
                assignee_id=aid,
                case_count=touched,
            )
        except Exception:  # noqa: BLE001
            pass
    return {"added": added, "updated": updated}


_ALLOWED_RESULTS = frozenset({"pass", "fail", "blocked", "skip"})


def plan_execution_progress_l5(plan_id: str) -> dict[str, int]:
    """统计计划下用例执行进度（跨该计划全部 run）。"""
    ensure_l5_tables()
    pid = str(plan_id or "").strip()
    if not pid:
        return {"total": 0, "executed": 0, "unset": 0}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT "
                "COUNT(1) AS total, "
                "SUM(CASE WHEN i.result IS NOT NULL AND i.result<>'' THEN 1 ELSE 0 END) AS executed, "
                "SUM(CASE WHEN i.result IS NULL OR i.result='' THEN 1 ELSE 0 END) AS unset_c "
                "FROM cm_test_run_items_l5 i "
                "JOIN cm_test_runs_l5 r ON r.id=i.run_id "
                "WHERE r.plan_id=%s",
                (pid,),
            )
            row = cur.fetchone() or {}
        return {
            "total": int(row.get("total") or 0),
            "executed": int(row.get("executed") or 0),
            "unset": int(row.get("unset_c") or 0),
        }
    finally:
        conn.close()


def _maybe_notify_plan_execution_done(user_id: str, plan_id: str, *, had_unset_before: bool) -> None:
    """仅在「此前未完成 → 此刻全部完成」时通知创建人一次。"""
    if not had_unset_before:
        return
    pid = str(plan_id or "").strip()
    if not pid:
        return
    prog = plan_execution_progress_l5(pid)
    if prog.get("total", 0) <= 0 or int(prog.get("unset") or 0) > 0:
        return
    try:
        from core.services.l5_bridge.notify_l5 import notify_plan_execution_done_l5

        notify_plan_execution_done_l5(user_id, pid)
    except Exception:  # noqa: BLE001
        pass


def list_run_items_l5(user_id: str, run_id: str) -> list[dict[str, Any]]:
    from core.services.case_management.member_db import get_member_role

    run = get_run_l5(user_id, run_id)
    project_id = str(run.get("project_id") or "")
    role = get_member_role(user_id, project_id) or "viewer"
    mine_only = role != "owner"
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if mine_only:
                cur.execute(
                    "SELECT i.*, c.title, c.priority, c.status AS case_status, "
                    "u.display_name AS assignee_name, u.email AS assignee_email "
                    "FROM cm_test_run_items_l5 i "
                    "LEFT JOIN cm_test_cases c ON c.id = i.case_id "
                    "LEFT JOIN hub_users u ON u.id = i.assignee_id "
                    "WHERE i.run_id=%s AND i.assignee_id=%s "
                    "ORDER BY i.updated_at DESC",
                    (run_id, user_id),
                )
            else:
                cur.execute(
                    "SELECT i.*, c.title, c.priority, c.status AS case_status, "
                    "u.display_name AS assignee_name, u.email AS assignee_email "
                    "FROM cm_test_run_items_l5 i "
                    "LEFT JOIN cm_test_cases c ON c.id = i.case_id "
                    "LEFT JOIN hub_users u ON u.id = i.assignee_id "
                    "WHERE i.run_id=%s ORDER BY i.updated_at DESC",
                    (run_id,),
                )
            rows = cur.fetchall() or []
        out = []
        for r in rows:
            item = {k: r.get(k) for k in r.keys()} if hasattr(r, "keys") else dict(r)
            name = str(item.get("assignee_name") or "").strip()
            email = str(item.get("assignee_email") or "").strip()
            item["assignee_label"] = name or email or (
                str(item.get("assignee_id") or "")[:8] if item.get("assignee_id") else ""
            )
            out.append(item)
        return out
    finally:
        conn.close()


def _assert_can_execute_run_items(
    user_id: str,
    project_id: str,
    items: list[dict[str, Any]],
) -> None:
    """负责人/编辑可执行全部；其他成员只能执行分配给自己的条目。"""
    from core.services.case_management.member_db import get_member_role, role_at_least

    role = get_member_role(user_id, project_id) or "viewer"
    if role_at_least(role, "editor"):
        return
    uid = str(user_id or "").strip()
    for it in items:
        if str(it.get("assignee_id") or "").strip() != uid:
            raise ValueError("只能执行分配给自己的用例")


def execute_run_item_l5(
    user_id: str, item_id: str, *, result: str, comment: str = ""
) -> dict[str, Any]:
    from core.services.case_management.project_db import ensure_cm_tables, touch_project

    ensure_l5_tables()
    ensure_cm_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM cm_test_run_items_l5 WHERE id=%s LIMIT 1", (item_id,))
            item = cur.fetchone()
            if not item:
                raise ValueError("轮次条目不存在")
            run_id = str(item.get("run_id") or "")
            case_id = str(item.get("case_id") or "")
            item_dict = {k: item.get(k) for k in item.keys()} if hasattr(item, "keys") else dict(item)
    finally:
        conn.close()
    run = get_run_l5(user_id, run_id)
    project_id = str(run.get("project_id") or "")
    assert_project_viewer(user_id, project_id)
    from core.services.l5_bridge.gate_l5 import assert_plan_execution_unlocked_l5

    assert_plan_execution_unlocked_l5(user_id, run_id=run_id)
    _assert_can_execute_run_items(user_id, project_id, [item_dict])
    res = str(result or "").strip().lower()
    if res not in _ALLOWED_RESULTS:
        raise ValueError("结果仅支持 pass/fail/blocked/skip")
    plan_id = str(run.get("plan_id") or "")
    had_unset_before = int(plan_execution_progress_l5(plan_id).get("unset") or 0) > 0
    now = _now()
    comment_n = str(comment or "")[:2000]
    eid = _new_id()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO cm_executions "
                "(id, case_id, project_id, user_id, result, comment, executed_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (eid, case_id, project_id, user_id, res, comment_n, now),
            )
            cur.execute(
                "UPDATE cm_executions SET run_id=%s WHERE id=%s",
                (run_id, eid),
            )
            cur.execute(
                "UPDATE cm_test_cases SET last_result=%s, last_executed_at=%s, updated_at=%s "
                "WHERE id=%s",
                (res, now, now, case_id),
            )
            cur.execute(
                "UPDATE cm_test_run_items_l5 "
                "SET result=%s, comment=%s, execution_id=%s, updated_at=%s WHERE id=%s",
                (res, comment_n, eid, now, item_id),
            )
            cur.execute(
                "UPDATE cm_test_runs_l5 SET status='in_progress', updated_at=%s WHERE id=%s",
                (now, run_id),
            )
    finally:
        conn.close()
    touch_project(project_id)
    reg = apply_regression_execution_l5(user_id, eid)
    _maybe_notify_plan_execution_done(user_id, plan_id, had_unset_before=had_unset_before)
    return {
        "execution": {
            "id": eid,
            "case_id": case_id,
            "project_id": project_id,
            "user_id": user_id,
            "result": res,
            "comment": comment_n,
            "executed_at": now,
        },
        "item_id": item_id,
        "regression": reg,
    }


def batch_execute_run_items_l5(
    user_id: str,
    run_id: str,
    item_ids: list[str],
    *,
    result: str,
    comment: str = "",
) -> dict[str, Any]:
    """批量登记计划条目结果（单连接批量写，避免逐条 ensure/建连）。"""
    from core.services.case_management.project_db import ensure_cm_tables, touch_project

    run = get_run_l5(user_id, run_id)
    project_id = str(run.get("project_id") or "")
    assert_project_viewer(user_id, project_id)
    from core.services.l5_bridge.gate_l5 import assert_plan_execution_unlocked_l5

    assert_plan_execution_unlocked_l5(user_id, run_id=run_id)
    res = str(result or "").strip().lower()
    if res not in _ALLOWED_RESULTS:
        raise ValueError("结果仅支持 pass/fail/blocked/skip")
    ids = [str(x).strip() for x in (item_ids or []) if str(x).strip()]
    ids = list(dict.fromkeys(ids))[:500]
    if not ids:
        raise ValueError("请先选择要执行的用例")

    plan_id = str(run.get("plan_id") or "")
    had_unset_before = int(plan_execution_progress_l5(plan_id).get("unset") or 0) > 0

    ensure_cm_tables()
    ensure_l5_tables()
    now = _now()
    comment_n = str(comment or "")[:2000]
    updated = 0
    case_ids: list[str] = []

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            ph = ",".join(["%s"] * len(ids))
            cur.execute(
                "SELECT id, case_id, assignee_id FROM cm_test_run_items_l5 "
                "WHERE run_id=%s AND id IN (" + ph + ")",
                tuple([run_id] + ids),
            )
            rows = cur.fetchall() or []
            if not rows:
                raise ValueError("未找到可执行的用例")
            item_dicts = [
                {k: r.get(k) for k in r.keys()} if hasattr(r, "keys") else dict(r)
                for r in rows
            ]
            _assert_can_execute_run_items(user_id, project_id, item_dicts)

            for row in rows:
                item_id = str(row.get("id") or "")
                case_id = str(row.get("case_id") or "")
                if not item_id or not case_id:
                    continue
                eid = _new_id()
                cur.execute(
                    "INSERT INTO cm_executions "
                    "(id, case_id, project_id, user_id, result, comment, executed_at) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                    (eid, case_id, project_id, user_id, res, comment_n, now),
                )
                cur.execute(
                    "UPDATE cm_executions SET run_id=%s WHERE id=%s",
                    (run_id, eid),
                )
                cur.execute(
                    "UPDATE cm_test_cases SET last_result=%s, last_executed_at=%s, updated_at=%s "
                    "WHERE id=%s",
                    (res, now, now, case_id),
                )
                cur.execute(
                    "UPDATE cm_test_run_items_l5 "
                    "SET result=%s, comment=%s, execution_id=%s, updated_at=%s WHERE id=%s",
                    (res, comment_n, eid, now, item_id),
                )
                updated += 1
                case_ids.append(case_id)

            cur.execute(
                "UPDATE cm_test_runs_l5 SET status='in_progress', updated_at=%s WHERE id=%s",
                (now, run_id),
            )
    finally:
        conn.close()

    if updated <= 0:
        raise ValueError("未找到可执行的用例")

    # 回归闭环仅对 pass/fail 有意义；批量场景轻量处理
    if res in ("pass", "fail") and case_ids:
        try:
            from core.services.l5_bridge.execution_defect import (
                clear_regression_flag_l5,
                get_regression_flag_l5,
                reopen_defect_l5,
            )

            for cid in case_ids:
                flag = get_regression_flag_l5(cid)
                if not flag or flag.get("status") != "pending":
                    continue
                did = str(flag.get("defect_id") or "")
                if res == "pass":
                    clear_regression_flag_l5(cid)
                elif did:
                    reopen_defect_l5(did, user_id)
        except Exception:  # noqa: BLE001
            pass

    touch_project(project_id)
    _maybe_notify_plan_execution_done(user_id, plan_id, had_unset_before=had_unset_before)
    stats = run_stats_l5(user_id, run_id)
    return {
        "updated": updated,
        "failed": 0,
        "errors": [],
        "result": res,
        "stats": stats,
    }


def run_stats_l5(user_id: str, run_id: str) -> dict[str, Any]:
    """用聚合 SQL 统计；非负责人仅统计分配给自己的条目。"""
    from core.services.case_management.member_db import get_member_role

    run = get_run_l5(user_id, run_id)
    project_id = str(run.get("project_id") or "")
    role = get_member_role(user_id, project_id) or "viewer"
    mine_only = role != "owner"
    counts = {"pass": 0, "fail": 0, "blocked": 0, "skip": 0, "unset": 0}
    total = 0
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if mine_only:
                cur.execute(
                    "SELECT "
                    "COUNT(1) AS total, "
                    "SUM(CASE WHEN result='pass' THEN 1 ELSE 0 END) AS pass_c, "
                    "SUM(CASE WHEN result='fail' THEN 1 ELSE 0 END) AS fail_c, "
                    "SUM(CASE WHEN result='blocked' THEN 1 ELSE 0 END) AS blocked_c, "
                    "SUM(CASE WHEN result='skip' THEN 1 ELSE 0 END) AS skip_c, "
                    "SUM(CASE WHEN result IS NULL OR result='' THEN 1 ELSE 0 END) AS unset_c "
                    "FROM cm_test_run_items_l5 WHERE run_id=%s AND assignee_id=%s",
                    (run_id, user_id),
                )
            else:
                cur.execute(
                    "SELECT "
                    "COUNT(1) AS total, "
                    "SUM(CASE WHEN result='pass' THEN 1 ELSE 0 END) AS pass_c, "
                    "SUM(CASE WHEN result='fail' THEN 1 ELSE 0 END) AS fail_c, "
                    "SUM(CASE WHEN result='blocked' THEN 1 ELSE 0 END) AS blocked_c, "
                    "SUM(CASE WHEN result='skip' THEN 1 ELSE 0 END) AS skip_c, "
                    "SUM(CASE WHEN result IS NULL OR result='' THEN 1 ELSE 0 END) AS unset_c "
                    "FROM cm_test_run_items_l5 WHERE run_id=%s",
                    (run_id,),
                )
            row = cur.fetchone() or {}
            total = int(row.get("total") or 0)
            counts["pass"] = int(row.get("pass_c") or 0)
            counts["fail"] = int(row.get("fail_c") or 0)
            counts["blocked"] = int(row.get("blocked_c") or 0)
            counts["skip"] = int(row.get("skip_c") or 0)
            counts["unset"] = int(row.get("unset_c") or 0)
    finally:
        conn.close()
    done = total - counts["unset"]
    return {
        "total": total,
        "done": done,
        "progress": round(100.0 * done / total, 1) if total else 0.0,
        **counts,
    }


def assert_case_ready_for_plan_l5(case_id: str) -> None:
    from core.services.case_management.case_db import get_case

    case = get_case(case_id)
    if not case:
        raise ValueError("用例不存在")
    if str(case.get("status") or "") != "ready":
        raise ValueError("仅 status=ready 的用例可进入测试计划")


def build_run_report_l5(user_id: str, run_id: str) -> dict[str, Any]:
    """新方法：轮次报告（不改 run_stats_l5）。"""
    run = get_run_l5(user_id, run_id)
    items = list_run_items_l5(user_id, run_id)
    stats = run_stats_l5(user_id, run_id)
    unset_titles = [str(i.get("title") or i.get("case_id")) for i in items if not i.get("result")]
    fail_ids = [str(i.get("case_id") or "") for i in items if str(i.get("result") or "") == "fail"]
    pending = 0
    defects = []
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(1) AS c FROM cm_case_regression_flags_l5 "
                "WHERE project_id=%s AND status='pending'",
                (run.get("project_id"),),
            )
            pending = int((cur.fetchone() or {}).get("c") or 0)
            if fail_ids:
                fmt = ",".join(["%s"] * len(fail_ids))
                cur.execute(
                    "SELECT DISTINCT d.id, d.number, d.title, d.status FROM dm_defects d "
                    "JOIN dm_defect_case_links l ON l.defect_id=d.id "
                    "WHERE l.case_id IN (" + fmt + ")",
                    tuple(fail_ids),
                )
                for r in cur.fetchall() or []:
                    defects.append(
                        {
                            "id": str(r.get("id") or ""),
                            "display_id": "D-%s" % int(r.get("number") or 0),
                            "title": str(r.get("title") or ""),
                            "status": str(r.get("status") or ""),
                        }
                    )
    finally:
        conn.close()
    return {
        "run": run,
        "stats": stats,
        "items": items,
        "unset": unset_titles,
        "linked_defects": defects,
        "pending_regression": pending,
    }
