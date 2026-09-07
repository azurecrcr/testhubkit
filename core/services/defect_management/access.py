"""缺陷管理访问校验：复用用例项目成员，强制团队门槛。"""

from __future__ import annotations

from typing import Any

from core.services.case_management.access import CmAccessError, assert_project_access
from core.services.case_management.member_db import count_project_members


class DmAccessError(CmAccessError):
    """别名，便于缺陷模块识别。"""


def assert_defect_project(
    user_id: str,
    project_id: str,
    *,
    min_role: str = "viewer",
    require_team: bool = True,
) -> dict[str, Any]:
    """
    校验项目成员身份；require_team 时要求正式成员数 >= 2。
    返回 project，附带 _cm_role / member_count / team_ready。
    """
    proj = assert_project_access(user_id, project_id, min_role=min_role)
    pid = str(project_id or "").strip()
    member_count = count_project_members(pid)
    team_ready = member_count >= 2
    proj["member_count"] = member_count
    proj["team_ready"] = team_ready
    if require_team and not team_ready:
        raise DmAccessError(
            "缺陷管理面向团队协作，请先在用例管理中邀请至少一名成员",
            status=403,
        )
    return proj


def assert_defect_viewer(user_id: str, project_id: str, *, require_team: bool = True) -> dict[str, Any]:
    return assert_defect_project(user_id, project_id, min_role="viewer", require_team=require_team)


def assert_defect_editor(user_id: str, project_id: str, *, require_team: bool = True) -> dict[str, Any]:
    return assert_defect_project(user_id, project_id, min_role="editor", require_team=require_team)


def assert_defect_owner(user_id: str, project_id: str, *, require_team: bool = True) -> dict[str, Any]:
    return assert_defect_project(user_id, project_id, min_role="owner", require_team=require_team)
