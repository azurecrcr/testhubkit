"""站点管理员鉴权（hub_users.role = manager）。"""

from __future__ import annotations

ROLE_USER = "user"
ROLE_MANAGER = "manager"


def is_manager_role(role: str | None) -> bool:
    return str(role or "").strip().lower() == ROLE_MANAGER


def is_site_manager(user: dict | None) -> bool:
    if not user:
        return False
    return is_manager_role(user.get("role"))


def is_prompt_visibility_admin(
    email: str | None = None,
    *,
    user: dict | None = None,
    role: str | None = None,
) -> bool:
    """兼容旧调用：优先 user，其次 role；不再按邮箱判断。"""
    if user is not None:
        return is_site_manager(user)
    return is_manager_role(role)
