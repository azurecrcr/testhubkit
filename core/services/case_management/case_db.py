"""cm_test_cases 用例 CRUD。"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Optional

from core.services.case_management.access import (
    assert_owned_row,
    assert_project_editor,
    assert_project_viewer,
)
from core.services.case_management.project_db import ensure_cm_tables, touch_project
from core.services.case_management.suite_db import get_suite
from core.services.test_cases.mysql_db import get_connection

ALLOWED_PRIORITIES = frozenset({"P0", "P1", "P2", "P3"})
ALLOWED_STATUSES = frozenset({"draft", "ready", "deprecated"})


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _new_id() -> str:
    return uuid.uuid4().hex


def _normalize_steps(steps: Any) -> list[dict[str, str]]:
    if steps is None:
        return []
    if isinstance(steps, str):
        text = steps.strip()
        if not text:
            return []
        try:
            steps = json.loads(text)
        except json.JSONDecodeError:
            return [{"step": text, "expect": ""}]
    if not isinstance(steps, list):
        raise ValueError("steps 必须是数组")
    out: list[dict[str, str]] = []
    for item in steps:
        if isinstance(item, dict):
            out.append(
                {
                    "step": str(item.get("step") or item.get("步骤描述") or "").strip(),
                    "expect": str(
                        item.get("expect") or item.get("预期结果") or ""
                    ).strip(),
                }
            )
        else:
            out.append({"step": str(item or "").strip(), "expect": ""})
    return out


def _normalize_tags(tags: Any) -> list[str]:
    if tags is None:
        return []
    if isinstance(tags, str):
        text = tags.strip()
        if not text:
            return []
        if text.startswith("["):
            try:
                tags = json.loads(text)
            except json.JSONDecodeError:
                tags = [t.strip() for t in text.split(",") if t.strip()]
        else:
            tags = [t.strip() for t in text.split(",") if t.strip()]
    if not isinstance(tags, list):
        raise ValueError("tags 必须是数组")
    return [str(t).strip() for t in tags if str(t).strip()][:50]


def _normalize_fields(fields: Any) -> dict[str, str]:
    if fields is None:
        return {}
    if isinstance(fields, str):
        text = fields.strip()
        if not text:
            return {}
        try:
            fields = json.loads(text)
        except json.JSONDecodeError:
            return {}
    if not isinstance(fields, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in fields.items():
        key = str(k or "").strip()
        if not key:
            continue
        out[key] = str(v if v is not None else "").strip()
    return out


_LIST_TEXT_MAX = 240
_LIST_STEPS_MAX = 6
_LIST_SELECT_COLS = (
    "id, project_id, suite_id, title, priority, status, precondition, "
    "steps_json, tags_json, fields_json, source, last_result, last_executed_at, "
    "created_at, updated_at"
)


def _clip_text(value: Any, limit: int = _LIST_TEXT_MAX) -> str:
    text = str(value if value is not None else "")
    if len(text) <= limit:
        return text
    return text[:limit] + "…"


def _serialize(row: dict[str, Any]) -> dict[str, Any]:
    try:
        steps = json.loads(row.get("steps_json") or "[]")
    except json.JSONDecodeError:
        steps = []
    try:
        tags = json.loads(row.get("tags_json") or "[]")
    except json.JSONDecodeError:
        tags = []
    fields = _normalize_fields(row.get("fields_json"))
    if not isinstance(steps, list):
        steps = []
    if not isinstance(tags, list):
        tags = []
    return {
        "id": str(row.get("id") or ""),
        "project_id": str(row.get("project_id") or ""),
        "suite_id": row.get("suite_id"),
        "user_id": str(row.get("user_id") or ""),
        "title": str(row.get("title") or ""),
        "priority": str(row.get("priority") or "P2"),
        "status": str(row.get("status") or "draft"),
        "precondition": str(row.get("precondition") or ""),
        "steps": _normalize_steps(steps),
        "tags": _normalize_tags(tags),
        "fields": fields,
        "source": str(row.get("source") or "manual"),
        "source_ref": row.get("source_ref"),
        "req_ref": row.get("req_ref"),
        "defect_ref": row.get("defect_ref"),
        "is_deleted": bool(int(row.get("is_deleted") or 0)),
        "deleted_at": str(row.get("deleted_at") or "") or None,
        "deleted_by": str(row.get("deleted_by") or "") or None,
        "last_result": str(row.get("last_result") or "") or None,
        "last_executed_at": str(row.get("last_executed_at") or "") or None,
        "created_at": str(row.get("created_at") or ""),
        "updated_at": str(row.get("updated_at") or ""),
    }


def _serialize_list_item(row: dict[str, Any]) -> dict[str, Any]:
    """列表接口轻量序列化：截断长文本，跳过删除元数据与重度规范化。"""
    try:
        steps_raw = json.loads(row.get("steps_json") or "[]")
    except json.JSONDecodeError:
        steps_raw = []
    try:
        tags_raw = json.loads(row.get("tags_json") or "[]")
    except json.JSONDecodeError:
        tags_raw = []
    if not isinstance(steps_raw, list):
        steps_raw = []
    if not isinstance(tags_raw, list):
        tags_raw = []

    steps: list[dict[str, str]] = []
    for item in steps_raw[:_LIST_STEPS_MAX]:
        if isinstance(item, dict):
            steps.append(
                {
                    "step": _clip_text(
                        item.get("step") or item.get("步骤描述") or ""
                    ),
                    "expect": _clip_text(
                        item.get("expect") or item.get("预期结果") or ""
                    ),
                }
            )
        else:
            steps.append({"step": _clip_text(item), "expect": ""})

    fields_raw = _normalize_fields(row.get("fields_json"))
    fields = {str(k): _clip_text(v) for k, v in fields_raw.items()}
    tags = [str(t).strip() for t in tags_raw if str(t).strip()][:50]

    return {
        "id": str(row.get("id") or ""),
        "project_id": str(row.get("project_id") or ""),
        "suite_id": row.get("suite_id"),
        "title": str(row.get("title") or ""),
        "priority": str(row.get("priority") or "P2"),
        "status": str(row.get("status") or "draft"),
        "precondition": _clip_text(row.get("precondition") or ""),
        "steps": steps,
        "tags": tags,
        "fields": fields,
        "source": str(row.get("source") or "manual"),
        "last_result": str(row.get("last_result") or "") or None,
        "last_executed_at": str(row.get("last_executed_at") or "") or None,
        "created_at": str(row.get("created_at") or ""),
        "updated_at": str(row.get("updated_at") or ""),
    }


def get_case(case_id: str, *, include_deleted: bool = False) -> Optional[dict[str, Any]]:
    cid = str(case_id or "").strip()
    if not cid:
        return None
    ensure_cm_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if include_deleted:
                cur.execute("SELECT * FROM cm_test_cases WHERE id = %s LIMIT 1", (cid,))
            else:
                cur.execute(
                    "SELECT * FROM cm_test_cases WHERE id = %s AND is_deleted = 0 LIMIT 1",
                    (cid,),
                )
            row = cur.fetchone()
        return _serialize(row) if row else None
    finally:
        conn.close()


def list_cases(
    user_id: str,
    project_id: str,
    *,
    q: str = "",
    priority: str = "",
    status: str = "",
    suite_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    full: bool = False,
) -> dict[str, Any]:
    assert_project_viewer(user_id, project_id)
    ensure_cm_tables()
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 20), 100))
    offset = (page - 1) * page_size

    where = ["project_id = %s", "is_deleted = 0"]
    params: list[Any] = [project_id]

    query = str(q or "").strip()
    if query:
        where.append("title LIKE %s")
        params.append("%" + query[:100] + "%")

    pri = str(priority or "").strip().upper()
    if pri:
        if pri not in ALLOWED_PRIORITIES:
            raise ValueError("优先级仅支持 P0–P3")
        where.append("priority = %s")
        params.append(pri)

    st = str(status or "").strip().lower()
    if st:
        if st not in ALLOWED_STATUSES:
            raise ValueError("状态仅支持 draft/ready/deprecated")
        where.append("status = %s")
        params.append(st)

    if suite_id is not None:
        sid = str(suite_id).strip()
        if sid == "":
            where.append("suite_id IS NULL")
        elif sid == "__all__":
            pass
        else:
            from core.services.case_management.suite_db import (
                assert_suite_in_project,
                collect_suite_subtree_ids,
            )

            assert_suite_in_project(user_id, project_id, sid)
            subtree = collect_suite_subtree_ids(project_id, sid) or [sid]
            if len(subtree) == 1:
                where.append("suite_id = %s")
                params.append(subtree[0])
            else:
                placeholders = ",".join(["%s"] * len(subtree))
                where.append("suite_id IN (" + placeholders + ")")
                params.extend(subtree)

    where_sql = " AND ".join(where)
    select_sql = "SELECT * FROM cm_test_cases WHERE " if full else (
        "SELECT " + _LIST_SELECT_COLS + " FROM cm_test_cases WHERE "
    )
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_test_cases WHERE " + where_sql,
                tuple(params),
            )
            total = int((cur.fetchone() or {}).get("c") or 0)
            cur.execute(
                select_sql
                + where_sql
                + " ORDER BY updated_at DESC LIMIT %s OFFSET %s",
                tuple(params + [page_size, offset]),
            )
            rows = cur.fetchall() or []
        serialize = _serialize if full else _serialize_list_item
        items = [serialize(r) for r in rows]
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    finally:
        conn.close()


def create_case(user_id: str, project_id: str, data: dict[str, Any]) -> dict[str, Any]:
    assert_project_editor(user_id, project_id)
    title = str((data or {}).get("title") or "").strip()
    if not title:
        raise ValueError("用例标题不能为空")
    priority = str((data or {}).get("priority") or "P2").strip().upper() or "P2"
    if priority not in ALLOWED_PRIORITIES:
        raise ValueError("优先级仅支持 P0–P3")
    status = str((data or {}).get("status") or "draft").strip().lower() or "draft"
    if status not in ALLOWED_STATUSES:
        raise ValueError("状态仅支持 draft/ready/deprecated")
    suite_id = (data or {}).get("suite_id")
    sid = str(suite_id).strip() if suite_id is not None else ""
    if sid:
        suite = assert_owned_row(get_suite(sid), user_id, not_found="目录不存在")
        if str(suite.get("project_id") or "") != project_id:
            raise ValueError("目录不属于当前项目")
    else:
        sid = None

    steps = _normalize_steps((data or {}).get("steps"))
    tags = _normalize_tags((data or {}).get("tags"))
    fields = _normalize_fields((data or {}).get("fields"))
    source = str((data or {}).get("source") or "manual").strip()[:32] or "manual"
    source_ref = str((data or {}).get("source_ref") or "").strip()[:128] or None
    now = _now()
    cid = _new_id()
    ensure_cm_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO cm_test_cases ("
                "id, project_id, suite_id, user_id, title, priority, status, "
                "precondition, steps_json, tags_json, fields_json, source, source_ref, "
                "req_ref, defect_ref, is_deleted, deleted_at, created_at, updated_at"
                ") VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    cid,
                    project_id,
                    sid,
                    user_id,
                    title[:500],
                    priority,
                    status,
                    str((data or {}).get("precondition") or ""),
                    json.dumps(steps, ensure_ascii=False),
                    json.dumps(tags, ensure_ascii=False),
                    json.dumps(fields, ensure_ascii=False),
                    source,
                    source_ref,
                    str((data or {}).get("req_ref") or "").strip()[:128] or None,
                    str((data or {}).get("defect_ref") or "").strip()[:128] or None,
                    0,
                    None,
                    now,
                    now,
                ),
            )
    finally:
        conn.close()
    touch_project(project_id)
    return get_case(cid) or {"id": cid, "title": title}


def update_case(user_id: str, case_id: str, data: dict[str, Any]) -> dict[str, Any]:
    case = assert_owned_row(get_case(case_id), user_id, not_found="用例不存在")
    project_id = str(case["project_id"])
    assert_project_editor(user_id, project_id)
    data = data or {}
    fields: list[str] = []
    values: list[Any] = []

    if "title" in data:
        title = str(data.get("title") or "").strip()
        if not title:
            raise ValueError("用例标题不能为空")
        fields.append("title = %s")
        values.append(title[:500])
    if "priority" in data:
        priority = str(data.get("priority") or "").strip().upper()
        if priority not in ALLOWED_PRIORITIES:
            raise ValueError("优先级仅支持 P0–P3")
        fields.append("priority = %s")
        values.append(priority)
    if "status" in data:
        status = str(data.get("status") or "").strip().lower()
        if status not in ALLOWED_STATUSES:
            raise ValueError("状态仅支持 draft/ready/deprecated")
        fields.append("status = %s")
        values.append(status)
    if "precondition" in data:
        fields.append("precondition = %s")
        values.append(str(data.get("precondition") or ""))
    if "steps" in data:
        fields.append("steps_json = %s")
        values.append(json.dumps(_normalize_steps(data.get("steps")), ensure_ascii=False))
    if "tags" in data:
        fields.append("tags_json = %s")
        values.append(json.dumps(_normalize_tags(data.get("tags")), ensure_ascii=False))
    if "fields" in data:
        fields.append("fields_json = %s")
        values.append(json.dumps(_normalize_fields(data.get("fields")), ensure_ascii=False))
    if "suite_id" in data:
        sid_raw = data.get("suite_id")
        sid = str(sid_raw).strip() if sid_raw is not None else ""
        if sid:
            suite = assert_owned_row(get_suite(sid), user_id, not_found="目录不存在")
            if str(suite.get("project_id") or "") != project_id:
                raise ValueError("目录不属于当前项目")
            fields.append("suite_id = %s")
            values.append(sid)
        else:
            fields.append("suite_id = %s")
            values.append(None)
    if "req_ref" in data:
        fields.append("req_ref = %s")
        values.append(str(data.get("req_ref") or "").strip()[:128] or None)
    if "defect_ref" in data:
        fields.append("defect_ref = %s")
        values.append(str(data.get("defect_ref") or "").strip()[:128] or None)

    if not fields:
        return case
    fields.append("updated_at = %s")
    values.append(_now())
    values.append(case_id)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cm_test_cases SET " + ", ".join(fields) + " WHERE id = %s AND is_deleted = 0",
                tuple(values),
            )
    finally:
        conn.close()
    touch_project(project_id)
    return get_case(case_id) or case


def delete_case(user_id: str, case_id: str) -> dict[str, Any]:
    """物理删除用例及其执行记录（不可恢复）。"""
    case = assert_owned_row(
        get_case(case_id, include_deleted=True), user_id, not_found="用例不存在"
    )
    project_id = str(case["project_id"])
    assert_project_editor(user_id, project_id)
    suite_id = case.get("suite_id")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM cm_executions WHERE case_id = %s", (case_id,))
            cur.execute(
                "DELETE FROM cm_test_cases WHERE id = %s AND project_id = %s",
                (case_id, project_id),
            )
            if cur.rowcount == 0:
                raise ValueError("用例不存在或已删除")
    finally:
        conn.close()
    touch_project(project_id)
    schema_reset = False
    if suite_id:
        schema_reset = _reset_suite_schema_if_no_active_cases(
            user_id, project_id, str(suite_id)
        )
    return {
        "deleted": True,
        "id": case_id,
        "hard": True,
        "schema_reset": schema_reset,
        "suite_id": str(suite_id) if suite_id else None,
    }


def _count_active_cases_in_suite(suite_id: str) -> int:
    sid = str(suite_id or "").strip()
    if not sid:
        return 0
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_test_cases "
                "WHERE suite_id = %s AND IFNULL(is_deleted, 0) = 0",
                (sid,),
            )
            return int((cur.fetchone() or {}).get("c") or 0)
    finally:
        conn.close()


def _purge_suite_leftover_cases(suite_id: str) -> None:
    """目录无活跃用例时，清掉残留软删行及其执行记录。"""
    sid = str(suite_id or "").strip()
    if not sid:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM cm_test_cases WHERE suite_id = %s",
                (sid,),
            )
            ids = [str(r.get("id")) for r in (cur.fetchall() or []) if r.get("id")]
            if not ids:
                return
            ph = ",".join(["%s"] * len(ids))
            cur.execute(
                "DELETE FROM cm_executions WHERE case_id IN (" + ph + ")",
                tuple(ids),
            )
            cur.execute("DELETE FROM cm_test_cases WHERE suite_id = %s", (sid,))
    finally:
        conn.close()


def _reset_suite_schema_if_no_active_cases(
    user_id: str, project_id: str, suite_id: str
) -> bool:
    """目录活跃用例为 0 时清空残留并重置列结构。"""
    from core.services.case_management.suite_schema_db import delete_schema_for_suite

    sid = str(suite_id or "").strip()
    if not sid:
        return False
    if _count_active_cases_in_suite(sid) > 0:
        return False
    _purge_suite_leftover_cases(sid)
    delete_schema_for_suite(sid)
    touch_project(project_id)
    return True


def resolve_case_ids(
    user_id: str,
    project_id: str,
    *,
    scope: str,
    case_ids: list[str] | None = None,
    suite_id: str | None = None,
    q: str = "",
    priority: str = "",
    status: str = "",
    limit: int = 200,
) -> dict[str, Any]:
    """将选择范围解析为有序 case_ids（供批量执行等场景）。上限 limit。"""
    assert_project_viewer(user_id, project_id)
    ensure_cm_tables()
    scope_n = str(scope or "").strip().lower()
    # 执行场景默认 ≤200；回收站等可显式提高到 5000
    lim = max(1, min(int(limit or 200), 5000))
    ids: list[str] = []
    truncated = False

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if scope_n == "suite":
                from core.services.case_management.suite_db import (
                    assert_suite_in_project,
                    collect_suite_subtree_ids,
                )

                suite = assert_suite_in_project(user_id, project_id, str(suite_id or ""))
                sid = str(suite["id"])
                subtree = collect_suite_subtree_ids(project_id, sid) or [sid]
                ph_suite = ",".join(["%s"] * len(subtree))
                cur.execute(
                    "SELECT id FROM cm_test_cases "
                    "WHERE project_id = %s AND is_deleted = 0 "
                    "AND suite_id IN (" + ph_suite + ") "
                    "ORDER BY updated_at DESC LIMIT %s",
                    tuple([project_id] + subtree + [lim + 1]),
                )
                rows = cur.fetchall() or []
                ids = [str(r.get("id")) for r in rows if r.get("id")]
            elif scope_n == "filtered":
                where = ["project_id = %s", "is_deleted = 0"]
                params: list[Any] = [project_id]

                query = str(q or "").strip()
                if query:
                    where.append("title LIKE %s")
                    params.append("%" + query[:100] + "%")

                pri = str(priority or "").strip().upper()
                if pri:
                    if pri not in ALLOWED_PRIORITIES:
                        raise ValueError("优先级仅支持 P0–P3")
                    where.append("priority = %s")
                    params.append(pri)

                st = str(status or "").strip().lower()
                if st:
                    if st not in ALLOWED_STATUSES:
                        raise ValueError("状态仅支持 draft/ready/deprecated")
                    where.append("status = %s")
                    params.append(st)

                if suite_id is not None:
                    sid = str(suite_id).strip()
                    if sid == "":
                        where.append("suite_id IS NULL")
                    elif sid == "__all__":
                        pass
                    else:
                        from core.services.case_management.suite_db import (
                            assert_suite_in_project,
                            collect_suite_subtree_ids,
                        )

                        assert_suite_in_project(user_id, project_id, sid)
                        subtree = collect_suite_subtree_ids(project_id, sid) or [sid]
                        if len(subtree) == 1:
                            where.append("suite_id = %s")
                            params.append(subtree[0])
                        else:
                            placeholders = ",".join(["%s"] * len(subtree))
                            where.append("suite_id IN (" + placeholders + ")")
                            params.extend(subtree)

                where_sql = " AND ".join(where)
                cur.execute(
                    "SELECT id FROM cm_test_cases WHERE "
                    + where_sql
                    + " ORDER BY updated_at DESC LIMIT %s",
                    tuple(params + [lim + 1]),
                )
                rows = cur.fetchall() or []
                ids = [str(r.get("id")) for r in rows if r.get("id")]
            elif scope_n == "ids":
                raw = [
                    str(x or "").strip()
                    for x in (case_ids or [])
                    if str(x or "").strip()
                ]
                raw = list(dict.fromkeys(raw))
                if not raw:
                    raise ValueError("请先选择要执行的用例")
                if len(raw) > lim:
                    truncated = True
                    raw = raw[:lim]
                placeholders = ",".join(["%s"] * len(raw))
                cur.execute(
                    "SELECT id FROM cm_test_cases "
                    "WHERE project_id = %s AND is_deleted = 0 "
                    "AND id IN (" + placeholders + ")",
                    tuple([project_id] + raw),
                )
                found = {str(r.get("id")) for r in (cur.fetchall() or []) if r.get("id")}
                ids = [cid for cid in raw if cid in found]
                if not ids:
                    raise ValueError("未找到可执行的用例")
            else:
                raise ValueError("不支持的选择范围")
    finally:
        conn.close()

    if scope_n in ("suite", "filtered") and len(ids) > lim:
        truncated = True
        ids = ids[:lim]

    if not ids:
        raise ValueError("未找到可执行的用例")

    return {
        "case_ids": ids,
        "total": len(ids),
        "truncated": truncated,
        "limit": lim,
    }


def batch_hard_delete_cases(
    user_id: str,
    project_id: str,
    *,
    scope: str,
    case_ids: list[str] | None = None,
    suite_id: str | None = None,
    q: str = "",
    priority: str = "",
    status: str = "",
) -> dict[str, Any]:
    """批量物理删除用例及执行记录。scope=ids|suite|filtered。"""
    assert_project_editor(user_id, project_id)
    ensure_cm_tables()
    scope_n = str(scope or "").strip().lower()
    affected_suite_ids: set[str] = set()
    deleted = 0

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if scope_n == "suite":
                from core.services.case_management.suite_db import (
                    assert_suite_in_project,
                    collect_suite_subtree_ids,
                )

                suite = assert_suite_in_project(user_id, project_id, str(suite_id or ""))
                sid = str(suite["id"])
                subtree = collect_suite_subtree_ids(project_id, sid) or [sid]
                ph_suite = ",".join(["%s"] * len(subtree))
                cur.execute(
                    "SELECT id, suite_id FROM cm_test_cases "
                    "WHERE project_id = %s AND suite_id IN (" + ph_suite + ")",
                    tuple([project_id] + subtree),
                )
                rows = cur.fetchall() or []
                ids = [str(r.get("id")) for r in rows if r.get("id")]
                for r in rows:
                    rs = r.get("suite_id")
                    if rs:
                        affected_suite_ids.add(str(rs))
                for s in subtree:
                    affected_suite_ids.add(str(s))
                if ids:
                    ph = ",".join(["%s"] * len(ids))
                    cur.execute(
                        "DELETE FROM cm_executions WHERE case_id IN (" + ph + ")",
                        tuple(ids),
                    )
                    cur.execute(
                        "DELETE FROM cm_test_cases WHERE project_id = %s AND id IN ("
                        + ph
                        + ")",
                        tuple([project_id] + ids),
                    )
                    deleted = int(cur.rowcount or 0)
            elif scope_n == "filtered":
                where = ["project_id = %s", "is_deleted = 0"]
                params: list[Any] = [project_id]

                query = str(q or "").strip()
                if query:
                    where.append("title LIKE %s")
                    params.append("%" + query[:100] + "%")

                pri = str(priority or "").strip().upper()
                if pri:
                    if pri not in ALLOWED_PRIORITIES:
                        raise ValueError("优先级仅支持 P0–P3")
                    where.append("priority = %s")
                    params.append(pri)

                st = str(status or "").strip().lower()
                if st:
                    if st not in ALLOWED_STATUSES:
                        raise ValueError("状态仅支持 draft/ready/deprecated")
                    where.append("status = %s")
                    params.append(st)

                if suite_id is not None:
                    sid = str(suite_id).strip()
                    if sid == "":
                        where.append("suite_id IS NULL")
                    elif sid == "__all__":
                        pass
                    else:
                        from core.services.case_management.suite_db import (
                            assert_suite_in_project,
                            collect_suite_subtree_ids,
                        )

                        assert_suite_in_project(user_id, project_id, sid)
                        subtree = collect_suite_subtree_ids(project_id, sid) or [sid]
                        if len(subtree) == 1:
                            where.append("suite_id = %s")
                            params.append(subtree[0])
                        else:
                            placeholders = ",".join(["%s"] * len(subtree))
                            where.append("suite_id IN (" + placeholders + ")")
                            params.extend(subtree)

                where_sql = " AND ".join(where)
                cur.execute(
                    "SELECT id, suite_id FROM cm_test_cases WHERE " + where_sql,
                    tuple(params),
                )
                rows = cur.fetchall() or []
                if not rows:
                    raise ValueError("未找到可删除的用例")
                del_ids = [str(r.get("id")) for r in rows if r.get("id")]
                for r in rows:
                    sid = r.get("suite_id")
                    if sid:
                        affected_suite_ids.add(str(sid))
                ph2 = ",".join(["%s"] * len(del_ids))
                cur.execute(
                    "DELETE FROM cm_executions WHERE case_id IN (" + ph2 + ")",
                    tuple(del_ids),
                )
                cur.execute(
                    "DELETE FROM cm_test_cases WHERE project_id = %s AND id IN (" + ph2 + ")",
                    tuple([project_id] + del_ids),
                )
                deleted = int(cur.rowcount or 0)
            elif scope_n == "ids":
                ids = [
                    str(x or "").strip()
                    for x in (case_ids or [])
                    if str(x or "").strip()
                ]
                ids = list(dict.fromkeys(ids))[:500]
                if not ids:
                    raise ValueError("请先选择要删除的用例")
                placeholders = ",".join(["%s"] * len(ids))
                cur.execute(
                    "SELECT id, suite_id FROM cm_test_cases "
                    "WHERE project_id = %s "
                    "AND id IN (" + placeholders + ")",
                    tuple([project_id] + ids),
                )
                rows = cur.fetchall() or []
                if not rows:
                    raise ValueError("未找到可删除的用例")
                del_ids = [str(r.get("id")) for r in rows]
                for r in rows:
                    sid = r.get("suite_id")
                    if sid:
                        affected_suite_ids.add(str(sid))
                ph2 = ",".join(["%s"] * len(del_ids))
                cur.execute(
                    "DELETE FROM cm_executions WHERE case_id IN (" + ph2 + ")",
                    tuple(del_ids),
                )
                cur.execute(
                    "DELETE FROM cm_test_cases WHERE project_id = %s AND id IN (" + ph2 + ")",
                    tuple([project_id] + del_ids),
                )
                deleted = int(cur.rowcount or 0)
            else:
                raise ValueError("不支持的删除范围")
    finally:
        conn.close()

    touch_project(project_id)
    schema_reset_suites: list[str] = []
    for sid in affected_suite_ids:
        if _reset_suite_schema_if_no_active_cases(user_id, project_id, sid):
            schema_reset_suites.append(sid)

    return {
        "deleted": deleted,
        "hard": True,
        "schema_reset": bool(schema_reset_suites),
        "schema_reset_suite_ids": schema_reset_suites,
    }


def batch_update_case_status(
    user_id: str,
    project_id: str,
    *,
    new_status: str,
    scope: str,
    case_ids: list[str] | None = None,
    suite_id: str | None = None,
    q: str = "",
    priority: str = "",
    filter_status: str = "",
) -> dict[str, Any]:
    """批量更新用例状态。scope=ids|suite|filtered。

    new_status: 目标状态 draft/ready/deprecated
    filter_status: filtered 范围下的列表状态筛选（与目标状态区分）
    """
    assert_project_editor(user_id, project_id)
    ensure_cm_tables()
    target = str(new_status or "").strip().lower()
    if target not in ALLOWED_STATUSES:
        raise ValueError("状态仅支持 draft/ready/deprecated")
    scope_n = str(scope or "").strip().lower()
    now = _now()
    updated = 0

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if scope_n == "suite":
                from core.services.case_management.suite_db import (
                    assert_suite_in_project,
                    collect_suite_subtree_ids,
                )

                suite = assert_suite_in_project(user_id, project_id, str(suite_id or ""))
                sid = str(suite["id"])
                subtree = collect_suite_subtree_ids(project_id, sid) or [sid]
                ph_suite = ",".join(["%s"] * len(subtree))
                cur.execute(
                    "UPDATE cm_test_cases SET status=%s, updated_at=%s "
                    "WHERE project_id=%s AND is_deleted=0 "
                    "AND suite_id IN (" + ph_suite + ")",
                    tuple([target, now, project_id] + subtree),
                )
                updated = int(cur.rowcount or 0)
            elif scope_n == "filtered":
                where = ["project_id = %s", "is_deleted = 0"]
                params: list[Any] = [project_id]

                query = str(q or "").strip()
                if query:
                    where.append("title LIKE %s")
                    params.append("%" + query[:100] + "%")

                pri = str(priority or "").strip().upper()
                if pri:
                    if pri not in ALLOWED_PRIORITIES:
                        raise ValueError("优先级仅支持 P0–P3")
                    where.append("priority = %s")
                    params.append(pri)

                st = str(filter_status or "").strip().lower()
                if st:
                    if st not in ALLOWED_STATUSES:
                        raise ValueError("状态仅支持 draft/ready/deprecated")
                    where.append("status = %s")
                    params.append(st)

                if suite_id is not None:
                    sid = str(suite_id).strip()
                    if sid == "":
                        where.append("suite_id IS NULL")
                    elif sid == "__all__":
                        pass
                    else:
                        from core.services.case_management.suite_db import (
                            assert_suite_in_project,
                            collect_suite_subtree_ids,
                        )

                        assert_suite_in_project(user_id, project_id, sid)
                        subtree = collect_suite_subtree_ids(project_id, sid) or [sid]
                        if len(subtree) == 1:
                            where.append("suite_id = %s")
                            params.append(subtree[0])
                        else:
                            placeholders = ",".join(["%s"] * len(subtree))
                            where.append("suite_id IN (" + placeholders + ")")
                            params.extend(subtree)

                where_sql = " AND ".join(where)
                cur.execute(
                    "UPDATE cm_test_cases SET status=%s, updated_at=%s WHERE "
                    + where_sql,
                    tuple([target, now] + params),
                )
                updated = int(cur.rowcount or 0)
            elif scope_n == "ids":
                ids = [
                    str(x or "").strip()
                    for x in (case_ids or [])
                    if str(x or "").strip()
                ]
                ids = list(dict.fromkeys(ids))[:5000]
                if not ids:
                    raise ValueError("请先选择要修改的用例")
                placeholders = ",".join(["%s"] * len(ids))
                cur.execute(
                    "UPDATE cm_test_cases SET status=%s, updated_at=%s "
                    "WHERE project_id=%s AND is_deleted=0 "
                    "AND id IN (" + placeholders + ")",
                    tuple([target, now, project_id] + ids),
                )
                updated = int(cur.rowcount or 0)
            else:
                raise ValueError("不支持的选择范围")
    finally:
        conn.close()

    if updated <= 0:
        raise ValueError("未找到可更新的用例")
    touch_project(project_id)
    return {"updated": updated, "status": target}


def batch_soft_delete_cases(
    user_id: str,
    project_id: str,
    *,
    scope: str,
    case_ids: list[str] | None = None,
    suite_id: str | None = None,
    q: str = "",
    priority: str = "",
    status: str = "",
) -> dict[str, Any]:
    """兼容旧名：现已改为物理删除。"""
    return batch_hard_delete_cases(
        user_id,
        project_id,
        scope=scope,
        case_ids=case_ids,
        suite_id=suite_id,
        q=q,
        priority=priority,
        status=status,
    )


def bulk_insert_cases(
    user_id: str,
    project_id: str,
    cases: list[dict[str, Any]],
) -> dict[str, Any]:
    assert_project_editor(user_id, project_id)
    ensure_cm_tables()
    created = 0
    errors: list[str] = []
    for i, item in enumerate(cases or []):
        try:
            create_case(user_id, project_id, item)
            created += 1
        except Exception as exc:  # noqa: BLE001 — 批量导入收集错误
            errors.append("第 %d 条: %s" % (i + 1, exc))
            if len(errors) >= 20:
                break
    return {"created": created, "errors": errors}
