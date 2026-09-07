from __future__ import annotations

import random
import time
import uuid
from typing import Any

from flask import session

_CAPTCHA_SESSION_KEY = "hub_auth_captchas"
_CAPTCHA_TTL_SEC = 300


def _store() -> dict[str, Any]:
    data = session.get(_CAPTCHA_SESSION_KEY)
    if not isinstance(data, dict):
        data = {}
    return data


def _save_store(data: dict[str, Any]) -> None:
    session[_CAPTCHA_SESSION_KEY] = data
    session.modified = True


def _prune(data: dict[str, Any]) -> dict[str, Any]:
    now = time.time()
    return {k: v for k, v in data.items() if isinstance(v, dict) and float(v.get("exp", 0)) > now}


def create_captcha() -> dict[str, str]:
    a = random.randint(2, 19)
    b = random.randint(2, 19)
    captcha_id = uuid.uuid4().hex
    data = _prune(_store())
    data[captcha_id] = {"answer": str(a + b), "exp": time.time() + _CAPTCHA_TTL_SEC}
    _save_store(data)
    return {"captcha_id": captcha_id, "question": f"{a} + {b} = ?"}


def verify_captcha(captcha_id: str, answer: str) -> bool:
    cid = str(captcha_id or "").strip()
    ans = str(answer or "").strip()
    if not cid or not ans:
        return False
    data = _prune(_store())
    entry = data.pop(cid, None)
    _save_store(data)
    if not entry:
        return False
    return ans == str(entry.get("answer"))
