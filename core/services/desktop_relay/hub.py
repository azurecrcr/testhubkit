"""桌面 MCP 中继：设备会话注册 + 请求排队（供本机 18770 代理与 Flask long-poll 共用）。"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class PendingRequest:
    req_id: str
    device_id: str
    channel: str
    method: str
    path: str
    headers: dict[str, str]
    body: bytes
    created_at: float = field(default_factory=time.time)
    event: threading.Event = field(default_factory=threading.Event)
    response_status: int = 502
    response_headers: dict[str, str] = field(default_factory=dict)
    response_body: bytes = b""


class DesktopRelayHub:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        # device_id -> online meta
        self._sessions: dict[str, dict[str, Any]] = {}
        # device_id -> list[PendingRequest] waiting for client
        self._queues: dict[str, list[PendingRequest]] = {}
        # req_id -> PendingRequest
        self._inflight: dict[str, PendingRequest] = {}

    def register(self, device_id: str, user_id: str, channels: list[str]) -> None:
        did = (device_id or "").strip()
        if not did:
            raise ValueError("device_id required")
        with self._lock:
            self._sessions[did] = {
                "device_id": did,
                "user_id": str(user_id or ""),
                "channels": list(channels or []),
                "last_seen": time.time(),
            }
            self._queues.setdefault(did, [])

    def heartbeat(self, device_id: str) -> bool:
        with self._lock:
            sess = self._sessions.get(device_id)
            if not sess:
                return False
            sess["last_seen"] = time.time()
            return True

    def unregister(self, device_id: str) -> None:
        with self._lock:
            self._sessions.pop(device_id, None)
            self._queues.pop(device_id, None)

    def last_seen_age_sec(self, device_id: str) -> float | None:
        with self._lock:
            sess = self._sessions.get(device_id)
            if not sess:
                return None
            return max(0.0, time.time() - float(sess.get("last_seen") or 0))

    def is_online(self, device_id: str, *, max_age_sec: float = 120.0) -> bool:
        age = self.last_seen_age_sec(device_id)
        if age is None:
            return False
        return age <= max_age_sec

    def enqueue_and_wait(
        self,
        *,
        device_id: str,
        channel: str,
        method: str,
        path: str,
        headers: dict[str, str],
        body: bytes,
        timeout_sec: float = 60.0,
    ) -> PendingRequest:
        if not self.is_online(device_id):
            req = PendingRequest(
                req_id=uuid.uuid4().hex,
                device_id=device_id,
                channel=channel,
                method=method,
                path=path,
                headers=headers,
                body=body,
            )
            req.response_status = 503
            age = self.last_seen_age_sec(device_id)
            age_part = (',"last_seen_age_sec":%.1f' % age) if age is not None else ""
            req.response_body = (
                '{"error":"device_offline"%s}' % age_part
            ).encode("utf-8")
            return req

        req = PendingRequest(
            req_id=uuid.uuid4().hex,
            device_id=device_id,
            channel=channel,
            method=method,
            path=path,
            headers=headers,
            body=body or b"",
        )
        with self._lock:
            self._queues.setdefault(device_id, []).append(req)
            self._inflight[req.req_id] = req

        ok = req.event.wait(timeout=timeout_sec)
        with self._lock:
            self._inflight.pop(req.req_id, None)
            q = self._queues.get(device_id) or []
            if req in q:
                q.remove(req)
        if not ok:
            req.response_status = 504
            req.response_body = b'{"error":"relay_timeout"}'
        return req

    def pop_requests(self, device_id: str, *, max_items: int = 8) -> list[dict[str, Any]]:
        import base64

        out: list[dict[str, Any]] = []
        with self._lock:
            if device_id in self._sessions:
                self._sessions[device_id]["last_seen"] = time.time()
            q = self._queues.get(device_id) or []
            while q and len(out) < max_items:
                req = q.pop(0)
                out.append(
                    {
                        "id": req.req_id,
                        "channel": req.channel,
                        "method": req.method,
                        "path": req.path,
                        "headers": req.headers,
                        "body_b64": base64.b64encode(req.body).decode("ascii"),
                    }
                )
        return out

    def reply(
        self,
        *,
        device_id: str,
        req_id: str,
        status: int,
        headers: dict[str, str] | None,
        body: bytes,
    ) -> bool:
        with self._lock:
            req = self._inflight.get(req_id)
            if req is None or req.device_id != device_id:
                return False
            req.response_status = int(status or 502)
            req.response_headers = dict(headers or {})
            req.response_body = body or b""
            req.event.set()
            if device_id in self._sessions:
                self._sessions[device_id]["last_seen"] = time.time()
            return True


_HUB: DesktopRelayHub | None = None
_HUB_LOCK = threading.Lock()


def get_relay_hub() -> DesktopRelayHub:
    global _HUB
    with _HUB_LOCK:
        if _HUB is None:
            _HUB = DesktopRelayHub()
        return _HUB
