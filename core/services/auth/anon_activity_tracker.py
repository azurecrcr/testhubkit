"""匿名访客 UV 埋点（cookie hub_vid；与登录态日活分开）。

优化口径（v3）：
1) 仅未登录用户计入
2) 仅「真实浏览器打开本站业务页」计入（收紧 UA/Accept/Sec-Fetch）
3) 路径按「段」匹配，避免 /app 误伤 /appliance、/app_dev.php
4) 拒绝常见扫站后缀与探测路径
5) 去重键仍为 cookie hub_vid；进站后任意业务页都计（当日 UV 一次即可）
"""
from __future__ import annotations

import re
import secrets
import threading
import time
from typing import Dict, Tuple

from core.services.auth.user_activity_tracker import _should_skip_path

_COOKIE_NAME = "hub_vid"
_COOKIE_MAX_AGE = 400 * 24 * 3600  # ~400 天
_THROTTLE_SECONDS = 600
_last_touch_ts: Dict[str, float] = {}
_lock = threading.Lock()

# 精确业务入口
_ALLOW_EXACT = {
    "/",
    "/auth",
    "/app",
    "/prompts",
    "/workspace",
    "/day",
}

# 段匹配前缀：仅匹配自身或「前缀/…」，不匹配 /app_dev /appliance
_ALLOW_SEGMENT_PREFIXES = (
    "/auth",
    "/app",
    "/account",
    "/prompts",
    "/share",
    "/tools",
    "/tool",
    "/workspace",
    "/legal",
    "/case-management",
    "/defect-management",
)

_DENY_PREFIXES = (
    "/.env",
    "/.git",
    "/.aws",
    "/.qcloud",
    "/.svn",
    "/.vscode",
    "/.idea",
    "/wp-",
    "/wordpress",
    "/phpmyadmin",
    "/adminer",
    "/actuator",
    "/cgi-bin",
    "/vendor/",
    "/node_modules/",
    "/config",
    "/credentials",
    "/terraform",
    "/docker-compose",
    "/alicloud",
    "/aliyun",
    "/tencent",
    "/cos.",
    "/oss.",
    "/authorization",
    "/auth/admin",
    "/admin",
    "/manager",
    "/console",
    "/_profiler",
    "/phpinfo",
    "/appliance",
)
_DENY_SUFFIXES = (
    ".env",
    ".bak",
    ".old",
    ".sql",
    ".yml",
    ".yaml",
    ".ini",
    ".pem",
    ".key",
    ".log",
    ".php",
    ".asp",
    ".aspx",
    ".jsp",
    ".do",
    ".cgi",
    ".action",
)
_DENY_NAME_RE = re.compile(
    r"(^|/)(\.env|config|credentials|secret|passwd|password|id_rsa|phpinfo|profiler)([./]|$)",
    re.I,
)
_SCANNER_PATH_RE = re.compile(
    r"(^|/)(wp-|wordpress|phpmyadmin|adminer|actuator|\.git|cgi-bin|"
    r"auth1\.html|login\.html|admin\.html)(/|$)",
    re.I,
)

_BOT_UA_RE = re.compile(
    r"(bot|spider|crawler|scan|scrapy|curl|wget|python-requests|httpclient|"
    r"go-http|java/|okhttp|libwww|masscan|zgrab|nuclei|sqlmap|nikto|"
    r"headless|phantom|selenium|puppeteer|playwright)",
    re.I,
)
_BROWSER_UA_RE = re.compile(
    r"(Mozilla/|Chrome/|Safari/|Firefox/|Edg/|OPR/|MicroMessenger|iPhone|Android)",
    re.I,
)


def _valid_vid(vid: str) -> bool:
    v = (vid or "").strip().lower()
    return len(v) == 32 and all(c in "0123456789abcdef" for c in v)


def _throttled_ok(visitor_id: str) -> bool:
    now = time.time()
    with _lock:
        prev = _last_touch_ts.get(visitor_id) or 0.0
        if now - prev < _THROTTLE_SECONDS:
            return False
        _last_touch_ts[visitor_id] = now
        if len(_last_touch_ts) > 8000:
            cutoff = now - _THROTTLE_SECONDS
            stale = [k for k, ts in _last_touch_ts.items() if ts < cutoff]
            for k in stale[:3000]:
                _last_touch_ts.pop(k, None)
        return True


def _norm_path(path: str) -> str:
    return (path or "").split("?", 1)[0] or "/"


def _segment_match(path: str, prefix: str) -> bool:
    """/app 只匹配 /app 与 /app/…，不匹配 /appliance。"""
    p = _norm_path(path)
    pref = (prefix or "").rstrip("/")
    if not pref:
        return False
    return p == pref or p.startswith(pref + "/")


def _is_denied_path(path: str) -> bool:
    p = _norm_path(path)
    low = p.lower()
    for pref in _DENY_PREFIXES:
        if _segment_match(low, pref.rstrip("/")) or low.startswith(pref):
            return True
    for suf in _DENY_SUFFIXES:
        if low.endswith(suf):
            return True
    if _DENY_NAME_RE.search(low):
        return True
    if _SCANNER_PATH_RE.search(low):
        return True
    if low.count(".") >= 2 and any(
        x in low for x in (".env", "config", "credential", "secret", ".php")
    ):
        return True
    return False


def _is_allowed_page_path(path: str) -> bool:
    """本站业务页：精确入口 + 段前缀；任意业务页进入都算。"""
    p = _norm_path(path)
    if p in _ALLOW_EXACT:
        return True
    for pref in _ALLOW_SEGMENT_PREFIXES:
        if _segment_match(p, pref):
            return True
    return False


def _looks_like_real_browser(request) -> bool:
    """收紧：优先要求文档导航或明确接受 HTML，减少伪装 UA 的扫站。"""
    ua = (request.headers.get("User-Agent") or "").strip()
    if not ua or len(ua) < 20:
        return False
    if _BOT_UA_RE.search(ua):
        return False
    if not _BROWSER_UA_RE.search(ua):
        return False

    accept = (request.headers.get("Accept") or "").lower()
    sec_dest = (request.headers.get("Sec-Fetch-Dest") or "").lower()
    sec_mode = (request.headers.get("Sec-Fetch-Mode") or "").lower()
    sec_site = (request.headers.get("Sec-Fetch-Site") or "").lower()

    # 现代浏览器文档导航（最可靠）
    if sec_dest == "document" and sec_mode in ("navigate", "nested-navigate", ""):
        return True

    # 明确要 HTML 的页面打开
    if "text/html" in accept:
        # 有 Sec-Fetch 时再校验一下不是纯接口拉取
        if sec_dest and sec_dest not in ("document", "iframe", "frame", "empty"):
            return False
        return True

    # 微信等内置浏览器偶发 Accept 较宽，但通常带 Sec-Fetch-Site
    if "micromessenger" in ua.lower() and sec_site in ("none", "same-origin", "same-site", "cross-site"):
        return True

    # 不再放行仅 Accept: */* 且无 Sec-Fetch 的请求（扫站高发）
    return False


def should_count_anon_uv(request) -> Tuple[bool, str]:
    """返回 (是否计入, 原因)。"""
    if (request.method or "").upper() != "GET":
        return False, "method"
    path = request.path or ""
    if _should_skip_path(path):
        return False, "skip_path"
    if _is_denied_path(path):
        return False, "deny_path"
    if not _is_allowed_page_path(path):
        return False, "not_page"
    if not _looks_like_real_browser(request):
        return False, "not_browser"
    return True, "ok"


def is_clean_anon_exposure_path(path: str) -> bool:
    """
    日报「有效曝光」去噪口径（只读统计用，不改写入埋点）：
    - 排除探测 / 拒绝路径
    - 排除非业务页
    - 排除纯首页 `/`（扫站与路过首页噪音高发；进过 /app、/tool、/auth 等才算有效）
    """
    p = _norm_path(path)
    if _is_denied_path(p):
        return False
    if not _is_allowed_page_path(p):
        return False
    if p == "/":
        return False
    return True


def register_anon_activity_tracker(app) -> None:
    """未登录 + 真人进入业务页：用长期 cookie 记匿名 UV。"""
    # v3：收紧路径与浏览器判定；允许覆盖旧 v1/v2 挂钩
    if getattr(app, "_hub_anon_activity_tracker_v3", False):
        return

    @app.before_request
    def _hub_touch_anon_activity_v3():
        try:
            from flask import g, request

            g.hub_vid_new = None

            from core.services.auth.auth_session import get_current_user_id

            if get_current_user_id():
                return None

            ok, _reason = should_count_anon_uv(request)
            if not ok:
                return None

            path = request.path or ""
            raw = (request.cookies.get(_COOKIE_NAME) or "").strip().lower()
            if _valid_vid(raw):
                vid = raw
            else:
                vid = secrets.token_hex(16)
                g.hub_vid_new = vid

            if not _throttled_ok(vid):
                return None

            from core.services.auth.anon_activity_db import touch_anon_activity

            forwarded = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
            ip = forwarded or (request.remote_addr or "")
            touch_anon_activity(vid, client_ip=ip, path=path)
        except Exception:
            return None
        return None

    @app.after_request
    def _hub_set_anon_vid_cookie_v3(response):
        try:
            from flask import g

            vid = getattr(g, "hub_vid_new", None)
            if vid and _valid_vid(vid):
                response.set_cookie(
                    _COOKIE_NAME,
                    vid,
                    max_age=_COOKIE_MAX_AGE,
                    httponly=True,
                    samesite="Lax",
                    path="/",
                )
        except Exception:
            pass
        return response

    app._hub_anon_activity_tracker_v3 = True
    app._hub_anon_activity_tracker_v2 = True
    app._hub_anon_activity_tracker_v1 = True
