#!/usr/bin/env python3
"""独立 Desktop MCP Relay：本机 18770 反代 + 客户端 API（供 Docker 旁路 / 与 daemon 同机）。

环境变量：
  DESKTOP_RELAY_MCP_HOST / DESKTOP_RELAY_MCP_PORT  默认 127.0.0.1:18770
  DESKTOP_RELAY_API_HOST / DESKTOP_RELAY_API_PORT  默认 127.0.0.1:18771
  DESKTOP_RELAY_TOKEN  内部共享密钥（除 /health 外必填）
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.services.desktop_relay.hub import get_relay_hub  # noqa: E402
from core.services.desktop_relay.local_mcp_proxy import (  # noqa: E402
    ensure_local_mcp_proxy_started,
)

RELAY_TOKEN = (os.environ.get("DESKTOP_RELAY_TOKEN") or "").strip()


def _json_response(handler: BaseHTTPRequestHandler, code: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _read_json(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    try:
        n = int(handler.headers.get("Content-Length") or 0)
    except Exception:
        n = 0
    raw = handler.rfile.read(n) if n > 0 else b""
    if not raw:
        return {}
    try:
        data = json.loads(raw.decode("utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _authorized(handler: BaseHTTPRequestHandler) -> bool:
    """有 Token 时强制校验；无 Token 时仅放行本机环回（不适合 Docker 旁路）。"""
    host = (handler.client_address[0] or "").strip()
    loopback = host in ("127.0.0.1", "::1", "localhost")
    if not RELAY_TOKEN:
        return loopback
    got = (handler.headers.get("X-Desktop-Relay-Token") or "").strip()
    return bool(got) and got == RELAY_TOKEN


class _ApiHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        return

    def do_GET(self) -> None:  # noqa: N802
        path = unquote(self.path.split("?", 1)[0])
        if path in ("/", "/health"):
            _json_response(self, 200, {"ok": True, "service": "desktop-relay"})
            return
        if not _authorized(self):
            _json_response(self, 401, {"ok": False, "error": "unauthorized"})
            return
        if path.startswith("/internal/device/") and path.endswith("/online"):
            device_id = path[len("/internal/device/") : -len("/online")]
            hub = get_relay_hub()
            online = hub.is_online(device_id)
            age = hub.last_seen_age_sec(device_id)
            _json_response(
                self,
                200,
                {
                    "ok": True,
                    "online": online,
                    "device_id": device_id,
                    "last_seen_age_sec": age,
                },
            )
            return
        _json_response(self, 404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        path = unquote(self.path.split("?", 1)[0])
        if not _authorized(self):
            _json_response(self, 401, {"ok": False, "error": "unauthorized"})
            return
        data = _read_json(self)
        hub = get_relay_hub()
        if path == "/register":
            device_id = str(data.get("device_id") or "").strip()
            user_id = str(data.get("user_id") or "").strip()
            channels = data.get("channels") or ["playwright", "windows-computer-use"]
            if not device_id:
                _json_response(self, 400, {"ok": False, "error": "device_id required"})
                return
            hub.register(device_id, user_id, [str(c) for c in channels])
            _json_response(self, 200, {"ok": True, "device_id": device_id})
            return
        if path == "/wait":
            device_id = str(data.get("device_id") or "").strip()
            timeout_ms = int(data.get("timeout_ms") or 25000)
            timeout_ms = max(1000, min(timeout_ms, 28000))
            if not device_id or not hub.heartbeat(device_id):
                _json_response(self, 409, {"ok": False, "error": "not_registered"})
                return
            deadline = time.time() + (timeout_ms / 1000.0)
            while time.time() < deadline:
                items = hub.pop_requests(device_id, max_items=8)
                if items:
                    _json_response(self, 200, {"ok": True, "requests": items})
                    return
                time.sleep(0.15)
            _json_response(self, 200, {"ok": True, "requests": []})
            return
        if path == "/reply":
            device_id = str(data.get("device_id") or "").strip()
            req_id = str(data.get("id") or "").strip()
            try:
                body = base64.b64decode(str(data.get("body_b64") or ""))
            except Exception:
                _json_response(self, 400, {"ok": False, "error": "bad_body"})
                return
            headers = data.get("headers") if isinstance(data.get("headers"), dict) else {}
            ok = hub.reply(
                device_id=device_id,
                req_id=req_id,
                status=int(data.get("status") or 502),
                headers={str(k): str(v) for k, v in headers.items()},
                body=body,
            )
            _json_response(
                self,
                200 if ok else 404,
                {"ok": ok} if ok else {"ok": False, "error": "unknown_request"},
            )
            return
        if path == "/bye":
            device_id = str(data.get("device_id") or "").strip()
            if device_id:
                hub.unregister(device_id)
            _json_response(self, 200, {"ok": True})
            return
        _json_response(self, 404, {"ok": False, "error": "not_found"})


def main() -> None:
    mcp_host = os.environ.get("DESKTOP_RELAY_MCP_HOST", "127.0.0.1")
    mcp_port = int(os.environ.get("DESKTOP_RELAY_MCP_PORT", "18770") or 18770)
    api_host = os.environ.get("DESKTOP_RELAY_API_HOST", "127.0.0.1")
    api_port = int(os.environ.get("DESKTOP_RELAY_API_PORT", "18771") or 18771)

    started = ensure_local_mcp_proxy_started(host=mcp_host, port=mcp_port)
    print(
        "[desktop-relay] mcp_proxy=%s token=%s api=%s:%s"
        % (
            "ok" if started else "fail",
            "set" if RELAY_TOKEN else "unset",
            api_host,
            api_port,
        ),
        flush=True,
    )
    httpd = ThreadingHTTPServer((api_host, api_port), _ApiHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
