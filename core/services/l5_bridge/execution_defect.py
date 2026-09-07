# -*- coding: utf-8 -*-
"""执行→缺陷闭环（新方法；不改 create_execution 本体）。缺陷无附件。"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from core.services.case_management.access import assert_project_editor
from core.services.case_management.case_db import get_case
from core.services.case_management.execution_db import create_execution
from core.services.defect_management import defect_db
from core.services.l5_bridge.case_link_sync_l5 import set_case_links_and_sync_refs_l5
from core.services.l5_bridge.schema_l5 import ensure_l5_tables
from core.services.test_cases.mysql_db import get_connection

FAIL_RESULTS = frozenset({"fail", "blocked"})


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _new_id() -> str:
    return uuid.uuid4().hex


def _get_execution(execution_id: str) -> dict[str, Any] | None:
    eid = str(execution_id or "").strip()
    if not eid:
        return None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, case_id, project_id, user_id, result, comment, executed_at, "
                "defect_id, run_id FROM cm_executions WHERE id = %s LIMIT 1",
                (eid,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {k: row.get(k) for k in row.keys()} if hasattr(row, "keys") else dict(row)
    finally:
        conn.close()


def get_regression_flag_l5(case_id: str) -> dict[str, Any] | None:
    ensure_l5_tables()
    cid = str(case_id or "").strip()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT case_id, project_id, defect_id, status, updated_at "
                "FROM cm_case_regression_flags_l5 WHERE case_id = %s LIMIT 1",
                (cid,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "case_id": str(row.get("case_id") or ""),
                "project_id": str(row.get("project_id") or ""),
                "defect_id": str(row.get("defect_id") or ""),
                "status": str(row.get("status") or ""),
                "updated_at": str(row.get("updated_at") or ""),
            }
    finally:
        conn.close()


def mark_cases_pending_regression_l5(defect_id: str) -> dict[str, Any]:
    ensure_l5_tables()
    did = str(defect_id or "").strip()
    item = defect_db.get_defect(did)
    if not item:
        raise ValueError("缺陷不存在")
    pid = str(item.get("project_id") or "")
    case_ids = item.get("case_ids") or []
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for cid in case_ids:
                cid = str(cid or "").strip()
                if not cid:
                    continue
                cur.execute(
                    "INSERT INTO cm_case_regression_flags_l5 "
                    "(case_id, project_id, defect_id, status, updated_at) "
                    "VALUES (%s,%s,%s,'pending',%s) "
                    "ON DUPLICATE KEY UPDATE defect_id=VALUES(defect_id), "
                    "status='pending', updated_at=VALUES(updated_at)",
                    (cid, pid, did, now),
                )
    finally:
        conn.close()
    try:
        from core.services.case_management.message_db import create_message

        for cid in case_ids:
            case = get_case(str(cid))
            if not case:
                continue
            owner = str(case.get("user_id") or "")
            if owner:
                create_message(
                    user_id=owner,
                    msg_type="regression_pending",
                    title="待回归：%s" % (item.get("display_id") or did),
                    body=str(case.get("title") or "")[:200],
                    ref_type="defect",
                    ref_id=did,
                    payload={
                        "project_id": pid,
                        "defect_id": did,
                        "case_id": cid,
                        "display_id": item.get("display_id"),
                    },
                )
    except Exception:  # noqa: BLE001
        pass
    return {"marked": len(case_ids), "defect_id": did}


def clear_regression_flag_l5(case_id: str) -> None:
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cm_case_regression_flags_l5 SET status='cleared', updated_at=%s "
                "WHERE case_id=%s",
                (_now(), str(case_id or "").strip()),
            )
    finally:
        conn.close()


def reopen_defect_l5(defect_id: str, actor_id: str) -> dict[str, Any]:
    """新方法：按状态机允许边重开（closed/resolved → in_progress 或 open）。"""
    item = defect_db.get_defect(defect_id)
    if not item:
        raise ValueError("缺陷不存在")
    st = str(item.get("status") or "")
    target = None
    if st == "closed":
        target = "open"
    elif st == "resolved":
        target = "in_progress"
    if not target:
        return item
    updated = defect_db.update_defect(defect_id=defect_id, actor_id=actor_id, status=target)
    try:
        after_defect_status_change_l5(
            updated or {},
            previous_status=st,
            actor_id=actor_id,
        )
    except Exception:  # noqa: BLE001
        pass
    return updated or item


def after_defect_status_change_l5(
    defect: dict[str, Any], *, previous_status: str, actor_id: str | None = None
) -> None:
    """API 层 hook：不改 update_defect。"""
    new_st = str((defect or {}).get("status") or "")
    prev = str(previous_status or "")
    if new_st == prev:
        return
    if new_st in ("resolved", "closed"):
        mark_cases_pending_regression_l5(str(defect.get("id") or ""))
    try:
        from core.services.l5_bridge.notify_l5 import notify_defect_status_l5

        notify_defect_status_l5(
            str(actor_id or ""),
            str(defect.get("id") or ""),
            status=new_st,
            previous_status=prev,
        )
    except Exception:  # noqa: BLE001
        pass


def _bind_execution_defect(execution_id: str, defect_id: str) -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cm_executions SET defect_id=%s WHERE id=%s",
                (defect_id, execution_id),
            )
            cur.execute(
                "UPDATE dm_defects SET source_execution_id=%s WHERE id=%s",
                (execution_id, defect_id),
            )
    finally:
        conn.close()


def create_defect_from_execution_l5(
    user_id: str,
    execution_id: str,
    *,
    title: str | None = None,
    description: str | None = None,
    severity: str = "normal",
    handler_ids: Any = None,
    actual_result: str | None = None,
    expected_result: str | None = None,
    repro_steps: str | None = None,
    environment: str | None = None,
) -> dict[str, Any]:
    ensure_l5_tables()
    exe = _get_execution(execution_id)
    if not exe:
        raise ValueError("执行记录不存在")
    res = str(exe.get("result") or "")
    if res not in FAIL_RESULTS:
        raise ValueError("仅 fail/blocked 执行可创建缺陷")
    case_id = str(exe.get("case_id") or "")
    project_id = str(exe.get("project_id") or "")
    assert_project_editor(user_id, project_id)
    case = get_case(case_id) or {}
    case_title = str(case.get("title") or case_id)
    title_n = str(title or ("[执行失败] " + case_title)).strip()[:200]
    steps = case.get("steps_json")
    steps_txt = ""
    try:
        if isinstance(steps, str):
            steps_txt = steps
        elif steps is not None:
            steps_txt = json.dumps(steps, ensure_ascii=False)
    except Exception:  # noqa: BLE001
        steps_txt = str(steps or "")
    desc_parts = [
        description or "",
        "用例：%s" % case_title,
        "执行结果：%s" % res,
        "执行备注：%s" % (exe.get("comment") or ""),
        "步骤：%s" % (steps_txt[:1500] if steps_txt else ""),
        "说明：本系统缺陷不支持附件/截图，请用文字描述。",
    ]
    desc = "\n".join([p for p in desc_parts if p]).strip()[:8000]
    item = defect_db.create_defect(
        project_id=project_id,
        reporter_id=user_id,
        title=title_n,
        description=desc,
        severity=severity,
        handler_ids=handler_ids,
    )
    did = str(item.get("id") or "")
    # L5 文本字段
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE dm_defects SET repro_steps=%s, expected_result=%s, actual_result=%s, "
                "environment=%s, source_execution_id=%s WHERE id=%s",
                (
                    (repro_steps or steps_txt or "")[:8000] or None,
                    (expected_result or "")[:8000] or None,
                    (actual_result or exe.get("comment") or res)[:8000] or None,
                    (environment or "")[:200] or None,
                    execution_id,
                    did,
                ),
            )
    finally:
        conn.close()
    set_case_links_and_sync_refs_l5(
        defect_id=did, project_id=project_id, case_ids=[case_id]
    )
    _bind_execution_defect(execution_id, did)
    from core.services.l5_bridge.activity_l5 import record_defect_activity_l5, write_audit_l5

    record_defect_activity_l5(
        did, user_id, "created_from_execution", {"execution_id": execution_id}
    )
    write_audit_l5(
        project_id,
        user_id,
        "execution_create_defect",
        ref_type="defect",
        ref_id=did,
        payload={"execution_id": execution_id, "case_id": case_id},
    )
    return defect_db.get_defect(did) or item


def link_existing_defect_to_execution_l5(
    user_id: str, execution_id: str, defect_id: str
) -> dict[str, Any]:
    ensure_l5_tables()
    exe = _get_execution(execution_id)
    if not exe:
        raise ValueError("执行记录不存在")
    assert_project_editor(user_id, str(exe.get("project_id") or ""))
    item = defect_db.get_defect(defect_id)
    if not item:
        raise ValueError("缺陷不存在")
    if str(item.get("project_id")) != str(exe.get("project_id")):
        raise ValueError("缺陷与执行不在同一项目")
    case_id = str(exe.get("case_id") or "")
    case_ids = list(item.get("case_ids") or [])
    if case_id and case_id not in case_ids:
        case_ids.append(case_id)
    set_case_links_and_sync_refs_l5(
        defect_id=defect_id,
        project_id=str(item.get("project_id") or ""),
        case_ids=case_ids,
    )
    _bind_execution_defect(execution_id, defect_id)
    return defect_db.get_defect(defect_id) or item


def apply_regression_execution_l5(user_id: str, execution_id: str) -> dict[str, Any]:
    """若用例处于待回归：pass 清标记；fail 重开缺陷。"""
    ensure_l5_tables()
    exe = _get_execution(execution_id)
    if not exe:
        raise ValueError("执行记录不存在")
    case_id = str(exe.get("case_id") or "")
    flag = get_regression_flag_l5(case_id)
    if not flag or flag.get("status") != "pending":
        return {"applied": False, "reason": "no_pending_regression"}
    res = str(exe.get("result") or "")
    did = str(flag.get("defect_id") or "")
    if res == "pass":
        clear_regression_flag_l5(case_id)
        return {"applied": True, "action": "cleared", "defect_id": did}
    if res in FAIL_RESULTS and did:
        reopen_defect_l5(did, user_id)
        return {"applied": True, "action": "reopened", "defect_id": did}
    return {"applied": False, "reason": "result_ignored"}


def create_execution_and_maybe_defect_l5(
    user_id: str,
    case_id: str,
    *,
    result: str,
    comment: str = "",
    create_defect: bool = False,
    defect_opts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """新方法：先走现有 create_execution，再可选建缺陷/应用回归。"""
    exe = create_execution(user_id, case_id, result=result, comment=comment)
    out: dict[str, Any] = {"execution": exe, "defect": None, "regression": None}
    res = str(exe.get("result") or "")
    if create_defect and res in FAIL_RESULTS:
        opts = defect_opts or {}
        out["defect"] = create_defect_from_execution_l5(
            user_id, str(exe.get("id") or ""), **opts
        )
    out["regression"] = apply_regression_execution_l5(user_id, str(exe.get("id") or ""))
    return out
