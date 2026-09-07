"""用例管理访问校验（仅本模块使用，不改动全局 auth）。"""

from __future__ import annotations

from typing import Any, Optional

from core.services.case_management.project_db import get_project


class CmAccessError(Exception):
    def __init__(self, message: str, *, status: int = 403):
        super().__init__(message)
        self.status = status
        self.message = message


def assert_project_access(
    user_id: str,
    project_id: str,
    *,
    min_role: str = "viewer",
) -> dict[str, Any]:
    """
    校验当前用户对项目的最低角色。
    返回 project 字典，并附带 _cm_role（当前用户角色）。
    """
    from core.services.case_management.member_db import (
        get_member_role,
        normalize_role,
        role_at_least,
    )

    uid = str(user_id or "").strip()
    pid = str(project_id or "").strip()
    if not uid:
        raise CmAccessError("请先登录", status=401)
    if not pid:
        raise CmAccessError("缺少项目 ID", status=400)
    project = get_project(pid)
    if not project:
        raise CmAccessError("项目不存在", status=404)
    role = get_member_role(uid, pid)
    need = normalize_role(min_role)
    if not role or not role_at_least(role, need):
        raise CmAccessError("无权访问该项目", status=403)
    out = dict(project)
    out["_cm_role"] = role
    return out


def assert_project_owner(user_id: str, project_id: str) -> dict[str, Any]:
    """要求 owner 角色（成员管理 / 删项目等）。"""
    return assert_project_access(user_id, project_id, min_role="owner")


def assert_project_editor(user_id: str, project_id: str) -> dict[str, Any]:
    """要求 editor 及以上（增删改用例等）。"""
    return assert_project_access(user_id, project_id, min_role="editor")


def assert_project_viewer(user_id: str, project_id: str) -> dict[str, Any]:
    """要求 viewer 及以上（只读）。"""
    return assert_project_access(user_id, project_id, min_role="viewer")


def assert_owned_row(
    row: Optional[dict[str, Any]],
    user_id: str,
    *,
    not_found: str = "资源不存在",
    min_role: str = "viewer",
) -> dict[str, Any]:
    """
    校验行所属项目的访问权（协作后不再要求 row.user_id == 当前用户）。
    无 project_id 时回退为创建人校验，兼容极端脏数据。
    """
    uid = str(user_id or "").strip()
    if not uid:
        raise CmAccessError("请先登录", status=401)
    if not row:
        raise CmAccessError(not_found, status=404)
    pid = str(row.get("project_id") or "").strip()
    if pid:
        assert_project_access(uid, pid, min_role=min_role)
        return row
    if str(row.get("user_id") or "") != uid:
        raise CmAccessError("无权访问", status=403)
    return row
