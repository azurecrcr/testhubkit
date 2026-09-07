"""服务端统一锁开关校验。"""

from core.services.toolkit_lock.toolkit_lock_db import toolkit_is_locked


def toolkit_restricted() -> bool:
    return toolkit_is_locked()


def toolkit_restricted_error() -> str:
    return "敏感功能已统一上锁，请在数据库将 toolkit_lock_switch.is_locked 设为 0 后刷新页面"
