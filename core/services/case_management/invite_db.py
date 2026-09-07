"""项目邀请（待确认）。同意后才写入 cm_project_members。"""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from core.services.test_cases.mysql_db import get_connection

_INVITES_SQL = (
    "CREATE TABLE IF NOT EXISTS cm_project_invites ("
    " id CHAR(32) NOT NULL PRIMARY KEY,"
    " project_id CHAR(32) NOT NULL,"
    " invitee_user_id CHAR(32) NOT NULL,"
    " role VARCHAR(16) NOT NULL DEFAULT 'editor',"
    " invited_by CHAR(32) NOT NULL,"
    " status VARCHAR(16) NOT NULL DEFAULT 'pending',"
    " created_at DATETIME NOT NULL,"
    " responded_at DATETIME NULL,"
    " INDEX idx_cm_invite_project_status (project_id, status),"
    " INDEX idx_cm_invite_invitee_status (invitee_user_id, status),"
    " INDEX idx_cm_invite_pending_pair (project_id, invitee_user_id, status)"
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
)

INVITE_ROLES = ("editor", "viewer")


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _new_id() -> str:
    return uuid.uuid4().hex


def ensure_invite_tables(cur=None) -> None:
    if cur is not None:
        cur.execute(_INVITES_SQL)
        return
    conn = get_connection()
    try:
        with conn.cursor() as c:
            c.execute(_INVITES_SQL)
    finally:
        conn.close()


def _role_label(role: str) -> str:
    return {"editor": "编辑", "viewer": "只读", "owner": "负责人"}.get(role, role or "—")


def _user_display(user_id: str) -> dict[str, Any]:
    from core.services.case_management.member_db import _user_label
    from core.services.auth.phone_identity import is_phone_placeholder_email, mask_phone

    uid = str(user_id or "").strip()
    if not uid:
        return {"user_id": "", "label": "用户"}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, phone, display_name FROM hub_users WHERE id = %s LIMIT 1",
                (uid,),
            )
            r = cur.fetchone() or {}
        email = (r.get("email") or "").strip() or None
        if email and is_phone_placeholder_email(email):
            email = None
        phone = (r.get("phone") or "").strip() or None
        display_name = (r.get("display_name") or "").strip() or None
        return {
            "user_id": uid,
            "email": email,
            "phone": phone,
            "phone_masked": mask_phone(phone) if phone else None,
            "display_name": display_name,
            "label": _user_label(display_name, email, phone),
        }
    finally:
        conn.close()


def create_project_invite(
    *,
    project_id: str,
    target_user_id: str,
    role: str,
    invited_by: str,
) -> dict[str, Any]:
    """创建待确认邀请并给被邀请人发消息。禁止邀请为 owner。"""
    from core.services.case_management.member_db import get_member_role, normalize_role
    from core.services.case_management.message_db import create_message, ensure_message_tables
    from core.services.case_management.project_db import get_project

    pid = str(project_id or "").strip()
    tid = str(target_user_id or "").strip()
    iid = str(invited_by or "").strip()
    role_n = normalize_role(role)
    if role_n == "owner":
        raise ValueError("不能直接邀请为负责人，请邀请后再使用「转移管理员」")
    if role_n not in INVITE_ROLES:
        raise ValueError("邀请角色仅支持编辑或只读")
    if not pid or not tid:
        raise ValueError("缺少项目或用户")
    if tid == iid:
        raise ValueError("不能邀请自己")

    proj = get_project(pid)
    if not proj:
        raise ValueError("项目不存在")
    if get_member_role(tid, pid):
        raise ValueError("该用户已是项目成员")

    ensure_invite_tables()
    ensure_message_tables()
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, status FROM cm_project_invites "
                "WHERE project_id = %s AND invitee_user_id = %s AND status = 'pending' "
                "LIMIT 1",
                (pid, tid),
            )
            exist = cur.fetchone()
            if exist:
                raise ValueError("已向该用户发送邀请，请等待对方确认")

            invite_id = _new_id()
            cur.execute(
                "INSERT INTO cm_project_invites "
                "(id, project_id, invitee_user_id, role, invited_by, status, "
                "created_at, responded_at) "
                "VALUES (%s,%s,%s,%s,%s,'pending',%s,NULL)",
                (invite_id, pid, tid, role_n, iid, now),
            )
    finally:
        conn.close()

    inviter = _user_display(iid)
    invitee = _user_display(tid)
    project_name = str(proj.get("name") or "未命名项目")
    title = "项目邀请：%s" % project_name
    body = "%s 邀请你以「%s」加入项目「%s」" % (
        inviter.get("label") or "用户",
        _role_label(role_n),
        project_name,
    )
    msg = create_message(
        user_id=tid,
        msg_type="project_invite",
        title=title,
        body=body,
        ref_type="project_invite",
        ref_id=invite_id,
        payload={
            "invite_id": invite_id,
            "project_id": pid,
            "project_name": project_name,
            "role": role_n,
            "role_label": _role_label(role_n),
            "invited_by": iid,
            "inviter_label": inviter.get("label"),
        },
    )
    return {
        "invite": _serialize_invite(
            {
                "id": invite_id,
                "project_id": pid,
                "invitee_user_id": tid,
                "role": role_n,
                "invited_by": iid,
                "status": "pending",
                "created_at": now,
                "responded_at": None,
            },
            invitee=invitee,
            inviter=inviter,
            project_name=project_name,
        ),
        "message_id": msg.get("id"),
    }


def list_pending_invites(project_id: str) -> list[dict[str, Any]]:
    pid = str(project_id or "").strip()
    if not pid:
        return []
    ensure_invite_tables()
    from core.services.case_management.project_db import get_project

    proj = get_project(pid)
    project_name = str((proj or {}).get("name") or "")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM cm_project_invites "
                "WHERE project_id = %s AND status = 'pending' "
                "ORDER BY created_at DESC",
                (pid,),
            )
            rows = cur.fetchall() or []
        out = []
        for r in rows:
            out.append(
                _serialize_invite(
                    r,
                    invitee=_user_display(str(r.get("invitee_user_id") or "")),
                    inviter=_user_display(str(r.get("invited_by") or "")),
                    project_name=project_name,
                )
            )
        return out
    finally:
        conn.close()


def get_invite(invite_id: str) -> Optional[dict[str, Any]]:
    iid = str(invite_id or "").strip()
    if not iid:
        return None
    ensure_invite_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM cm_project_invites WHERE id = %s LIMIT 1",
                (iid,),
            )
            row = cur.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def accept_invite(*, invite_id: str, actor_user_id: str) -> dict[str, Any]:
    from core.services.case_management.member_db import get_member_role, invite_member
    from core.services.case_management.message_db import mark_messages_acted_by_ref
    from core.services.case_management.project_db import get_project

    aid = str(actor_user_id or "").strip()
    row = get_invite(invite_id)
    if not row:
        raise ValueError("邀请不存在")
    if str(row.get("invitee_user_id") or "") != aid:
        raise ValueError("只能处理发给自己的邀请")
    if str(row.get("status") or "") != "pending":
        raise ValueError("该邀请已处理")
    pid = str(row.get("project_id") or "")
    if not get_project(pid):
        raise ValueError("项目已不存在")
    if get_member_role(aid, pid):
        # 已是成员则关闭邀请
        _set_invite_status(str(row["id"]), "accepted")
        mark_messages_acted_by_ref(
            ref_type="project_invite", ref_id=str(row["id"]), user_id=aid
        )
        return {
            "accepted": True,
            "already_member": True,
            "project_id": pid,
            "member": None,
        }

    member = invite_member(
        project_id=pid,
        target_user_id=aid,
        role=str(row.get("role") or "editor"),
        invited_by=str(row.get("invited_by") or ""),
    )
    _set_invite_status(str(row["id"]), "accepted")
    mark_messages_acted_by_ref(
        ref_type="project_invite", ref_id=str(row["id"]), user_id=aid
    )
    return {"accepted": True, "member": member, "project_id": pid}


def reject_invite(*, invite_id: str, actor_user_id: str) -> dict[str, Any]:
    from core.services.case_management.message_db import mark_messages_acted_by_ref

    aid = str(actor_user_id or "").strip()
    row = get_invite(invite_id)
    if not row:
        raise ValueError("邀请不存在")
    if str(row.get("invitee_user_id") or "") != aid:
        raise ValueError("只能处理发给自己的邀请")
    if str(row.get("status") or "") != "pending":
        raise ValueError("该邀请已处理")
    _set_invite_status(str(row["id"]), "rejected")
    mark_messages_acted_by_ref(
        ref_type="project_invite", ref_id=str(row["id"]), user_id=aid
    )
    return {"rejected": True, "invite_id": str(row["id"])}


def cancel_invite(
    *,
    project_id: str,
    invite_id: str,
    actor_user_id: str,
) -> dict[str, Any]:
    from core.services.case_management.message_db import mark_messages_acted_by_ref

    pid = str(project_id or "").strip()
    iid = str(invite_id or "").strip()
    row = get_invite(iid)
    if not row:
        raise ValueError("邀请不存在")
    if str(row.get("project_id") or "") != pid:
        raise ValueError("邀请不属于该项目")
    if str(row.get("status") or "") != "pending":
        raise ValueError("该邀请已处理")
    _set_invite_status(iid, "cancelled")
    mark_messages_acted_by_ref(ref_type="project_invite", ref_id=iid)
    return {"cancelled": True, "invite_id": iid}


def _set_invite_status(invite_id: str, status: str) -> None:
    ensure_invite_tables()
    now = _now()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cm_project_invites "
                "SET status = %s, responded_at = %s WHERE id = %s",
                (status, now, invite_id),
            )
    finally:
        conn.close()


def _serialize_invite(
    row: dict[str, Any],
    *,
    invitee: dict[str, Any] | None = None,
    inviter: dict[str, Any] | None = None,
    project_name: str = "",
) -> dict[str, Any]:
    role = str(row.get("role") or "editor")
    return {
        "id": str(row.get("id") or ""),
        "project_id": str(row.get("project_id") or ""),
        "project_name": project_name or None,
        "invitee_user_id": str(row.get("invitee_user_id") or ""),
        "role": role,
        "role_label": _role_label(role),
        "invited_by": str(row.get("invited_by") or "") or None,
        "status": str(row.get("status") or "pending"),
        "created_at": str(row.get("created_at") or ""),
        "responded_at": str(row.get("responded_at") or "") or None,
        "invitee": invitee,
        "inviter": inviter,
        "label": (invitee or {}).get("label") or "用户",
    }
