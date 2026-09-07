"""RAG 状态快照：供 /api/rag/status 使用，避免每次打开 Chroma。

检索路径仍走 service.is_rag_available / retrieve，不改行为。
"""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any

from core.services.rag import config as rag_config

_LOCK = threading.Lock()
_MEM: dict[str, Any] = {"expires": 0.0, "payload": None}
_MEM_TTL_SEC = 30.0
_FILE_NAME = "rag_status_snapshot.json"


def snapshot_path() -> Path:
    return rag_config.knowledge_dir() / _FILE_NAME


def _read_file() -> dict[str, Any] | None:
    path = snapshot_path()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    return data


def write_rag_status_snapshot(
    *,
    available: bool,
    chunk_count: int,
    last_ingest_at: str | None = None,
) -> dict[str, Any]:
    payload = {
        "available": bool(available),
        "chunk_count": int(chunk_count or 0),
        "last_ingest_at": last_ingest_at,
        "updated_at": time.time(),
    }
    path = snapshot_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
    except Exception:
        pass
    with _LOCK:
        _MEM["payload"] = payload
        _MEM["expires"] = time.monotonic() + _MEM_TTL_SEC
    return payload


def refresh_rag_status_snapshot_from_chroma() -> dict[str, Any]:
    """仅在快照缺失/强制刷新时打开 Chroma；写入文件后供全站 status 复用。"""
    from core.services.rag.service import (
        get_rag_last_ingest_at,
        invalidate_rag_status_cache,
        probe_chroma_status,
    )

    invalidate_rag_status_cache()
    available, count = probe_chroma_status()
    return write_rag_status_snapshot(
        available=available,
        chunk_count=count,
        last_ingest_at=get_rag_last_ingest_at(),
    )


def get_rag_status_for_api(*, force_refresh: bool = False) -> dict[str, Any]:
    """给 /api/rag/status 用的轻量状态（新方法，不影响检索）。"""
    now = time.monotonic()
    if not force_refresh:
        with _LOCK:
            if _MEM["payload"] is not None and float(_MEM["expires"]) > now:
                return dict(_MEM["payload"])
        file_data = _read_file()
        if file_data is not None:
            with _LOCK:
                _MEM["payload"] = file_data
                _MEM["expires"] = now + _MEM_TTL_SEC
            return dict(file_data)

    with _LOCK:
        # 双检：并发首屏只让一个 worker 刷 Chroma
        if not force_refresh and _MEM["payload"] is not None and float(_MEM["expires"]) > time.monotonic():
            return dict(_MEM["payload"])
        refreshing = _MEM.get("_refreshing")
        if refreshing:
            waiter = refreshing
        else:
            waiter = threading.Event()
            _MEM["_refreshing"] = waiter
            waiter.clear()
            refreshing = None

    if refreshing is not None:
        refreshing.wait(timeout=12)
        file_data = _read_file()
        if file_data is not None:
            return dict(file_data)
        return {"available": False, "chunk_count": 0, "last_ingest_at": None, "updated_at": time.time()}

    try:
        return refresh_rag_status_snapshot_from_chroma()
    finally:
        with _LOCK:
            ev = _MEM.pop("_refreshing", None)
            if isinstance(ev, threading.Event):
                ev.set()
