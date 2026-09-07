# -*- coding: utf-8 -*-
"""L5 动作级权限（overrides 关闭=旧行为；开启后按 action_min_roles / reporter_can_edit）。"""

from __future__ import annotations

import json
import time
from typing import Any

from core.services.case_management.access import (
    CmAccessError,
    assert_project_editor,
    assert_project_owner,
    assert_project_viewer,
)
from core.services.case_management.member_db import get_member_role, role_at_least
from core.services.defect_management.access import assert_defect_editor, assert_defect_viewer
from core.services.l5_bridge.schema_l5 import ensure_l5_tables
from core.services.test_cases.mysql_db import get_connection

# overrides 关闭时的默认能力映射
_ACTION_DEFAULT = {
    "defect.create": "defect_editor",
    "defect.close": "defect_editor",
    "defect.enrich": "defect_editor",
    "plan.create": "editor",
    "plan.release": "editor",
    "sync.apply": "editor",
    "audit.export": "viewer",
}

# overrides 开启且未单独配置时的默认最低角色（CM 角色）
_OVERRIDE_DEFAULT_MIN_ROLE = {
    "defect.create": "editor",
    "defect.close": "editor",
    "defect.enrich": "editor",
    "plan.create": "editor",
    "plan.release": "owner",  # 开启 overrides 后发布默认更严
    "sync.apply": "editor",
    "audit.export": "viewer",
}


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def get_project_l5_settings(project_id: str) -> dict[str, Any]:
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT settings_json FROM cm_project_l5_settings WHERE project_id=%s LIMIT 1",
                (str(project_id).strip(),),
            )
            row = cur.fetchone() or {}
        try:
            data = json.loads(row.get("settings_json") or "{}")
        except Exception:  # noqa: BLE001
            data = {}
        if not isinstance(data, dict):
            data = {}
        data.setdefault("overrides_enabled", False)
        # 只读成员不可编辑缺陷：不再开放「报告人可补充」
        data["reporter_can_edit"] = False
        data.setdefault("action_min_roles", {})
        data.pop("evidence_policy", None)
        data.pop("gate_rules", None)
        if not isinstance(data.get("action_min_roles"), dict):
            data["action_min_roles"] = {}
        # 发布最低角色配置入口已移除
        data["action_min_roles"].pop("plan.release", None)
        data["action_min_roles"].pop("gate.evaluate", None)
        return data
    finally:
        conn.close()


def save_project_l5_settings_l5(user_id: str, project_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    assert_project_owner(user_id, project_id)
    cur_s = get_project_l5_settings(project_id)
    for k in (
        "overrides_enabled",
        "action_min_roles",
    ):
        if k in patch:
            cur_s[k] = patch[k]
    # 强制关闭：只读报告人不可编辑缺陷字段
    cur_s["reporter_can_edit"] = False
    cur_s.pop("evidence_policy", None)
    cur_s.pop("gate_rules", None)  # 自动门禁已下线
    roles = cur_s.get("action_min_roles")
    if isinstance(roles, dict):
        roles.pop("plan.release", None)
        roles.pop("gate.evaluate", None)
        cur_s["action_min_roles"] = roles
    else:
        cur_s["action_min_roles"] = {}
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO cm_project_l5_settings (project_id, settings_json, updated_at) "
                "VALUES (%s,%s,%s) ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json), "
                "updated_at=VALUES(updated_at)",
                (project_id, json.dumps(cur_s, ensure_ascii=False), _now()),
            )
    finally:
        conn.close()
    from core.services.l5_bridge.activity_l5 import write_audit_l5

    write_audit_l5(
        project_id,
        user_id,
        "settings.save",
        ref_type="project",
        ref_id=project_id,
        payload={"keys": list(patch.keys())},
    )
    return cur_s


def write_audit_denied_l5(
    project_id: str,
    actor_id: str,
    action: str,
    *,
    detail: str = "",
) -> None:
    from core.services.l5_bridge.activity_l5 import write_audit_l5

    try:
        write_audit_l5(
            project_id,
            actor_id or "anonymous",
            "access.denied",
            ref_type="action",
            ref_id=None,
            payload={"action": action, "detail": detail[:500]},
        )
    except Exception:  # noqa: BLE001
        pass


def _assert_legacy(user_id: str, project_id: str, act: str) -> dict[str, Any]:
    kind = _ACTION_DEFAULT.get(act, "editor")
    if kind == "viewer":
        return assert_project_viewer(user_id, project_id)
    if kind == "owner":
        return assert_project_owner(user_id, project_id)
    if kind == "defect_editor":
        return assert_defect_editor(user_id, project_id, require_team=True)
    if kind == "defect_viewer":
        return assert_defect_viewer(user_id, project_id, require_team=True)
    return assert_project_editor(user_id, project_id)


def _assert_min_role(user_id: str, project_id: str, min_role: str) -> dict[str, Any]:
    """按 CM 角色校验（viewer/editor/owner）。"""
    role = get_member_role(user_id, project_id)
    need = str(min_role or "viewer").strip().lower()
    if need not in ("viewer", "editor", "owner"):
        need = "editor"
    if not role or not role_at_least(role, need):
        raise CmAccessError("无权执行该 L5 操作（需要角色 ≥ %s）" % need, status=403)
    # 仍做 viewer 校验以带回 project
    proj = assert_project_viewer(user_id, project_id)
    proj["_cm_role"] = role
    proj["_l5_min_role"] = need
    return proj


def assert_l5_action(user_id: str, project_id: str, action: str) -> dict[str, Any]:
    """
    overrides_enabled=false → 完全委托现网 assert_*（旧行为）。
    overrides_enabled=true → 使用 action_min_roles[action] 或内置更严默认。
    """
    settings = get_project_l5_settings(project_id)
    act = str(action or "").strip()
    try:
        if not settings.get("overrides_enabled"):
            return _assert_legacy(user_id, project_id, act)
        custom = settings.get("action_min_roles") or {}
        min_role = str(custom.get(act) or _OVERRIDE_DEFAULT_MIN_ROLE.get(act) or "editor")
        # 缺陷类动作仍要求 team_ready
        if act.startswith("defect."):
            assert_defect_viewer(user_id, project_id, require_team=True)
        return _assert_min_role(user_id, project_id, min_role)
    except CmAccessError as exc:
        write_audit_denied_l5(project_id, user_id, act, detail=str(exc))
        raise


def assert_l5_defect_action_l5(user_id: str, defect_id: str, action: str) -> dict[str, Any]:
    """
    缺陷级动作权限。
    只读成员（含报告人）不可编辑缺陷；需 editor 及以上。
    """
    from core.services.defect_management import defect_db

    item = defect_db.get_defect(defect_id)
    if not item:
        raise CmAccessError("缺陷不存在", status=404)
    pid = str(item.get("project_id") or "")
    act = str(action or "").strip()
    try:
        proj = assert_l5_action(user_id, pid, act)
        return {**proj, "defect": item}
    except CmAccessError as exc:
        write_audit_denied_l5(pid, user_id, act, detail=str(exc))
        raise
