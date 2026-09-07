"""本机 MCP 反代：Agent Daemon 访问 127.0.0.1:18770/{device}/{channel}/... 转发到客户端中继。"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import unquote

from .hub import get_relay_hub

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 18770

_SERVER: ThreadingHTTPServer | None = None
_THREAD: threading.Thread | None = None
_LOCK = threading.Lock()


def _parse_path(path: str) -> tuple[str, str, str] | None:
    # /d/{device_id}/{channel}/mcp... （channel: playwright | windows-computer-use）
    raw = unquote(path or "/")
    parts = [p for p in raw.split("/") if p]
    if len(parts) < 3 or parts[0] != "d":
        return None
    device_id = parts[1]
    channel = parts[2]
    rest = "/" + "/".join(parts[3:]) if len(parts) > 3 else "/"
    if not rest.startswith("/"):
        rest = "/" + rest
    return device_id, channel, rest


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        return

    def _read_body(self) -> bytes:
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except Exception:
            n = 0
        if n <= 0:
            return b""
        return self.rfile.read(n)

    def _handle(self) -> None:
        parsed = _parse_path(self.path.split("?", 1)[0])
        if parsed is None:
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"bad_path"}')
            return
        device_id, channel, rest = parsed
        if channel not in ("playwright", "windows-computer-use"):
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"unknown_channel"}')
            return

        headers = {
            k: v
            for k, v in self.headers.items()
            if k.lower()
            not in ("host", "content-length", "connection", "transfer-encoding")
        }
        body = self._read_body()
        hub = get_relay_hub()
        req = hub.enqueue_and_wait(
            device_id=device_id,
            channel=channel,
            method=self.command,
            path=rest + (("?" + self.path.split("?", 1)[1]) if "?" in self.path else ""),
            headers=headers,
            body=body,
            timeout_sec=90.0,
        )
        self.send_response(int(req.response_status or 502))
        sent_ct = False
        for k, v in (req.response_headers or {}).items():
            lk = str(k).lower()
            if lk in ("transfer-encoding", "content-length", "connection"):
                continue
            if lk == "content-type":
                sent_ct = True
            self.send_header(str(k), str(v))
        if not sent_ct:
            self.send_header("Content-Type", "application/json")
        payload = req.response_body or b""
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def do_GET(self) -> None:  # noqa: N802
        if self.path in ("/", "/health"):
            body = json.dumps({"ok": True, "service": "desktop-mcp-proxy"}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self._handle()

    def do_POST(self) -> None:  # noqa: N802
        self._handle()

    def do_PUT(self) -> None:  # noqa: N802
        self._handle()

    def do_DELETE(self) -> None:  # noqa: N802
        self._handle()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._handle()


def ensure_local_mcp_proxy_started(
    *, host: str = DEFAULT_HOST, port: int = DEFAULT_PORT
) -> dict[str, Any]:
    global _SERVER, _THREAD
    with _LOCK:
        if _SERVER is not None:
            return {"ok": True, "host": host, "port": port, "already": True}
        try:
            server = ThreadingHTTPServer((host, int(port)), _Handler)
            server.daemon_threads = True
            th = threading.Thread(
                target=server.serve_forever,
                name="desktop-mcp-proxy",
                daemon=True,
            )
            th.start()
            _SERVER = server
            _THREAD = th
            return {"ok": True, "host": host, "port": port, "already": False}
        except OSError as exc:
            return {"ok": False, "error": str(exc), "host": host, "port": port}
