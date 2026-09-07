"""缺陷 CRUD、评论、关联用例。"""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from core.services.defect_management.schema import ensure_dm_tables
from core.services.test_cases.mysql_db import get_connection

STATUSES = ("open", "confirmed", "in_progress", "resolved", "closed", "rejected")
SEVERITIES = ("blocker", "major", "normal", "minor", "trivial")

STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    # open 可直接进入处理中（跳过确认），贴合从执行失败一键建缺陷后的日常流转
    "open": frozenset({"confirmed", "in_progress", "rejected", "closed"}),
    "confirmed": frozenset({"in_progress", "rejected", "closed"}),
    "in_progress": frozenset({"resolved", "closed"}),
    "resolved": frozenset({"closed", "in_progress"}),
    # 已关闭可重开为待处理，或直接回到处理中
    "rejected": frozenset({"open"}),
    "closed": frozenset({"open", "in_progress"}),
}

TITLE_MAX = 200
DESC_MAX = 8000
COMMENT_MAX = 4000
PAGE_DEFAULT = 20
PAGE_MAX = 100


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _new_id() -> str:
    return uuid.uuid4().hex


def _dt(v: Any) -> Optional[str]:
    if v is None:
        return None
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    return str(v)


def normalize_status(v: str) -> str:
    s = str(v or "").strip().lower()
    if s not in STATUSES:
        raise ValueError("无效的缺陷状态")
    return s


def normalize_severity(v: str) -> str:
    s = str(v or "").strip().lower() or "normal"
    if s not in SEVERITIES:
        raise ValueError("无效的严重程度")
    return s


def _user_brief(user_id: str) -> dict[str, Any]:
    from core.services.case_management.invite_db import _user_display

    return _user_display(user_id)


def _next_number(cur, project_id: str) -> int:
    cur.execute(
        "SELECT next_number FROM dm_project_counters WHERE project_id = %s FOR UPDATE",
        (project_id,),
    )
    row = cur.fetchone()
    if row:
        n = int(row.get("next_number") or 1)
        cur.execute(
            "UPDATE dm_project_counters SET next_number = %s WHERE project_id = %s",
            (n + 1, project_id),
        )
        return n
    cur.execute(
        "INSERT INTO dm_project_counters (project_id, next_number) VALUES (%s, 2)",
        (project_id,),
    )
    return 1


def _assert_member_of_project(user_id: str, project_id: str) -> None:
    from core.services.case_management.member_db import get_member_role

    if not get_member_role(user_id, project_id):
        raise ValueError("处理人必须是项目正式成员")


def _normalize_handler_ids(raw: Any, *, project_id: str) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        raw = [raw] if raw.strip() else []
    if not isinstance(raw, (list, tuple)):
        raise ValueError("处理人须为数组")
    seen: set[str] = set()
    out: list[str] = []
    for x in raw:
        uid = str(x or "").strip()
        if not uid or uid in seen:
            continue
        seen.add(uid)
        out.append(uid)
    if len(out) > 20:
        raise ValueError("处理人最多 20 人")
    for uid in out:
        _assert_member_of_project(uid, project_id)
    return out


def _load_handlers_map(defect_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
    ids = [str(x or "").strip() for x in defect_ids if str(x or "").strip()]
    if not ids:
        return {}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            fmt = ",".join(["%s"] * len(ids))
            cur.execute(
                "SELECT defect_id, user_id FROM dm_defect_handlers "
                "WHERE defect_id IN (" + fmt + ") ORDER BY created_at ASC",
                tuple(ids),
            )
            rows = cur.fetchall() or []
        by: dict[str, list[dict[str, Any]]] = {i: [] for i in ids}
        for r in rows:
            did = str(r.get("defect_id") or "")
            uid = str(r.get("user_id") or "")
            if not did or not uid:
                continue
            brief = _user_brief(uid)
            by.setdefault(did, []).append(
                {
                    "user_id": uid,
                    "label": brief.get("label") or uid,
                    "email": brief.get("email"),
                    "display_name": brief.get("display_name"),
                }
            )
        return by
    finally:
        conn.close()


def _replace_handlers(cur, *, defect_id: str, handler_ids: list[str], now: str) -> None:
    did = str(defect_id or "").strip()
    cur.execute("DELETE FROM dm_defect_handlers WHERE defect_id = %s", (did,))
    for uid in handler_ids:
        cur.execute(
            "INSERT INTO dm_defect_handlers (defect_id, user_id, created_at) VALUES (%s,%s,%s)",
            (did, uid, now),
        )


def _serialize_defect(
    row: dict[str, Any],
    *,
    case_ids: list[str] | None = None,
    handlers: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    reporter_id = str(row.get("reporter_id") or "")
    handler_list = list(handlers or [])
    if not handler_list:
        legacy = str(row.get("assignee_id") or "").strip()
        if legacy:
            brief = _user_brief(legacy)
            handler_list = [
                {
                    "user_id": legacy,
                    "label": brief.get("label") or legacy,
                    "email": brief.get("email"),
                    "display_name": brief.get("display_name"),
                }
            ]
    primary = handler_list[0]["user_id"] if handler_list else None
    out = {
        "id": str(row.get("id") or ""),
        "project_id": str(row.get("project_id") or ""),
        "number": int(row.get("number") or 0),
        "display_id": "D-%s" % int(row.get("number") or 0),
        "title": str(row.get("title") or ""),
        "description": str(row.get("description") or ""),
        "status": str(row.get("status") or "open"),
        "severity": str(row.get("severity") or "normal"),
        "reporter_id": reporter_id,
        "reporter": _user_brief(reporter_id) if reporter_id else None,
        "handler_ids": [h["user_id"] for h in handler_list],
        "handlers": handler_list,
        # 兼容旧字段：主处理人
        "assignee_id": primary,
        "assignee": handler_list[0] if handler_list else None,
        "created_at": _dt(row.get("created_at")),
        "updated_at": _dt(row.get("updated_at")),
    }
    if case_ids is not None:
        out["case_ids"] = case_ids
    return out


def list_projects_for_defect(user_id: str) -> list[dict[str, Any]]:
    from core.services.case_management.member_db import count_project_members
    from core.services.case_management.project_db import list_projects

    items = []
    for p in list_projects(user_id):
        pid = str(p.get("id") or "")
        count = count_project_members(pid)
        item = dict(p)
        item["member_count"] = count
        item["team_ready"] = count >= 2
        items.append(item)
    return items


def list_defects(
    *,
    project_id: str,
    page: int = 1,
    page_size: int = PAGE_DEFAULT,
    status: str = "",
    severity: str = "",
    assignee_id: str = "",
    q: str = "",
    assigned_to_me: str = "",
    unclosed: bool = False,
) -> dict[str, Any]:
    ensure_dm_tables()
    pid = str(project_id or "").strip()
    page = max(1, int(page or 1))
    page_size = min(PAGE_MAX, max(1, int(page_size or PAGE_DEFAULT)))
    where = ["project_id = %s"]
    args: list[Any] = [pid]
    st = str(status or "").strip().lower()
    if st:
        normalize_status(st)
        where.append("status = %s")
        args.append(st)
    elif unclosed:
        where.append("status NOT IN ('closed', 'rejected')")
    sev = str(severity or "").strip().lower()
    if sev:
        parts = []
        for piece in sev.split(","):
            p = piece.strip()
            if not p:
                continue
            parts.append(normalize_severity(p))
        if len(parts) == 1:
            where.append("severity = %s")
            args.append(parts[0])
        elif parts:
            where.append(
                "severity IN (" + ",".join(["%s"] * len(parts)) + ")"
            )
            args.extend(parts)
    aid = str(assignee_id or assigned_to_me or "").strip()
    if aid:
        where.append(
            "EXISTS (SELECT 1 FROM dm_defect_handlers h "
            "WHERE h.defect_id = dm_defects.id AND h.user_id = %s)"
        )
        args.append(aid)
    keyword = str(q or "").strip()
    if keyword:
        kw = keyword[:100]
        num_kw = kw
        if len(num_kw) >= 2 and num_kw[0] in "Dd" and num_kw[1] == "-":
            num_kw = num_kw[2:].strip()
        elif len(num_kw) >= 2 and num_kw[0] in "Dd" and num_kw[1:].isdigit():
            num_kw = num_kw[1:]
        where.append(
            "(title LIKE %s OR CONCAT('D-', CAST(number AS CHAR)) LIKE %s "
            "OR CAST(number AS CHAR) LIKE %s)"
        )
        like = "%" + kw + "%"
        args.extend([like, like, "%" + num_kw + "%"])
    where_sql = " AND ".join(where)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM dm_defects WHERE " + where_sql,
                tuple(args),
            )
            total = int((cur.fetchone() or {}).get("c") or 0)
            offset = (page - 1) * page_size
            cur.execute(
                "SELECT id, project_id, number, title, description, status, severity, "
                "reporter_id, assignee_id, created_at, updated_at "
                "FROM dm_defects WHERE "
                + where_sql
                + " ORDER BY updated_at DESC LIMIT %s OFFSET %s",
                tuple(args + [page_size, offset]),
            )
            rows = cur.fetchall() or []
            # 侧栏/概览用：项目内各状态数量（不受当前筛选影响）
            cur.execute(
                "SELECT status, COUNT(*) AS c FROM dm_defects "
                "WHERE project_id = %s GROUP BY status",
                (pid,),
            )
            status_counts: dict[str, int] = {}
            for r in cur.fetchall() or []:
                status_counts[str(r.get("status") or "")] = int(r.get("c") or 0)
            cur.execute(
                "SELECT severity, COUNT(*) AS c FROM dm_defects "
                "WHERE project_id = %s AND status NOT IN ('closed', 'rejected') "
                "GROUP BY severity",
                (pid,),
            )
            open_severity_counts: dict[str, int] = {}
            for r in cur.fetchall() or []:
                open_severity_counts[str(r.get("severity") or "")] = int(r.get("c") or 0)
        ids = [str(r.get("id") or "") for r in rows]
        hmap = _load_handlers_map(ids)
        return {
            "items": [
                _serialize_defect(r, handlers=hmap.get(str(r.get("id") or ""), []))
                for r in rows
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
            "status_counts": status_counts,
            "open_severity_counts": open_severity_counts,
        }
    finally:
        conn.close()


def get_defect(defect_id: str) -> Optional[dict[str, Any]]:
    ensure_dm_tables()
    did = str(defect_id or "").strip()
    if not did:
        return None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, project_id, number, title, description, status, severity, "
                "reporter_id, assignee_id, created_at, updated_at "
                "FROM dm_defects WHERE id = %s LIMIT 1",
                (did,),
            )
            row = cur.fetchone()
            if not row:
                return None
            cur.execute(
                "SELECT case_id FROM dm_defect_case_links WHERE defect_id = %s",
                (did,),
            )
            links = [str(r.get("case_id") or "") for r in (cur.fetchall() or [])]
        handlers = _load_handlers_map([did]).get(did, [])
        return _serialize_defect(row, case_ids=links, handlers=handlers)
    finally:
        conn.close()


def create_defect(
    *,
    project_id: str,
    reporter_id: str,
    title: str,
    description: str = "",
    severity: str = "normal",
    assignee_id: str | None = None,
    handler_ids: Any = None,
    status: str = "open",
) -> dict[str, Any]:
    ensure_dm_tables()
    pid = str(project_id or "").strip()
    rid = str(reporter_id or "").strip()
    title_n = str(title or "").strip()
    if not title_n:
        raise ValueError("标题不能为空")
    if len(title_n) > TITLE_MAX:
        raise ValueError("标题过长")
    desc = str(description or "")
    if len(desc) > DESC_MAX:
        raise ValueError("描述过长（最多 %s 字）" % DESC_MAX)
    sev = normalize_severity(severity)
    st = normalize_status(status) if status else "open"
    if handler_ids is not None:
        handlers = _normalize_handler_ids(handler_ids, project_id=pid)
    elif assignee_id is not None:
        handlers = _normalize_handler_ids([assignee_id] if assignee_id else [], project_id=pid)
    else:
        handlers = []
    primary = handlers[0] if handlers else None
    now = _now()
    did = _new_id()
    num = 1
    conn = get_connection()
    prev = conn.get_autocommit()
    try:
        conn.autocommit(False)
        with conn.cursor() as cur:
            num = _next_number(cur, pid)
            cur.execute(
                "INSERT INTO dm_defects "
                "(id, project_id, number, title, description, status, severity, "
                "reporter_id, assignee_id, created_at, updated_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (did, pid, num, title_n, desc, st, sev, rid, primary, now, now),
            )
            _replace_handlers(cur, defect_id=did, handler_ids=handlers, now=now)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        try:
            conn.autocommit(prev)
        except Exception:  # noqa: BLE001
            pass
        conn.close()
    item = get_defect(did)
    for hid in handlers:
        if hid != rid and item:
            _notify_assigned(hid, item)
    return item or {
        "id": did,
        "project_id": pid,
        "number": num,
        "display_id": "D-%s" % num,
        "title": title_n,
    }


def _notify_assigned(assignee_id: str, defect: dict[str, Any]) -> None:
    try:
        from core.services.case_management.message_db import create_message

        create_message(
            user_id=assignee_id,
            msg_type="defect_assigned",
            title="缺陷处理：%s" % (defect.get("display_id") or defect.get("id") or ""),
            body=str(defect.get("title") or "")[:200],
            ref_type="defect",
            ref_id=str(defect.get("id") or ""),
            payload={
                "project_id": defect.get("project_id"),
                "defect_id": defect.get("id"),
                "display_id": defect.get("display_id"),
            },
        )
    except Exception:  # noqa: BLE001
        pass


def update_defect(
    *,
    defect_id: str,
    actor_id: str,
    title: str | None = None,
    description: str | None = None,
    status: str | None = None,
    severity: str | None = None,
    assignee_id: Any = ...,
    handler_ids: Any = ...,
) -> dict[str, Any]:
    ensure_dm_tables()
    did = str(defect_id or "").strip()
    cur_item = get_defect(did)
    if not cur_item:
        raise ValueError("缺陷不存在")
    pid = str(cur_item.get("project_id") or "")
    fields: list[str] = []
    args: list[Any] = []
    if title is not None:
        title_n = str(title or "").strip()
        if not title_n:
            raise ValueError("标题不能为空")
        if len(title_n) > TITLE_MAX:
            raise ValueError("标题过长")
        fields.append("title = %s")
        args.append(title_n)
    if description is not None:
        desc = str(description or "")
        if len(desc) > DESC_MAX:
            raise ValueError("描述过长（最多 %s 字）" % DESC_MAX)
        fields.append("description = %s")
        args.append(desc)
    if severity is not None:
        fields.append("severity = %s")
        args.append(normalize_severity(severity))
    old_status = str(cur_item.get("status") or "open")
    if status is not None:
        new_st = normalize_status(status)
        if new_st != old_status:
            allowed = STATUS_TRANSITIONS.get(old_status, frozenset())
            if new_st not in allowed:
                raise ValueError("不允许从「%s」变更为「%s」" % (old_status, new_st))
        fields.append("status = %s")
        args.append(new_st)

    handlers_changed = False
    new_handlers: list[str] | None = None
    if handler_ids is not ...:
        new_handlers = _normalize_handler_ids(handler_ids, project_id=pid)
        handlers_changed = True
    elif assignee_id is not ...:
        new_handlers = _normalize_handler_ids(
            [assignee_id] if assignee_id else [], project_id=pid
        )
        handlers_changed = True

    if handlers_changed and new_handlers is not None:
        primary = new_handlers[0] if new_handlers else None
        fields.append("assignee_id = %s")
        args.append(primary)

    if not fields and not handlers_changed:
        return cur_item

    now = _now()
    old_ids = set(cur_item.get("handler_ids") or [])
    conn = get_connection()
    prev = conn.get_autocommit()
    try:
        conn.autocommit(False)
        with conn.cursor() as cur:
            if fields:
                upd = list(fields) + ["updated_at = %s"]
                upd_args = list(args) + [now, did]
                cur.execute(
                    "UPDATE dm_defects SET " + ", ".join(upd) + " WHERE id = %s",
                    tuple(upd_args),
                )
                if cur.rowcount == 0:
                    raise ValueError("缺陷不存在")
            elif handlers_changed:
                cur.execute(
                    "UPDATE dm_defects SET updated_at = %s WHERE id = %s",
                    (now, did),
                )
            if handlers_changed and new_handlers is not None:
                _replace_handlers(
                    cur, defect_id=did, handler_ids=new_handlers, now=now
                )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        try:
            conn.autocommit(prev)
        except Exception:  # noqa: BLE001
            pass
        conn.close()
    item = get_defect(did)
    if handlers_changed and new_handlers is not None and item:
        actor = str(actor_id or "")
        for hid in new_handlers:
            if hid not in old_ids and hid != actor:
                _notify_assigned(hid, item)
    return item or cur_item


def delete_defect(defect_id: str) -> dict[str, Any]:
    ensure_dm_tables()
    did = str(defect_id or "").strip()
    item = get_defect(did)
    if not item:
        raise ValueError("缺陷不存在")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM dm_defect_comments WHERE defect_id = %s", (did,))
            cur.execute("DELETE FROM dm_defect_case_links WHERE defect_id = %s", (did,))
            cur.execute("DELETE FROM dm_defect_handlers WHERE defect_id = %s", (did,))
            cur.execute("DELETE FROM dm_defects WHERE id = %s", (did,))
    finally:
        conn.close()
    return {"deleted": True, "id": did}


def list_comments(defect_id: str) -> list[dict[str, Any]]:
    ensure_dm_tables()
    did = str(defect_id or "").strip()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, defect_id, user_id, body, created_at "
                "FROM dm_defect_comments WHERE defect_id = %s "
                "ORDER BY created_at ASC",
                (did,),
            )
            rows = cur.fetchall() or []
        out = []
        for r in rows:
            uid = str(r.get("user_id") or "")
            out.append(
                {
                    "id": str(r.get("id") or ""),
                    "defect_id": did,
                    "user_id": uid,
                    "user": _user_brief(uid) if uid else None,
                    "body": str(r.get("body") or ""),
                    "created_at": _dt(r.get("created_at")),
                }
            )
        return out
    finally:
        conn.close()


def add_comment(*, defect_id: str, user_id: str, body: str) -> dict[str, Any]:
    ensure_dm_tables()
    did = str(defect_id or "").strip()
    uid = str(user_id or "").strip()
    text = str(body or "").strip()
    if not text:
        raise ValueError("评论不能为空")
    if len(text) > COMMENT_MAX:
        raise ValueError("评论过长")
    if not get_defect(did):
        raise ValueError("缺陷不存在")
    cid = _new_id()
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO dm_defect_comments (id, defect_id, user_id, body, created_at) "
                "VALUES (%s,%s,%s,%s,%s)",
                (cid, did, uid, text, now),
            )
            cur.execute(
                "UPDATE dm_defects SET updated_at = %s WHERE id = %s",
                (now, did),
            )
    finally:
        conn.close()
    try:
        from core.services.l5_bridge.notify_l5 import notify_defect_comment_l5

        notify_defect_comment_l5(uid, did, comment_body=text)
    except Exception:  # noqa: BLE001
        pass
    return {
        "id": cid,
        "defect_id": did,
        "user_id": uid,
        "user": _user_brief(uid),
        "body": text,
        "created_at": now,
    }


def set_case_links(*, defect_id: str, project_id: str, case_ids: list[str]) -> dict[str, Any]:
    ensure_dm_tables()
    did = str(defect_id or "").strip()
    pid = str(project_id or "").strip()
    raw_ids = [str(x or "").strip() for x in (case_ids or []) if str(x or "").strip()]
    # dedupe keep order
    seen: set[str] = set()
    ids: list[str] = []
    for x in raw_ids:
        if x in seen:
            continue
        seen.add(x)
        ids.append(x)
    if len(ids) > 50:
        raise ValueError("单次最多关联 50 条用例")
    if ids:
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                fmt = ",".join(["%s"] * len(ids))
                cur.execute(
                    "SELECT id FROM cm_test_cases "
                    "WHERE project_id = %s AND is_deleted = 0 AND id IN (" + fmt + ")",
                    tuple([pid] + ids),
                )
                valid = {str(r.get("id") or "") for r in (cur.fetchall() or [])}
            missing = [x for x in ids if x not in valid]
            if missing:
                raise ValueError("存在无效或跨项目的用例，无法关联")
        finally:
            conn.close()
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM dm_defect_case_links WHERE defect_id = %s", (did,))
            for cid in ids:
                cur.execute(
                    "INSERT INTO dm_defect_case_links (defect_id, case_id, created_at) "
                    "VALUES (%s,%s,%s)",
                    (did, cid, now),
                )
            cur.execute(
                "UPDATE dm_defects SET updated_at = %s WHERE id = %s",
                (now, did),
            )
    finally:
        conn.close()
    return {"case_ids": ids}


def list_case_briefs(project_id: str, case_ids: list[str]) -> list[dict[str, Any]]:
    """返回用例简要信息（含最近执行结果，供缺陷抽屉芯片展示）。"""
    pid = str(project_id or "").strip()
    ids = [str(x or "").strip() for x in (case_ids or []) if str(x or "").strip()]
    if not pid or not ids:
        return []
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            fmt = ",".join(["%s"] * len(ids))
            cur.execute(
                "SELECT id, title, last_result FROM cm_test_cases "
                "WHERE project_id = %s AND id IN (" + fmt + ")",
                tuple([pid] + ids),
            )
            rows = cur.fetchall() or []
        by_id: dict[str, dict[str, Any]] = {}
        for r in rows:
            cid = str(r.get("id") or "")
            if not cid:
                continue
            by_id[cid] = {
                "id": cid,
                "title": str(r.get("title") or "") or cid,
                "last_result": str(r.get("last_result") or "").strip(),
            }
        return [by_id[i] for i in ids if i in by_id]
    finally:
        conn.close()
