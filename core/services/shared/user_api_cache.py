"""Per-user API 短缓存：进程内 + 跨 worker 文件缓存。"""
from __future__ import annotations

import copy
import fcntl
import json
import os
import time
from pathlib import Path
from typing import Any, Callable

_DEFAULT_TTL = float(os.environ.get("USER_API_CACHE_TTL_SEC", "10"))
_CACHE: dict[str, tuple[float, Any]] = {}
_CACHE_FILE = Path(os.environ.get("USER_API_CACHE_FILE", "/tmp/testhub_user_api_cache.json"))
_LOCK_FILE = Path(os.environ.get("USER_API_CACHE_LOCK", "/tmp/testhub_user_api_cache.lock"))


def _cache_key(namespace: str, user_id: str) -> str:
    return f"{namespace}:{user_id}"


def _load_file_entry(key: str, ttl: float) -> Any | None:
    try:
        if not _CACHE_FILE.is_file():
            return None
        raw = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return None
        entry = raw.get(key)
        if not isinstance(entry, dict):
            return None
        cached_at = float(entry.get("cached_at") or 0)
        if time.time() - cached_at > ttl:
            return None
        return entry.get("payload")
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return None


def _save_file_entry(key: str, payload: Any) -> None:
    try:
        _CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        data: dict[str, Any] = {}
        if _CACHE_FILE.is_file():
            try:
                loaded = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    data = loaded
            except (json.JSONDecodeError, TypeError):
                data = {}
        data[key] = {"cached_at": time.time(), "payload": copy.deepcopy(payload)}
        tmp = _CACHE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, default=str), encoding="utf-8")
        tmp.replace(_CACHE_FILE)
    except OSError:
        pass


def resolve(
    namespace: str,
    user_id: str,
    *,
    build: Callable[[], Any],
    ttl_sec: float | None = None,
) -> Any:
    ttl = _DEFAULT_TTL if ttl_sec is None else ttl_sec
    key = _cache_key(namespace, user_id)
    now = time.time()
    hit = _CACHE.get(key)
    if hit is not None and now - hit[0] < ttl:
        return copy.deepcopy(hit[1])

    shared = _load_file_entry(key, ttl)
    if shared is not None:
        _CACHE[key] = (now, copy.deepcopy(shared))
        return copy.deepcopy(shared)

    _LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(_LOCK_FILE, "w", encoding="utf-8") as lock_fd:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        try:
            hit = _CACHE.get(key)
            if hit is not None and time.time() - hit[0] < ttl:
                return copy.deepcopy(hit[1])
            shared = _load_file_entry(key, ttl)
            if shared is not None:
                _CACHE[key] = (time.time(), copy.deepcopy(shared))
                return copy.deepcopy(shared)
            val = build()
            _CACHE[key] = (time.time(), copy.deepcopy(val))
            _save_file_entry(key, val)
            return val
        finally:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)


def invalidate(namespace: str, user_id: str) -> None:
    key = _cache_key(namespace, user_id)
    _CACHE.pop(key, None)
    try:
        if not _CACHE_FILE.is_file():
            return
        raw = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        if isinstance(raw, dict) and key in raw:
            raw.pop(key, None)
            tmp = _CACHE_FILE.with_suffix(".tmp")
            tmp.write_text(json.dumps(raw, default=str), encoding="utf-8")
            tmp.replace(_CACHE_FILE)
    except (OSError, json.JSONDecodeError, TypeError):
        pass


def invalidate_user(user_id: str) -> None:
    suffix = f":{user_id}"
    for key in list(_CACHE.keys()):
        if key.endswith(suffix):
            _CACHE.pop(key, None)
    try:
        if not _CACHE_FILE.is_file():
            return
        raw = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return
        changed = False
        for key in list(raw.keys()):
            if key.endswith(suffix):
                raw.pop(key, None)
                changed = True
        if changed:
            tmp = _CACHE_FILE.with_suffix(".tmp")
            tmp.write_text(json.dumps(raw, default=str), encoding="utf-8")
            tmp.replace(_CACHE_FILE)
    except (OSError, json.JSONDecodeError, TypeError):
        pass
