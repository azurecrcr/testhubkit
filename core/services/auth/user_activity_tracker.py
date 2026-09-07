"""登录态用户访问埋点挂钩（独立模块，失败静默，不影响其它请求）。"""
from __future__ import annotations

import threading
import time
from typing import Dict

# 同一进程内：同一用户两次写库最短间隔（秒）
_THROTTLE_SECONDS = 600
_last_touch_ts: Dict[str, float] = {}
_lock = threading.Lock()

_SKIP_PREFIXES = (
    "/static/",
    "/favicon",
    "/health",
    "/robots.txt",
)


def _should_skip_path(path: str) -> bool:
    p = path or ""
    if not p:
        return True
    for pref in _SKIP_PREFIXES:
        if p.startswith(pref):
            return True
    # 常见探活
    if p in ("/healthz", "/ready", "/ping"):
        return True
    return False


def _throttled_ok(user_id: str) -> bool:
    now = time.time()
    with _lock:
        prev = _last_touch_ts.get(user_id) or 0.0
        if now - prev < _THROTTLE_SECONDS:
            return False
        _last_touch_ts[user_id] = now
        # 防止无限增长：偶尔清理过期
        if len(_last_touch_ts) > 5000:
            cutoff = now - _THROTTLE_SECONDS
            stale = [k for k, ts in _last_touch_ts.items() if ts < cutoff]
            for k in stale[:2000]:
                _last_touch_ts.pop(k, None)
        return True


def register_user_activity_tracker(app) -> None:
    """在 Flask app 上注册 before_request；可重复调用（仅注册一次）。"""
    if getattr(app, "_hub_user_activity_tracker_v1", False):
        return

    @app.before_request
    def _hub_touch_user_activity():
        try:
            from flask import request

            path = request.path or ""
            if _should_skip_path(path):
                return None
            from core.services.auth.auth_session import get_current_user_id

            uid = get_current_user_id()
            if not uid:
                return None
            if not _throttled_ok(uid):
                return None
            from core.services.auth.user_activity_db import touch_user_activity

            forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
            ip = forwarded or (request.remote_addr or "")
            touch_user_activity(uid, client_ip=ip, path=path)
        except Exception:
            return None
        return None

    app._hub_user_activity_tracker_v1 = True
