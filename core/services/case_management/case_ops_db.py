"""用例运维能力：移动/复制/回收站。独立于旧 hard-delete / list 主路径，避免改坏既有语义。"""

from __future__ import annotations

import time
from typing import Any

from core.services.case_management.access import (
    assert_owned_row,
    assert_project_editor,
    assert_project_owner,
    assert_project_viewer,
)
from core.services.case_management.case_db import (
    create_case,
    get_case,
    update_case,
    _count_active_cases_in_suite,
)
from core.services.case_management.project_db import ensure_cm_tables, touch_project
from core.services.case_management.suite_db import assert_suite_in_project
from core.services.test_cases.mysql_db import get_connection

_MAX_BATCH = 200
_MAX_TRASH_BATCH = 5000


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _resolve_trash_scope(
    actor_id: str,
    project_id: str,
    *,
    for_user_id: str | None = None,
    write: bool = False,
) -> str:
    """
    回收站按操作人隔离。
    - 默认查看/操作自己的回收站
    - 项目负责人可指定 for_user_id 查看/操作其他成员的回收站
    """
    aid = str(actor_id or "").strip()
    if write:
        assert_project_editor(aid, project_id)
    else:
        assert_project_viewer(aid, project_id)
    target = str(for_user_id or "").strip() or aid
    if target != aid:
        assert_project_owner(aid, project_id)
        from core.services.case_management.member_db import get_member_role

        if not get_member_role(target, project_id):
            raise ValueError("该用户不是项目成员")
    return target


def _reset_schema_keep_trash(user_id: str, project_id: str, suite_id: str) -> bool:
    """活跃用例为 0 时仅重置列头，保留回收站软删行（不走硬删残留清理）。"""
    from core.services.case_management.suite_schema_db import delete_schema_for_suite

    sid = str(suite_id or "").strip()
    if not sid:
        return False
    if _count_active_cases_in_suite(sid) > 0:
        return False
    delete_schema_for_suite(sid)
    touch_project(project_id)
    return True


def _normalize_ids(case_ids: list[str] | None, *, max_n: int = _MAX_BATCH) -> list[str]:
    raw = [str(x or "").strip() for x in (case_ids or []) if str(x or "").strip()]
    out = list(dict.fromkeys(raw))
    if not out:
        raise ValueError("请先选择用例")
    if len(out) > max_n:
        raise ValueError("单次最多处理 %d 条" % max_n)
    return out


def move_cases(
    user_id: str,
    project_id: str,
    *,
    case_ids: list[str],
    target_suite_id: str,
) -> dict[str, Any]:
    assert_project_editor(user_id, project_id)
    ids = _normalize_ids(case_ids)
    target = assert_suite_in_project(user_id, project_id, str(target_suite_id or ""))
    tid = str(target["id"])
    moved = 0
    skipped = 0
    errors: list[str] = []
    affected_suites: set[str] = set()
    for cid in ids:
        try:
            case = assert_owned_row(get_case(cid), user_id, not_found="用例不存在")
            if str(case.get("project_id") or "") != project_id:
                raise ValueError("用例不属于当前项目")
            old_sid = str(case.get("suite_id") or "")
            if old_sid == tid:
                skipped += 1
                continue
            update_case(user_id, cid, {"suite_id": tid})
            moved += 1
            if old_sid:
                affected_suites.add(old_sid)
        except Exception as exc:  # noqa: BLE001
            errors.append("%s: %s" % (cid[:8], exc))
            if len(errors) >= 20:
                break
    schema_reset_suite_ids: list[str] = []
    for sid in affected_suites:
        if _reset_schema_keep_trash(user_id, project_id, sid):
            schema_reset_suite_ids.append(sid)
    touch_project(project_id)
    return {
        "moved": moved,
        "skipped": skipped,
        "errors": errors,
        "target_suite_id": tid,
        "schema_reset_suite_ids": schema_reset_suite_ids,
    }


def copy_cases(
    user_id: str,
    project_id: str,
    *,
    case_ids: list[str],
    target_suite_id: str,
    title_suffix: str = " (副本)",
) -> dict[str, Any]:
    assert_project_editor(user_id, project_id)
    ids = _normalize_ids(case_ids)
    target = assert_suite_in_project(user_id, project_id, str(target_suite_id or ""))
    tid = str(target["id"])
    suffix = str(title_suffix if title_suffix is not None else " (副本)")
    created = 0
    errors: list[str] = []
    items: list[dict[str, Any]] = []
    for cid in ids:
        try:
            case = assert_owned_row(get_case(cid), user_id, not_found="用例不存在")
            if str(case.get("project_id") or "") != project_id:
                raise ValueError("用例不属于当前项目")
            title = str(case.get("title") or "").strip() or "未命名用例"
            if suffix and not title.endswith(suffix):
                title = (title + suffix)[:500]
            item = create_case(
                user_id,
                project_id,
                {
                    "title": title,
                    "priority": case.get("priority") or "P2",
                    "status": case.get("status") or "draft",
                    "suite_id": tid,
                    "precondition": case.get("precondition") or "",
                    "steps": case.get("steps") or [],
                    "tags": case.get("tags") or [],
                    "fields": case.get("fields") or {},
                    "source": "copy",
                    "source_ref": str(cid)[:128],
                },
            )
            created += 1
            items.append({"id": item.get("id"), "title": item.get("title")})
        except Exception as exc:  # noqa: BLE001
            errors.append("%s: %s" % (cid[:8], exc))
            if len(errors) >= 20:
                break
    return {"created": created, "items": items, "errors": errors, "target_suite_id": tid}


def trash_cases(
    user_id: str,
    project_id: str,
    *,
    case_ids: list[str],
) -> dict[str, Any]:
    """软删除：移入回收站，保留执行记录。"""
    assert_project_editor(user_id, project_id)
    ids = _normalize_ids(case_ids, max_n=_MAX_TRASH_BATCH)
    ensure_cm_tables()
    now = _now()
    trashed = 0
    affected_suites: set[str] = set()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for cid in ids:
                cur.execute(
                    "SELECT id, suite_id FROM cm_test_cases "
                    "WHERE id = %s AND project_id = %s AND is_deleted = 0 "
                    "LIMIT 1",
                    (cid, project_id),
                )
                row = cur.fetchone()
                if not row:
                    continue
                cur.execute(
                    "UPDATE cm_test_cases "
                    "SET is_deleted = 1, deleted_at = %s, deleted_by = %s, updated_at = %s "
                    "WHERE id = %s AND is_deleted = 0",
                    (now, user_id, now, cid),
                )
                if cur.rowcount:
                    trashed += 1
                    sid = row.get("suite_id")
                    if sid:
                        affected_suites.add(str(sid))
    finally:
        conn.close()
    schema_reset_suite_ids: list[str] = []
    for sid in affected_suites:
        if _reset_schema_keep_trash(user_id, project_id, sid):
            schema_reset_suite_ids.append(sid)
    touch_project(project_id)
    return {
        "trashed": trashed,
        "hard": False,
        "schema_reset": bool(schema_reset_suite_ids),
        "schema_reset_suite_ids": schema_reset_suite_ids,
    }


def trash_case(user_id: str, case_id: str) -> dict[str, Any]:
    case = assert_owned_row(get_case(case_id), user_id, not_found="用例不存在")
    project_id = str(case["project_id"])
    result = trash_cases(user_id, project_id, case_ids=[case_id])
    return {
        "deleted": True,
        "id": case_id,
        "hard": False,
        "trashed": result.get("trashed") or 0,
        "schema_reset": result.get("schema_reset"),
        "suite_id": case.get("suite_id"),
        "schema_reset_suite_ids": result.get("schema_reset_suite_ids") or [],
    }


def restore_cases(
    user_id: str,
    project_id: str,
    *,
    case_ids: list[str],
    for_user_id: str | None = None,
) -> dict[str, Any]:
    scope_uid = _resolve_trash_scope(
        user_id, project_id, for_user_id=for_user_id, write=True
    )
    ids = _normalize_ids(case_ids, max_n=_MAX_TRASH_BATCH)
    ensure_cm_tables()
    now = _now()
    restored = 0
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for cid in ids:
                cur.execute(
                    "UPDATE cm_test_cases "
                    "SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, updated_at = %s "
                    "WHERE id = %s AND project_id = %s AND is_deleted = 1 AND deleted_by = %s",
                    (now, cid, project_id, scope_uid),
                )
                if cur.rowcount:
                    restored += 1
    finally:
        conn.close()
    touch_project(project_id)
    return {"restored": restored, "scope_user_id": scope_uid}


def purge_cases(
    user_id: str,
    project_id: str,
    *,
    case_ids: list[str],
    for_user_id: str | None = None,
) -> dict[str, Any]:
    """回收站彻底删除（物理删除）。有团队时仅项目负责人可操作。"""
    from core.services.case_management.case_db import delete_case
    from core.services.case_management.member_db import (
        get_member_role,
        project_has_team,
    )

    if project_has_team(project_id):
        role = get_member_role(user_id, project_id) or ""
        if role != "owner":
            raise ValueError("项目已有团队成员，仅负责人可彻底删除回收站用例")

    scope_uid = _resolve_trash_scope(
        user_id, project_id, for_user_id=for_user_id, write=True
    )
    ids = _normalize_ids(case_ids, max_n=_MAX_TRASH_BATCH)
    ensure_cm_tables()
    deleted = 0
    errors: list[str] = []
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            allowed: list[str] = []
            for cid in ids:
                cur.execute(
                    "SELECT id FROM cm_test_cases "
                    "WHERE id = %s AND project_id = %s AND is_deleted = 1 AND deleted_by = %s "
                    "LIMIT 1",
                    (cid, project_id, scope_uid),
                )
                if cur.fetchone():
                    allowed.append(cid)
    finally:
        conn.close()
    for cid in allowed:
        try:
            delete_case(user_id, cid)
            deleted += 1
        except Exception as exc:  # noqa: BLE001
            errors.append("%s: %s" % (cid[:8], exc))
            if len(errors) >= 20:
                break
    return {
        "deleted": deleted,
        "hard": True,
        "errors": errors,
        "scope_user_id": scope_uid,
    }


def list_trash(
    user_id: str,
    project_id: str,
    *,
    page: int = 1,
    page_size: int = 20,
    for_user_id: str | None = None,
) -> dict[str, Any]:
    from core.services.case_management.member_db import get_member_role, project_has_team
    from core.services.case_management.trash_cleanup_db import retention_days

    scope_uid = _resolve_trash_scope(
        user_id, project_id, for_user_id=for_user_id, write=False
    )
    my_role = get_member_role(user_id, project_id) or "viewer"
    can_browse_members = my_role == "owner"
    has_team = project_has_team(project_id)
    # 无团队：编辑者及以上可彻底删除；有团队：仅负责人
    allow_purge = (not has_team and my_role in ("owner", "editor")) or (
        has_team and my_role == "owner"
    )
    ensure_cm_tables()

    retain = retention_days()
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or 20), 100))
    offset = (page - 1) * page_size
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_test_cases "
                "WHERE project_id = %s AND is_deleted = 1 AND deleted_by = %s",
                (project_id, scope_uid),
            )
            total = int((cur.fetchone() or {}).get("c") or 0)
            cur.execute(
                "SELECT c.id, c.title, c.suite_id, c.deleted_at, c.deleted_by, c.updated_at, "
                "s.name AS suite_name, "
                "CASE "
                "  WHEN c.deleted_at IS NULL THEN NULL "
                "  ELSE GREATEST(0, %s - DATEDIFF(NOW(), c.deleted_at)) "
                "END AS days_left "
                "FROM cm_test_cases c "
                "LEFT JOIN cm_suites s ON s.id = c.suite_id "
                "WHERE c.project_id = %s AND c.is_deleted = 1 AND c.deleted_by = %s "
                "ORDER BY c.deleted_at DESC LIMIT %s OFFSET %s",
                (retain, project_id, scope_uid, page_size, offset),
            )
            rows = cur.fetchall() or []
        items = [
            {
                "id": str(r.get("id") or ""),
                "title": str(r.get("title") or ""),
                "suite_id": r.get("suite_id"),
                "suite_name": str(r.get("suite_name") or "") or "（无目录）",
                "deleted_at": str(r.get("deleted_at") or "") or None,
                "deleted_by": str(r.get("deleted_by") or "") or None,
                "updated_at": str(r.get("updated_at") or ""),
                "days_left": (
                    None
                    if r.get("days_left") is None
                    else max(0, int(r.get("days_left") or 0))
                ),
            }
            for r in rows
        ]
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "retention_days": retain,
            "scope_user_id": scope_uid,
            "can_browse_members": can_browse_members,
            "has_team": has_team,
            "allow_purge": allow_purge,
            "my_role": my_role,
        }
    finally:
        conn.close()


def titles_in_suite(
    user_id: str,
    project_id: str,
    suite_id: str,
) -> dict[str, str]:
    """目录内活跃用例 title -> id（供导入去重）。"""
    assert_project_editor(user_id, project_id)
    assert_suite_in_project(user_id, project_id, suite_id)
    ensure_cm_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, title FROM cm_test_cases "
                "WHERE project_id = %s AND suite_id = %s AND is_deleted = 0",
                (project_id, suite_id),
            )
            rows = cur.fetchall() or []
        out: dict[str, str] = {}
        for r in rows:
            title = str(r.get("title") or "").strip()
            cid = str(r.get("id") or "")
            if title and cid and title not in out:
                out[title] = cid
        return out
    finally:
        conn.close()
