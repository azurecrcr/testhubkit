"""桌面 Workbench Agent 作业网关 + MCP 中继 long-poll（对客户端中性命名）。"""

from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

from flask import Blueprint, jsonify, request

from core.services.auth.desktop_auth_service import (
    get_request_desktop_auth,
    require_desktop_token,
)
from core.services.desktop_relay.hub import get_relay_hub
from core.services.desktop_relay.vendor_scrub import scrub_payload, scrub_text

RELAY_MCP_PORT = int(os.environ.get("DESKTOP_RELAY_MCP_PORT", "18770") or 18770)
DESKTOP_RELAY_URL = (os.environ.get("DESKTOP_RELAY_URL") or "").strip().rstrip("/")
DESKTOP_RELAY_TOKEN = (os.environ.get("DESKTOP_RELAY_TOKEN") or "").strip()
# 桌面专用 Daemon（默认 8766）；与网页 UIA 的 MCP_AGENT_DAEMON_URL(8765) 拆开
_DEFAULT_WORKBENCH_DAEMON = "http://host.docker.internal:8766"


def _daemon_url() -> str:
    return (
        (os.environ.get("WORKBENCH_AGENT_DAEMON_URL") or "").strip()
        or _DEFAULT_WORKBENCH_DAEMON
    ).rstrip("/")


def _workbench_api_key() -> tuple[str, str]:
    """返回 (api_key, agent_model)。优先环境变量，其次站点内置配置。"""
    env_key = (os.environ.get("WORKBENCH_AGENT_API_KEY") or "").strip()
    env_model = (os.environ.get("WORKBENCH_AGENT_MODEL") or "").strip()
    if env_key:
        return env_key, env_model
    try:
        from core.services.ai.builtin_ai_config_db import get_stored_builtin_cursor_agent_config

        cfg = get_stored_builtin_cursor_agent_config()
        return (
            str(cfg.get("cursor_api_key") or "").strip(),
            str(cfg.get("agent_model") or "").strip(),
        )
    except Exception:
        return "", ""


def _daemon_request(
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    *,
    timeout: float = 30.0,
) -> tuple[int, dict[str, Any]]:
    url = f"{_daemon_url()}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            payload = json.loads(raw) if raw else {}
            if not isinstance(payload, dict):
                payload = {"raw": payload}
            return int(resp.status), payload
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"error": raw or str(exc)}
        if not isinstance(payload, dict):
            payload = {"error": str(payload)}
        return int(exc.code), payload
    except Exception as exc:
        return 0, {"error": "agent_unavailable", "detail": str(exc)}


def _relay_remote(method: str, path: str, body: dict[str, Any] | None = None) -> tuple[int, dict[str, Any]]:
    if not DESKTOP_RELAY_URL:
        return 0, {"error": "relay_not_configured"}
    url = f"{DESKTOP_RELAY_URL}{path}"
    data = None
    headers = {"Accept": "application/json"}
    # 透传桌面 Token + 内部中继 Token（独立 Relay 进程校验）
    auth = request.headers.get("Authorization") or ""
    if auth:
        headers["Authorization"] = auth
    if DESKTOP_RELAY_TOKEN:
        headers["X-Desktop-Relay-Token"] = DESKTOP_RELAY_TOKEN
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45.0) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            payload = json.loads(raw) if raw else {}
            if not isinstance(payload, dict):
                payload = {"raw": payload}
            return int(resp.status), payload
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"error": raw or str(exc)}
        if not isinstance(payload, dict):
            payload = {"error": str(payload)}
        return int(exc.code), payload
    except Exception as exc:
        return 0, {"error": "relay_unavailable", "detail": str(exc)}


def _mcp_url(device_id: str, channel: str) -> str:
    return f"http://127.0.0.1:{RELAY_MCP_PORT}/d/{device_id}/{channel}/mcp"


def register_routes(bp: Blueprint) -> None:
    @bp.get("/desktop/agent/health")
    @require_desktop_token
    def desktop_agent_health():
        auth = get_request_desktop_auth() or {}
        device_id = str(auth.get("device_id") or "")
        code, daemon = _daemon_request("GET", "/health", timeout=5.0)
        daemon_ok = code == 200 and bool(daemon.get("ok"))
        if DESKTOP_RELAY_URL:
            rcode, rbody = _relay_remote(
                "GET", f"/internal/device/{device_id}/online"
            )
            relay_online = rcode == 200 and bool(rbody.get("online"))
        else:
            relay_online = get_relay_hub().is_online(device_id)
        ok = daemon_ok and relay_online
        return jsonify(
            {
                "ok": ok,
                "daemon_ok": daemon_ok,
                "relay_online": relay_online,
                "error": None
                if ok
                else (
                    "device_offline"
                    if daemon_ok and not relay_online
                    else "agent_unavailable"
                ),
            }
        )

    @bp.post("/desktop/agent/jobs")
    @require_desktop_token
    def desktop_agent_submit_job():
        auth = get_request_desktop_auth() or {}
        device_id = str(auth.get("device_id") or "")
        user_id = str(auth.get("user_id") or "")
        data = request.get_json(silent=True) or {}
        prompt = str(data.get("prompt") or "").strip()
        if not prompt:
            return jsonify({"ok": False, "error": "prompt required"}), 400

        # 客户端不得携带供应商密钥字段
        if "cursor_api_key" in data:
            return jsonify({"ok": False, "error": "forbidden_field"}), 400

        channels = data.get("mcp_channels") or []
        if not isinstance(channels, list) or not channels:
            return jsonify({"ok": False, "error": "mcp_channels required"}), 400
        allowed = {"playwright", "windows-computer-use"}
        mcp_servers: dict[str, dict[str, str]] = {}
        for ch in channels:
            name = str(ch or "").strip()
            if name in allowed:
                mcp_servers[name] = {"url": _mcp_url(device_id, name)}
        if not mcp_servers:
            return jsonify({"ok": False, "error": "mcp_channel_down"}), 400

        if DESKTOP_RELAY_URL:
            rcode, rbody = _relay_remote(
                "GET", f"/internal/device/{device_id}/online"
            )
            online = rcode == 200 and bool(rbody.get("online"))
        else:
            online = get_relay_hub().is_online(device_id)
        if not online:
            return jsonify({"ok": False, "error": "device_offline"}), 503

        api_key, site_model = _workbench_api_key()
        if not api_key:
            return jsonify({"ok": False, "error": "agent_unavailable"}), 503
        agent_model = str(data.get("agent_model") or "").strip() or site_model or None

        forward: dict[str, Any] = {
            "prompt": prompt,
            "user_id": user_id,
            "cursor_api_key": api_key,
            "mcp_servers": mcp_servers,
        }
        if agent_model:
            forward["agent_model"] = agent_model

        code, payload = _daemon_request("POST", "/workbench/jobs", forward, timeout=60.0)
        if code in (200, 202) and payload.get("job_id"):
            return jsonify(
                {
                    "ok": True,
                    "job_id": payload.get("job_id"),
                    "status": payload.get("status") or "pending",
                }
            ), (202 if code == 202 else 200)
        raw_err = str(payload.get("error") or payload.get("detail") or "agent_unavailable")
        err = scrub_text(raw_err)
        if "cursor" in raw_err.lower() or "api_key" in raw_err.lower():
            err = "agent_unavailable"
        return jsonify({"ok": False, "error": err}), (502 if code else 503)

    @bp.get("/desktop/agent/jobs/<job_id>")
    @require_desktop_token
    def desktop_agent_get_job(job_id: str):
        code, payload = _daemon_request("GET", f"/jobs/{job_id}", timeout=15.0)
        payload["http_status"] = code
        payload["ok"] = code == 200 and bool(payload.get("job_id") or payload.get("status"))
        if not payload.get("ok") and code == 0:
            payload["error"] = "agent_unavailable"
        return jsonify(scrub_payload(payload)), (code if code else 503)

    @bp.post("/desktop/agent/jobs/<job_id>/cancel")
    @require_desktop_token
    def desktop_agent_cancel_job(job_id: str):
        code, payload = _daemon_request("POST", f"/jobs/{job_id}/cancel", {}, timeout=15.0)
        payload["ok"] = code == 200
        if not payload.get("ok") and code == 0:
            payload["error"] = "agent_unavailable"
        return jsonify(scrub_payload(payload)), (code if code else 503)

    # --- MCP 中继 long-poll（嵌入式 Hub；若配置 DESKTOP_RELAY_URL 则透传） ---

    @bp.post("/desktop/relay/register")
    @require_desktop_token
    def desktop_relay_register():
        auth = get_request_desktop_auth() or {}
        device_id = str(auth.get("device_id") or "")
        user_id = str(auth.get("user_id") or "")
        data = request.get_json(silent=True) or {}
        body_device = str(data.get("device_id") or "").strip()
        if body_device and body_device != device_id:
            return jsonify({"ok": False, "error": "device_mismatch"}), 403
        channels = data.get("channels") or ["playwright", "windows-computer-use"]
        if not isinstance(channels, list):
            channels = ["playwright", "windows-computer-use"]
        if DESKTOP_RELAY_URL:
            code, payload = _relay_remote(
                "POST",
                "/register",
                {
                    "device_id": device_id,
                    "user_id": user_id,
                    "channels": channels,
                },
            )
            return jsonify(payload if payload else {"ok": False}), (code if code else 503)
        get_relay_hub().register(device_id, user_id, [str(c) for c in channels])
        return jsonify({"ok": True, "device_id": device_id})

    @bp.post("/desktop/relay/wait")
    @require_desktop_token
    def desktop_relay_wait():
        auth = get_request_desktop_auth() or {}
        device_id = str(auth.get("device_id") or "")
        data = request.get_json(silent=True) or {}
        timeout_ms = int(data.get("timeout_ms") or 25000)
        timeout_ms = max(1000, min(timeout_ms, 28000))
        if DESKTOP_RELAY_URL:
            code, payload = _relay_remote(
                "POST",
                "/wait",
                {"device_id": device_id, "timeout_ms": timeout_ms},
            )
            return jsonify(payload if payload else {"ok": False}), (code if code else 503)

        hub = get_relay_hub()
        if not hub.heartbeat(device_id):
            return jsonify({"ok": False, "error": "not_registered"}), 409
        deadline = time.time() + (timeout_ms / 1000.0)
        while time.time() < deadline:
            items = hub.pop_requests(device_id, max_items=8)
            if items:
                return jsonify({"ok": True, "requests": items})
            time.sleep(0.15)
        return jsonify({"ok": True, "requests": []})

    @bp.post("/desktop/relay/reply")
    @require_desktop_token
    def desktop_relay_reply():
        auth = get_request_desktop_auth() or {}
        device_id = str(auth.get("device_id") or "")
        data = request.get_json(silent=True) or {}
        req_id = str(data.get("id") or "").strip()
        if not req_id:
            return jsonify({"ok": False, "error": "id required"}), 400
        try:
            body = base64.b64decode(str(data.get("body_b64") or ""))
        except Exception:
            return jsonify({"ok": False, "error": "bad_body"}), 400
        status = int(data.get("status") or 502)
        headers = data.get("headers") if isinstance(data.get("headers"), dict) else {}
        if DESKTOP_RELAY_URL:
            code, payload = _relay_remote(
                "POST",
                "/reply",
                {
                    "device_id": device_id,
                    "id": req_id,
                    "status": status,
                    "headers": headers,
                    "body_b64": str(data.get("body_b64") or ""),
                },
            )
            return jsonify(payload if payload else {"ok": False}), (code if code else 503)
        ok = get_relay_hub().reply(
            device_id=device_id,
            req_id=req_id,
            status=status,
            headers={str(k): str(v) for k, v in headers.items()},
            body=body,
        )
        if not ok:
            return jsonify({"ok": False, "error": "unknown_request"}), 404
        return jsonify({"ok": True})

    @bp.post("/desktop/relay/bye")
    @require_desktop_token
    def desktop_relay_bye():
        auth = get_request_desktop_auth() or {}
        device_id = str(auth.get("device_id") or "")
        if DESKTOP_RELAY_URL:
            code, payload = _relay_remote(
                "POST", "/bye", {"device_id": device_id}
            )
            return jsonify(payload if payload else {"ok": True}), (code if code else 200)
        get_relay_hub().unregister(device_id)
        return jsonify({"ok": True})
