# -*- coding: utf-8 -*-
"""站内通知（无外部 webhook）。"""

from __future__ import annotations

from typing import Any

from core.services.case_management.message_db import create_message


def notify_users_l5(
    user_ids: list[str],
    *,
    msg_type: str,
    title: str,
    body: str = "",
    ref_type: str | None = None,
    ref_id: str | None = None,
    payload: dict | None = None,
) -> int:
    n = 0
    seen = set()
    for uid in user_ids or []:
        u = str(uid or "").strip()
        if not u or u in seen:
            continue
        seen.add(u)
        try:
            create_message(
                user_id=u,
                msg_type=msg_type,
                title=title[:200],
                body=(body or "")[:2000],
                ref_type=ref_type,
                ref_id=ref_id,
                payload=payload or {},
            )
            n += 1
        except Exception:  # noqa: BLE001
            continue
    return n


def notify_regression_pending_l5(actor_id: str, defect_id: str) -> int:
    from core.services.case_management.case_db import get_case
    from core.services.defect_management import defect_db

    item = defect_db.get_defect(defect_id)
    if not item:
        return 0
    pid = str(item.get("project_id") or "")
    targets = []
    for cid in item.get("case_ids") or []:
        case = get_case(str(cid))
        if case and case.get("user_id"):
            targets.append(str(case.get("user_id")))
    return notify_users_l5(
        targets,
        msg_type="regression_pending",
        title="待回归：%s" % (item.get("display_id") or defect_id),
        body=str(item.get("title") or "")[:200],
        ref_type="defect",
        ref_id=defect_id,
        payload={
            "project_id": pid,
            "defect_id": defect_id,
            "display_id": item.get("display_id"),
            "actor_id": actor_id,
        },
    )


def notify_sync_done_l5(
    actor_id: str, project_id: str, *, created: int = 0, updated: int = 0, batch_id: str = ""
) -> int:
    return notify_users_l5(
        [actor_id],
        msg_type="sync_done",
        title="工作台同步完成",
        body="新增 %s，更新 %s（只读源，未写回工作台）" % (created, updated),
        ref_type="sync_batch",
        ref_id=batch_id or None,
        payload={"project_id": project_id, "created": created, "updated": updated, "batch_id": batch_id},
    )


_DEFECT_STATUS_LABEL = {
    "open": "开放",
    "confirmed": "已确认",
    "in_progress": "处理中",
    "resolved": "已解决",
    "closed": "已关闭",
    "rejected": "已拒绝",
}


def _defect_status_notify_plan(
    *,
    previous_status: str,
    new_status: str,
    handlers: list[str],
    reporter: str,
) -> tuple[list[str], str, str]:
    """
    按状态决定通知对象与文案。
    - 已解决 → 提交人（验收）
    - 处理中（含解决未通过打回）→ 处理人
    - 已关闭复现打开 → 提交人
    其它流转不发状态变更消息（创建缺陷仍走 defect_assigned）。
    """
    prev = str(previous_status or "").strip()
    new = str(new_status or "").strip()
    handlers_n = [str(x).strip() for x in (handlers or []) if str(x or "").strip()]
    reporter_n = str(reporter or "").strip()

    # 已关闭 → 开放/处理中：复现打开，通知提交人
    if prev == "closed" and new in ("open", "in_progress"):
        return (
            [reporter_n] if reporter_n else [],
            "缺陷复现打开：%s",
            "已关闭缺陷被重新打开（%s → %s），请关注。",
        )

    # 已解决：通知提交人验收
    if new == "resolved":
        return (
            [reporter_n] if reporter_n else [],
            "请验收缺陷：%s",
            "缺陷已解决（%s → %s），请确认是否通过。",
        )

    # 进入处理中：通知处理人（含「解决未通过」打回）
    if new == "in_progress":
        return (
            handlers_n,
            "请处理缺陷：%s",
            "缺陷进入处理中（%s → %s），请继续跟进。",
        )

    return ([], "", "")


def notify_defect_status_l5(
    actor_id: str,
    defect_id: str,
    *,
    status: str,
    previous_status: str = "",
    assignee_ids: list[str] | None = None,
) -> int:
    """缺陷状态变更：按目标状态通知对应角色（排除操作者本人）。"""
    from core.services.defect_management import defect_db

    item = defect_db.get_defect(defect_id) or {}
    if not item:
        return 0
    handlers = list(assignee_ids or item.get("handler_ids") or [])
    reporter = str(item.get("reporter_id") or "")
    prev = str(previous_status or "").strip()
    new_st = str(status or item.get("status") or "").strip()
    if not new_st or new_st == prev:
        return 0

    targets, title_tpl, body_tpl = _defect_status_notify_plan(
        previous_status=prev,
        new_status=new_st,
        handlers=handlers,
        reporter=reporter,
    )
    if not title_tpl:
        return 0

    actor = str(actor_id or "").strip()
    targets = [t for t in targets if t and t != actor]
    if not targets:
        return 0

    display = str(item.get("display_id") or defect_id)
    prev_l = _DEFECT_STATUS_LABEL.get(prev, prev or "-")
    new_l = _DEFECT_STATUS_LABEL.get(new_st, new_st or "-")
    title = (title_tpl % display)[:200]
    body = (
        "%s。" % (str(item.get("title") or "")[:120])
        + (body_tpl % (prev_l, new_l))
    )[:2000]
    return notify_users_l5(
        targets,
        msg_type="defect_status",
        title=title,
        body=body,
        ref_type="defect",
        ref_id=defect_id,
        payload={
            "project_id": item.get("project_id"),
            "defect_id": defect_id,
            "display_id": display,
            "status": new_st,
            "previous_status": prev,
            "actor_id": actor,
            "notify_role": (
                "reporter"
                if (prev == "closed" and new_st in ("open", "in_progress")) or new_st == "resolved"
                else "handler"
            ),
        },
    )


def notify_plan_execution_done_l5(actor_id: str, plan_id: str) -> int:
    """计划下全部用例已执行完毕：通知计划创建人（owner）。"""
    from core.services.l5_bridge.plan_run_l5 import get_plan_l5

    try:
        plan = get_plan_l5(actor_id, plan_id)
    except Exception:  # noqa: BLE001
        return 0
    owner = str(plan.get("owner_id") or "").strip()
    if not owner:
        return 0
    name = str(plan.get("name") or plan_id)[:120]
    return notify_users_l5(
        [owner],
        msg_type="plan_execution_done",
        title="测试计划已全部执行完毕",
        body="计划「%s」下的用例均已登记执行结果，可进行发布判定。" % name,
        ref_type="plan",
        ref_id=plan_id,
        payload={
            "project_id": plan.get("project_id"),
            "plan_id": plan_id,
            "plan_name": name,
            "actor_id": actor_id,
        },
    )


def _plan_assignee_ids(plan_id: str) -> list[str]:
    from core.services.l5_bridge.schema_l5 import ensure_l5_tables
    from core.services.test_cases.mysql_db import get_connection

    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT DISTINCT i.assignee_id FROM cm_test_run_items_l5 i "
                "JOIN cm_test_runs_l5 r ON r.id=i.run_id "
                "WHERE r.plan_id=%s AND i.assignee_id IS NOT NULL AND i.assignee_id<>''",
                (plan_id,),
            )
            return [str(r.get("assignee_id") or "") for r in (cur.fetchall() or []) if r.get("assignee_id")]
    finally:
        conn.close()


def notify_plan_cases_assigned_l5(
    actor_id: str,
    plan_id: str,
    *,
    assignee_id: str,
    case_count: int,
) -> int:
    """计划用例分配给执行人。"""
    from core.services.l5_bridge.plan_run_l5 import get_plan_l5

    aid = str(assignee_id or "").strip()
    n = int(case_count or 0)
    if not aid or n <= 0:
        return 0
    if aid == str(actor_id or "").strip():
        return 0
    try:
        plan = get_plan_l5(actor_id, plan_id)
    except Exception:  # noqa: BLE001
        try:
            plan = get_plan_l5(aid, plan_id)
        except Exception:  # noqa: BLE001
            return 0
    name = str(plan.get("name") or plan_id)[:120]
    return notify_users_l5(
        [aid],
        msg_type="plan_cases_assigned",
        title="你有新的计划用例待执行",
        body="计划「%s」分配了 %s 条用例给你，请及时执行。" % (name, n),
        ref_type="plan",
        ref_id=plan_id,
        payload={
            "project_id": plan.get("project_id"),
            "plan_id": plan_id,
            "plan_name": name,
            "assignee_id": aid,
            "case_count": n,
            "actor_id": actor_id,
        },
    )


_PLAN_RELEASE_NOTIFY = {
    "released": (
        "plan_released",
        "测试计划已发布：%s",
        "计划「%s」已发布，可开始执行用例。",
    ),
    "passed": (
        "plan_passed",
        "测试计划已通过：%s",
        "计划「%s」已判定为通过，执行已锁定。",
    ),
    "failed": (
        "plan_failed",
        "测试计划未通过：%s",
        "计划「%s」已判定为未通过，执行已锁定。",
    ),
    "open": (
        "plan_unpublished",
        "测试计划已取消发布：%s",
        "计划「%s」已取消发布，执行结果已清空为未测，如需请重新执行。",
    ),
}


def notify_plan_release_status_l5(
    actor_id: str,
    plan_id: str,
    *,
    status: str,
    previous_status: str = "",
    cleared_executions: int = 0,
) -> int:
    """计划发布 / 通过 / 未通过 / 取消发布：通知计划执行人（排除操作者）。"""
    from core.services.l5_bridge.gate_l5 import normalize_release_status
    from core.services.l5_bridge.plan_run_l5 import get_plan_l5

    st = normalize_release_status(status)
    prev = normalize_release_status(previous_status)
    if st == prev:
        return 0
    meta = _PLAN_RELEASE_NOTIFY.get(st)
    if not meta:
        return 0
    try:
        plan = get_plan_l5(actor_id, plan_id)
    except Exception:  # noqa: BLE001
        return 0
    name = str(plan.get("name") or plan_id)[:120]
    targets = _plan_assignee_ids(plan_id)
    owner = str(plan.get("owner_id") or "").strip()
    if owner:
        targets.append(owner)
    actor = str(actor_id or "").strip()
    targets = [t for t in targets if t and t != actor]
    if not targets:
        return 0
    msg_type, title_tpl, body_tpl = meta
    body = body_tpl % name
    if st == "open" and cleared_executions:
        body += "（已清空 %s 条执行结果）" % int(cleared_executions)
    return notify_users_l5(
        targets,
        msg_type=msg_type,
        title=(title_tpl % name)[:200],
        body=body[:2000],
        ref_type="plan",
        ref_id=plan_id,
        payload={
            "project_id": plan.get("project_id"),
            "plan_id": plan_id,
            "plan_name": name,
            "status": st,
            "previous_status": prev,
            "cleared_executions": int(cleared_executions or 0),
            "actor_id": actor,
        },
    )


def notify_defect_comment_l5(actor_id: str, defect_id: str, *, comment_body: str = "") -> int:
    """缺陷新增评论：通知经办人 + 提交人（排除评论者）。"""
    from core.services.defect_management import defect_db

    item = defect_db.get_defect(defect_id) or {}
    if not item:
        return 0
    targets = list(item.get("handler_ids") or [])
    reporter = str(item.get("reporter_id") or "").strip()
    if reporter:
        targets.append(reporter)
    actor = str(actor_id or "").strip()
    targets = [str(t).strip() for t in targets if str(t or "").strip() and str(t).strip() != actor]
    if not targets:
        return 0
    display = str(item.get("display_id") or defect_id)
    snippet = str(comment_body or "").strip().replace("\n", " ")[:120]
    body = "%s" % (str(item.get("title") or "")[:80])
    if snippet:
        body += "。评论：%s" % snippet
    return notify_users_l5(
        targets,
        msg_type="defect_comment",
        title=("缺陷新评论：%s" % display)[:200],
        body=body[:2000],
        ref_type="defect",
        ref_id=defect_id,
        payload={
            "project_id": item.get("project_id"),
            "defect_id": defect_id,
            "display_id": display,
            "actor_id": actor,
        },
    )
