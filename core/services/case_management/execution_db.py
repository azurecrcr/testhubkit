"""cm_executions 手工执行记录。"""

from __future__ import annotations

import time
import uuid
from typing import Any

from core.services.case_management.access import assert_owned_row, assert_project_editor, assert_project_viewer
from core.services.case_management.case_db import get_case
from core.services.case_management.project_db import ensure_cm_tables, touch_project
from core.services.test_cases.mysql_db import get_connection

ALLOWED_RESULTS = frozenset({"pass", "fail", "blocked", "skip"})


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _new_id() -> str:
    return uuid.uuid4().hex


def create_execution(
    user_id: str,
    case_id: str,
    *,
    result: str,
    comment: str = "",
) -> dict[str, Any]:
    case = assert_owned_row(get_case(case_id), user_id, not_found="用例不存在")
    project_id = str(case["project_id"])
    assert_project_editor(user_id, project_id)
    res = str(result or "").strip().lower()
    if res not in ALLOWED_RESULTS:
        raise ValueError("结果仅支持 pass/fail/blocked/skip")
    ensure_cm_tables()
    eid = _new_id()
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO cm_executions "
                "(id, case_id, project_id, user_id, result, comment, executed_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (eid, case_id, project_id, user_id, res, str(comment or "")[:2000], now),
            )
            # 冗余最近结果：仅更新本用例，不影响 executions 查询语义
            cur.execute(
                "UPDATE cm_test_cases SET last_result = %s, last_executed_at = %s, updated_at = %s "
                "WHERE id = %s",
                (res, now, now, case_id),
            )
    finally:
        conn.close()
    touch_project(project_id)
    return {
        "id": eid,
        "case_id": case_id,
        "project_id": project_id,
        "user_id": user_id,
        "result": res,
        "comment": str(comment or "")[:2000],
        "executed_at": now,
    }


def _user_label(display_name, email, phone) -> str:
    name = (display_name or "").strip()
    if name:
        return name
    if email:
        return str(email)
    if phone:
        return str(phone)
    return "未知用户"


def list_executions(
    user_id: str,
    case_id: str,
    *,
    page: int = 1,
    page_size: int = 10,
) -> dict[str, Any]:
    case = assert_owned_row(get_case(case_id), user_id, not_found="用例不存在")
    assert_project_viewer(user_id, str(case["project_id"]))
    ensure_cm_tables()
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 10), 50))
    offset = (page - 1) * page_size
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_executions WHERE case_id = %s",
                (case_id,),
            )
            total = int((cur.fetchone() or {}).get("c") or 0)
            cur.execute(
                "SELECT e.id, e.case_id, e.project_id, e.user_id, e.result, e.comment, "
                "e.executed_at, u.display_name AS display_name, u.email AS email, "
                "u.phone AS phone "
                "FROM cm_executions e "
                "LEFT JOIN hub_users u ON u.id = e.user_id "
                "WHERE e.case_id = %s "
                "ORDER BY e.executed_at DESC "
                "LIMIT %s OFFSET %s",
                (case_id, page_size, offset),
            )
            rows = cur.fetchall() or []
        items = []
        for r in rows:
            label = _user_label(r.get("display_name"), r.get("email"), r.get("phone"))
            items.append(
                {
                    "id": str(r.get("id") or ""),
                    "case_id": str(r.get("case_id") or ""),
                    "project_id": str(r.get("project_id") or ""),
                    "user_id": str(r.get("user_id") or ""),
                    "executor_label": label,
                    "result": str(r.get("result") or ""),
                    "comment": str(r.get("comment") or ""),
                    "executed_at": str(r.get("executed_at") or ""),
                }
            )
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    finally:
        conn.close()
