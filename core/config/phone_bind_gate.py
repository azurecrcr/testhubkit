"""手机实名软闸门与邮箱注册关闭开关（独立配置，可紧急关闭）。"""

from __future__ import annotations

import os


def _flag(name: str, default: str = "true") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


def phone_bind_gate_enabled() -> bool:
    """登录后未绑手机则拦截业务 API / 引导强制绑定。"""
    return _flag("PHONE_BIND_GATE_ENABLED", "true")


def email_register_disabled() -> bool:
    """关闭邮箱注册（保留邮箱登录与资料绑邮箱）。"""
    return _flag("EMAIL_REGISTER_DISABLED", "true")


EMAIL_REGISTER_DISABLED_MSG = "按公安实名核验要求，请使用手机号注册账号"
PHONE_BIND_REQUIRED_MSG = "按公安实名核验要求，请先绑定手机号完成验证后再使用本平台功能"
