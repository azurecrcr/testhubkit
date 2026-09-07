"""从 Flask 请求解析客户端 IP（支持反向代理）。"""

from __future__ import annotations

from flask import Request


def get_client_ip(request: Request) -> str:
    forwarded = (request.headers.get("X-Forwarded-For") or "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    real_ip = (request.headers.get("X-Real-IP") or "").strip()
    if real_ip:
        return real_ip[:45]
    return (request.remote_addr or "unknown").strip()[:45] or "unknown"
