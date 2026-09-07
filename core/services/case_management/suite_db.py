"""cm_suites 目录树。"""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from core.services.case_management.access import (
    assert_owned_row,
    assert_project_editor,
    assert_project_viewer,
)
from core.services.case_management.project_db import ensure_cm_tables, touch_project
from core.services.test_cases.mysql_db import get_connection


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _new_id() -> str:
    return uuid.uuid4().hex


def list_suites(user_id: str, project_id: str) -> list[dict[str, Any]]:
    assert_project_viewer(user_id, project_id)
    ensure_cm_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, project_id, parent_id, user_id, name, sort_order, "
                "created_at, updated_at FROM cm_suites WHERE project_id = %s "
                "ORDER BY sort_order ASC, created_at ASC",
                (project_id,),
            )
            rows = cur.fetchall() or []
        return [_serialize(r) for r in rows]
    finally:
        conn.close()


def get_suite(suite_id: str) -> Optional[dict[str, Any]]:
    sid = str(suite_id or "").strip()
    if not sid:
        return None
    ensure_cm_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, project_id, parent_id, user_id, name, sort_order, "
                "created_at, updated_at FROM cm_suites WHERE id = %s LIMIT 1",
                (sid,),
            )
            row = cur.fetchone()
        return _serialize(row) if row else None
    finally:
        conn.close()


def assert_suite_in_project(user_id: str, project_id: str, suite_id: str) -> dict[str, Any]:
    """导入等场景：校验目录存在且属于指定项目（本页专用校验入口）。"""
    sid = str(suite_id or "").strip()
    if not sid:
        raise ValueError("请选择导入目录")
    assert_project_editor(user_id, project_id)
    suite = assert_owned_row(get_suite(sid), user_id, not_found="目录不存在")
    if str(suite.get("project_id") or "") != str(project_id):
        raise ValueError("目录不属于当前项目")
    return suite


def collect_suite_subtree_ids(project_id: str, root_suite_id: str) -> list[str]:
    """返回根目录及其全部子孙目录 id（同项目内，BFS，含自身）。"""
    root = str(root_suite_id or "").strip()
    pid = str(project_id or "").strip()
    if not root or not pid:
        return []
    ensure_cm_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, parent_id FROM cm_suites WHERE project_id = %s",
                (pid,),
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()

    children: dict[str, list[str]] = {}
    for r in rows:
        sid = str(r.get("id") or "")
        if not sid:
            continue
        p = r.get("parent_id")
        pk = str(p) if p else ""
        children.setdefault(pk, []).append(sid)

    out: list[str] = []
    queue = [root]
    seen: set[str] = set()
    while queue:
        cur_id = queue.pop(0)
        if cur_id in seen:
            continue
        seen.add(cur_id)
        out.append(cur_id)
        for child in children.get(cur_id, []):
            if child not in seen:
                queue.append(child)
    return out


def create_suite(
    user_id: str,
    project_id: str,
    *,
    name: str,
    parent_id: Optional[str] = None,
) -> dict[str, Any]:
    assert_project_editor(user_id, project_id)
    title = str(name or "").strip()
    if not title:
        raise ValueError("目录名称不能为空")
    if len(title) > 200:
        raise ValueError("目录名称过长")
    parent = str(parent_id or "").strip() or None
    if parent:
        parent_row = assert_owned_row(get_suite(parent), user_id, not_found="父目录不存在")
        if str(parent_row.get("project_id") or "") != project_id:
            raise ValueError("父目录不属于当前项目")
    ensure_cm_tables()
    now = _now()
    sid = _new_id()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COALESCE(MAX(sort_order), 0) AS m FROM cm_suites "
                "WHERE project_id = %s AND "
                + ("parent_id = %s" if parent else "parent_id IS NULL"),
                (project_id, parent) if parent else (project_id,),
            )
            sort_order = int((cur.fetchone() or {}).get("m") or 0) + 1
            cur.execute(
                "INSERT INTO cm_suites (id, project_id, parent_id, user_id, name, "
                "sort_order, created_at, updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (sid, project_id, parent, user_id, title, sort_order, now, now),
            )
    finally:
        conn.close()
    touch_project(project_id)
    return get_suite(sid) or {
        "id": sid,
        "project_id": project_id,
        "parent_id": parent,
        "user_id": user_id,
        "name": title,
        "sort_order": sort_order,
        "created_at": now,
        "updated_at": now,
    }


def update_suite(
    user_id: str,
    suite_id: str,
    *,
    name: Optional[str] = None,
    parent_id: Optional[str] = None,
    sort_order: Optional[int] = None,
    move_up: bool = False,
    move_down: bool = False,
) -> dict[str, Any]:
    suite = assert_owned_row(get_suite(suite_id), user_id, not_found="目录不存在")
    project_id = str(suite["project_id"])
    assert_project_editor(user_id, project_id)

    if move_up or move_down:
        return _swap_sort(user_id, suite, direction=-1 if move_up else 1)

    fields: list[str] = []
    values: list[Any] = []
    if name is not None:
        title = str(name).strip()
        if not title:
            raise ValueError("目录名称不能为空")
        fields.append("name = %s")
        values.append(title[:200])
    if parent_id is not None:
        new_parent = str(parent_id or "").strip() or None
        if new_parent:
            if new_parent == suite_id:
                raise ValueError("不能将目录移动到自身下")
            parent_row = assert_owned_row(
                get_suite(new_parent), user_id, not_found="父目录不存在"
            )
            if str(parent_row.get("project_id") or "") != project_id:
                raise ValueError("父目录不属于当前项目")
            # 防止把祖先挂到子孙下：简单拒绝 parent 链包含自己
            walk = parent_row
            guard = 0
            while walk and guard < 50:
                if str(walk.get("id")) == suite_id:
                    raise ValueError("不能移动到子目录下")
                pid = walk.get("parent_id")
                walk = get_suite(str(pid)) if pid else None
                guard += 1
        fields.append("parent_id = %s")
        values.append(new_parent)
    if sort_order is not None:
        fields.append("sort_order = %s")
        values.append(int(sort_order))
    if not fields:
        return suite
    fields.append("updated_at = %s")
    values.append(_now())
    values.append(suite_id)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cm_suites SET " + ", ".join(fields) + " WHERE id = %s",
                tuple(values),
            )
    finally:
        conn.close()
    touch_project(project_id)
    return get_suite(suite_id) or suite


def delete_suite(user_id: str, suite_id: str) -> dict[str, Any]:
    suite = assert_owned_row(get_suite(suite_id), user_id, not_found="目录不存在")
    project_id = str(suite["project_id"])
    assert_project_editor(user_id, project_id)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_suites WHERE parent_id = %s",
                (suite_id,),
            )
            child_count = int((cur.fetchone() or {}).get("c") or 0)
            if child_count:
                raise ValueError("请先删除子目录")
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_test_cases WHERE suite_id = %s AND is_deleted = 0",
                (suite_id,),
            )
            case_count = int((cur.fetchone() or {}).get("c") or 0)
            if case_count:
                raise ValueError("目录下仍有用例，请先移出或删除用例")
            cur.execute("DELETE FROM cm_suite_schemas WHERE suite_id = %s", (suite_id,))
            cur.execute("DELETE FROM cm_suites WHERE id = %s", (suite_id,))
    finally:
        conn.close()
    touch_project(project_id)
    return {"deleted": True, "id": suite_id}


def _swap_sort(user_id: str, suite: dict[str, Any], *, direction: int) -> dict[str, Any]:
    project_id = str(suite["project_id"])
    parent = suite.get("parent_id")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if parent:
                cur.execute(
                    "SELECT id, sort_order FROM cm_suites WHERE project_id = %s "
                    "AND parent_id = %s ORDER BY sort_order ASC, created_at ASC",
                    (project_id, parent),
                )
            else:
                cur.execute(
                    "SELECT id, sort_order FROM cm_suites WHERE project_id = %s "
                    "AND parent_id IS NULL ORDER BY sort_order ASC, created_at ASC",
                    (project_id,),
                )
            siblings = cur.fetchall() or []
        ids = [str(r["id"]) for r in siblings]
        try:
            idx = ids.index(str(suite["id"]))
        except ValueError:
            return suite
        j = idx + direction
        if j < 0 or j >= len(siblings):
            return suite
        a_id, a_sort = str(siblings[idx]["id"]), int(siblings[idx]["sort_order"] or 0)
        b_id, b_sort = str(siblings[j]["id"]), int(siblings[j]["sort_order"] or 0)
        now = _now()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cm_suites SET sort_order = %s, updated_at = %s WHERE id = %s",
                (b_sort, now, a_id),
            )
            cur.execute(
                "UPDATE cm_suites SET sort_order = %s, updated_at = %s WHERE id = %s",
                (a_sort, now, b_id),
            )
    finally:
        conn.close()
    touch_project(project_id)
    return get_suite(str(suite["id"])) or suite


def _serialize(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row.get("id") or ""),
        "project_id": str(row.get("project_id") or ""),
        "parent_id": row.get("parent_id"),
        "user_id": str(row.get("user_id") or ""),
        "name": str(row.get("name") or ""),
        "sort_order": int(row.get("sort_order") or 0),
        "created_at": str(row.get("created_at") or ""),
        "updated_at": str(row.get("updated_at") or ""),
    }
