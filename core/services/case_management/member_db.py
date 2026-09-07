"""用例项目成员（协作）。独立于旧 owner-only 校验路径。"""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from core.services.test_cases.mysql_db import get_connection

ROLES = ("owner", "editor", "viewer")
ROLE_RANK = {"viewer": 1, "editor": 2, "owner": 3}

_MEMBERS_SQL = (
    "CREATE TABLE IF NOT EXISTS cm_project_members ("
    " id CHAR(32) NOT NULL PRIMARY KEY,"
    " project_id CHAR(32) NOT NULL,"
    " user_id CHAR(32) NOT NULL,"
    " role VARCHAR(16) NOT NULL DEFAULT 'editor',"
    " invited_by CHAR(32) NULL,"
    " created_at DATETIME NOT NULL,"
    " UNIQUE KEY uk_cm_member_project_user (project_id, user_id),"
    " INDEX idx_cm_member_user (user_id),"
    " INDEX idx_cm_member_project (project_id)"
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
)


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _new_id() -> str:
    return uuid.uuid4().hex


def ensure_member_tables(cur=None) -> None:
    """幂等建表；可传入已有 cursor，也可自开连接。"""
    if cur is not None:
        cur.execute(_MEMBERS_SQL)
        return
    conn = get_connection()
    try:
        with conn.cursor() as c:
            c.execute(_MEMBERS_SQL)
    finally:
        conn.close()


def normalize_role(role: str) -> str:
    r = str(role or "").strip().lower()
    if r not in ROLE_RANK:
        raise ValueError("角色仅支持 owner/editor/viewer")
    return r


def role_at_least(role: str | None, min_role: str) -> bool:
    return ROLE_RANK.get(str(role or "").lower(), 0) >= ROLE_RANK.get(
        str(min_role or "viewer").lower(), 1
    )


def get_member_role(user_id: str, project_id: str) -> Optional[str]:
    """返回成员角色；非成员返回 None。主 owner 无成员行时视为 owner。"""
    uid = str(user_id or "").strip()
    pid = str(project_id or "").strip()
    if not uid or not pid:
        return None
    ensure_member_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT role FROM cm_project_members "
                "WHERE project_id = %s AND user_id = %s LIMIT 1",
                (pid, uid),
            )
            row = cur.fetchone()
            if row and row.get("role"):
                return normalize_role(str(row.get("role")))
            cur.execute(
                "SELECT user_id FROM cm_projects WHERE id = %s LIMIT 1",
                (pid,),
            )
            proj = cur.fetchone()
            if proj and str(proj.get("user_id") or "") == uid:
                # 存量项目尚未回填成员行时仍可访问
                return "owner"
        return None
    finally:
        conn.close()


def ensure_primary_owner_member(project_id: str, owner_user_id: str) -> None:
    """保证项目主 owner 在成员表中（创建/回填用）。"""
    pid = str(project_id or "").strip()
    uid = str(owner_user_id or "").strip()
    if not pid or not uid:
        return
    ensure_member_tables()
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM cm_project_members "
                "WHERE project_id = %s AND user_id = %s LIMIT 1",
                (pid, uid),
            )
            if cur.fetchone():
                return
            cur.execute(
                "INSERT INTO cm_project_members "
                "(id, project_id, user_id, role, invited_by, created_at) "
                "VALUES (%s,%s,%s,'owner',%s,%s)",
                (_new_id(), pid, uid, uid, now),
            )
    finally:
        conn.close()


def backfill_owner_members(cur) -> None:
    """存量项目：把 cm_projects.user_id 写入成员表 owner（幂等）。"""
    ensure_member_tables(cur)
    cur.execute(
        "INSERT INTO cm_project_members (id, project_id, user_id, role, invited_by, created_at) "
        "SELECT REPLACE(UUID(),'-',''), p.id, p.user_id, 'owner', p.user_id, p.created_at "
        "FROM cm_projects p "
        "WHERE NOT EXISTS ("
        "  SELECT 1 FROM cm_project_members m "
        "  WHERE m.project_id = p.id AND m.user_id = p.user_id"
        ")"
    )


def list_members(project_id: str) -> list[dict[str, Any]]:
    pid = str(project_id or "").strip()
    if not pid:
        return []
    ensure_member_tables()
    try:
        from core.services.auth.auth_db import ensure_auth_tables

        ensure_auth_tables()
    except Exception:  # noqa: BLE001
        pass
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT m.id, m.project_id, m.user_id, m.role, m.invited_by, m.created_at, "
                "u.email AS email, u.phone AS phone, u.display_name AS display_name "
                "FROM cm_project_members m "
                "LEFT JOIN hub_users u ON u.id = m.user_id "
                "WHERE m.project_id = %s "
                "ORDER BY FIELD(m.role,'owner','editor','viewer'), m.created_at ASC",
                (pid,),
            )
            rows = cur.fetchall() or []
        return [_serialize_member(r) for r in rows]
    finally:
        conn.close()


def count_project_members(project_id: str) -> int:
    """项目成员人数（>1 视为已有协作团队）。"""
    pid = str(project_id or "").strip()
    if not pid:
        return 0
    ensure_member_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_project_members WHERE project_id = %s",
                (pid,),
            )
            return int((cur.fetchone() or {}).get("c") or 0)
    finally:
        conn.close()


def project_has_team(project_id: str) -> bool:
    return count_project_members(project_id) > 1


def invite_member(
    *,
    project_id: str,
    target_user_id: str,
    role: str,
    invited_by: str,
) -> dict[str, Any]:
    pid = str(project_id or "").strip()
    tid = str(target_user_id or "").strip()
    iid = str(invited_by or "").strip()
    role_n = normalize_role(role)
    if not pid or not tid:
        raise ValueError("缺少项目或用户")
    if tid == iid and role_n != "owner":
        pass
    ensure_member_tables()
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, role FROM cm_project_members "
                "WHERE project_id = %s AND user_id = %s LIMIT 1",
                (pid, tid),
            )
            exist = cur.fetchone()
            if exist:
                raise ValueError("该用户已是项目成员")
            mid = _new_id()
            cur.execute(
                "INSERT INTO cm_project_members "
                "(id, project_id, user_id, role, invited_by, created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s)",
                (mid, pid, tid, role_n, iid or None, now),
            )
    finally:
        conn.close()
    items = [m for m in list_members(pid) if m.get("user_id") == tid]
    return items[0] if items else {
        "id": mid,
        "project_id": pid,
        "user_id": tid,
        "role": role_n,
        "invited_by": iid,
        "created_at": now,
    }


def update_member_role(
    *,
    project_id: str,
    target_user_id: str,
    role: str,
    actor_user_id: str,
) -> dict[str, Any]:
    pid = str(project_id or "").strip()
    tid = str(target_user_id or "").strip()
    role_n = normalize_role(role)
    if role_n == "owner":
        raise ValueError("请使用「转移管理员」变更负责人，不能直接改为负责人")
    ensure_member_tables()
    from core.services.case_management.project_db import get_project

    proj = get_project(pid)
    if not proj:
        raise ValueError("项目不存在")
    # 不允许把主 owner 降级/改角色
    if str(proj.get("user_id") or "") == tid:
        raise ValueError("不能更改项目负责人的角色，请先转移管理员")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cm_project_members SET role = %s "
                "WHERE project_id = %s AND user_id = %s",
                (role_n, pid, tid),
            )
            if cur.rowcount == 0:
                raise ValueError("成员不存在")
    finally:
        conn.close()
    items = [m for m in list_members(pid) if m.get("user_id") == tid]
    if not items:
        raise ValueError("成员不存在")
    return items[0]


def remove_member(
    *,
    project_id: str,
    target_user_id: str,
) -> dict[str, Any]:
    pid = str(project_id or "").strip()
    tid = str(target_user_id or "").strip()
    from core.services.case_management.project_db import get_project

    proj = get_project(pid)
    if not proj:
        raise ValueError("项目不存在")
    if str(proj.get("user_id") or "") == tid:
        raise ValueError("不能移除项目创建者")
    ensure_member_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM cm_project_members WHERE project_id = %s AND user_id = %s",
                (pid, tid),
            )
            if cur.rowcount == 0:
                raise ValueError("成员不存在")
    finally:
        conn.close()
    return {"removed": True, "user_id": tid, "project_id": pid}


def transfer_project_owner(
    *,
    project_id: str,
    actor_user_id: str,
    target_user_id: str,
) -> dict[str, Any]:
    """将主负责人转移给项目内正式成员；原负责人降为 editor。"""
    from core.services.case_management.message_db import create_message, ensure_message_tables
    from core.services.case_management.project_db import get_project, touch_project

    pid = str(project_id or "").strip()
    aid = str(actor_user_id or "").strip()
    tid = str(target_user_id or "").strip()
    if not pid or not aid or not tid:
        raise ValueError("参数不完整")
    if aid == tid:
        raise ValueError("不能转移给自己")

    proj = get_project(pid)
    if not proj:
        raise ValueError("项目不存在")
    if str(proj.get("user_id") or "") != aid:
        raise ValueError("仅当前项目负责人可转移管理员")

    ensure_member_tables()
    ensure_message_tables()
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT role FROM cm_project_members "
                "WHERE project_id = %s AND user_id = %s LIMIT 1",
                (pid, tid),
            )
            target = cur.fetchone()
            if not target:
                raise ValueError("只能转移给当前项目内的正式成员")

            cur.execute(
                "UPDATE cm_projects SET user_id = %s, updated_at = %s WHERE id = %s",
                (tid, now, pid),
            )
            cur.execute(
                "UPDATE cm_project_members SET role = 'owner' "
                "WHERE project_id = %s AND user_id = %s",
                (pid, tid),
            )
            cur.execute(
                "UPDATE cm_project_members SET role = 'editor' "
                "WHERE project_id = %s AND user_id = %s",
                (pid, aid),
            )
            # 若原负责人无成员行，补一条 editor
            cur.execute(
                "SELECT id FROM cm_project_members "
                "WHERE project_id = %s AND user_id = %s LIMIT 1",
                (pid, aid),
            )
            if not cur.fetchone():
                cur.execute(
                    "INSERT INTO cm_project_members "
                    "(id, project_id, user_id, role, invited_by, created_at) "
                    "VALUES (%s,%s,%s,'editor',%s,%s)",
                    (_new_id(), pid, aid, tid, now),
                )
    finally:
        conn.close()

    touch_project(pid)
    project_name = str(proj.get("name") or "未命名项目")
    from core.services.case_management.invite_db import _user_display

    actor = _user_display(aid)
    create_message(
        user_id=tid,
        msg_type="owner_transferred",
        title="你已成为项目负责人",
        body="%s 已将项目「%s」的管理员权限转移给你" % (
            actor.get("label") or "用户",
            project_name,
        ),
        ref_type="project",
        ref_id=pid,
        payload={
            "project_id": pid,
            "project_name": project_name,
            "from_user_id": aid,
            "from_label": actor.get("label"),
        },
    )
    return {
        "transferred": True,
        "project_id": pid,
        "previous_owner_id": aid,
        "new_owner_id": tid,
    }


def search_users_for_invite(q: str, *, limit: int = 20) -> list[dict[str, Any]]:
    """按完整邮箱或手机号精确查找站内用户（供邀请，不支持昵称）。"""
    from core.services.auth.auth_db import ensure_auth_tables
    from core.services.auth.phone_identity import normalize_phone
    from core.services.auth.rate_limit import normalize_email

    text = str(q or "").strip()
    if not text:
        return []

    email: str | None = None
    phone: str | None = None
    if "@" in text:
        try:
            email = normalize_email(text)
        except ValueError as exc:
            raise ValueError("请输入有效的邮箱地址") from exc
    else:
        try:
            phone = normalize_phone(text)
        except ValueError as exc:
            raise ValueError("请输入完整邮箱或有效手机号") from exc

    ensure_auth_tables()
    lim = max(1, min(int(limit or 20), 50))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            if email:
                cur.execute(
                    "SELECT id, email, phone, display_name FROM hub_users "
                    "WHERE email = %s ORDER BY updated_at DESC LIMIT %s",
                    (email, lim),
                )
            else:
                cur.execute(
                    "SELECT id, email, phone, display_name FROM hub_users "
                    "WHERE phone = %s ORDER BY updated_at DESC LIMIT %s",
                    (phone, lim),
                )
            rows = cur.fetchall() or []
        out = []
        for r in rows:
            from core.services.auth.phone_identity import is_phone_placeholder_email, mask_phone

            em = (r.get("email") or "").strip() or None
            if em and is_phone_placeholder_email(em):
                em = None
            ph = (r.get("phone") or "").strip() or None
            out.append(
                {
                    "id": str(r.get("id") or ""),
                    "email": em,
                    "phone": ph,
                    "phone_masked": mask_phone(ph) if ph else None,
                    "display_name": (r.get("display_name") or "").strip() or None,
                    "label": _user_label(r.get("display_name"), em, ph),
                }
            )
        return out
    finally:
        conn.close()


def _user_label(display_name, email, phone) -> str:
    name = (display_name or "").strip()
    if name:
        return name
    if email:
        return str(email)
    if phone:
        return str(phone)
    return "用户"


def _serialize_member(row: dict[str, Any]) -> dict[str, Any]:
    from core.services.auth.phone_identity import is_phone_placeholder_email, mask_phone

    email = (row.get("email") or "").strip() or None
    if email and is_phone_placeholder_email(email):
        email = None
    phone = (row.get("phone") or "").strip() or None
    display_name = (row.get("display_name") or "").strip() or None
    return {
        "id": str(row.get("id") or ""),
        "project_id": str(row.get("project_id") or ""),
        "user_id": str(row.get("user_id") or ""),
        "role": normalize_role(str(row.get("role") or "viewer")),
        "invited_by": str(row.get("invited_by") or "") or None,
        "created_at": str(row.get("created_at") or ""),
        "email": email,
        "phone": phone,
        "phone_masked": mask_phone(phone) if phone else None,
        "display_name": display_name,
        "label": _user_label(display_name, email, phone),
    }
