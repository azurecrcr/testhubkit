from __future__ import annotations

import html
import re
import time
from pathlib import Path
from typing import Any, Optional

from core.config import UPLOADS_DIR
from core.services.auth.auth_db import ensure_auth_tables
from core.services.auth.user_avatar_service import AVATAR_DIR_NAME, resolve_avatar_abs_path
from core.services.test_cases.mysql_db import get_connection

DEFAULT_AVATAR_SUBDIR = "default"
DEFAULT_AVATAR_SIZE = 128


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _default_avatar_dir() -> Path:
    path = Path(UPLOADS_DIR) / AVATAR_DIR_NAME / DEFAULT_AVATAR_SUBDIR
    path.mkdir(parents=True, exist_ok=True)
    return path


def is_generated_default_avatar_path(avatar_path: str | None) -> bool:
    raw = (avatar_path or "").strip().replace("\\", "/")
    if not raw:
        return True
    prefix = f"{AVATAR_DIR_NAME}/{DEFAULT_AVATAR_SUBDIR}/"
    return raw.startswith(prefix)


def resolve_avatar_label(display_name: str | None, email: str | None = None) -> str:
    name = (display_name or "").strip()
    if name:
        return name[:64]
    mail = (email or "").strip()
    if "@" in mail:
        local = mail.split("@", 1)[0].strip()
        if local:
            return local[:64]
    if mail:
        return mail[:64]
    return "用户"


def _avatar_font_size(label: str) -> int:
    n = len(label)
    if n <= 2:
        return 40
    if n <= 4:
        return 30
    if n <= 6:
        return 24
    return 18


def _avatar_display_text(label: str) -> str:
    text = (label or "").strip() or "用户"
    if len(text) <= 8:
        return text
    return text[:7] + "…"


def build_default_avatar_svg(label: str) -> str:
    text = _avatar_display_text(resolve_avatar_label(label))
    safe = html.escape(text, quote=True)
    font_size = _avatar_font_size(text)
    y = DEFAULT_AVATAR_SIZE / 2 + font_size * 0.36
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{DEFAULT_AVATAR_SIZE}" height="{DEFAULT_AVATAR_SIZE}" '
        f'viewBox="0 0 {DEFAULT_AVATAR_SIZE} {DEFAULT_AVATAR_SIZE}" role="img" aria-label="{safe}">\n'
        f'  <rect width="{DEFAULT_AVATAR_SIZE}" height="{DEFAULT_AVATAR_SIZE}" fill="#ffffff"/>\n'
        '  <text x="50%" y="' + f'{y:.2f}' + '" text-anchor="middle" '
        'font-family="system-ui, -apple-system, \'Segoe UI\', \'PingFang SC\', \'Microsoft YaHei\', sans-serif" '
        f'font-size="{font_size}" font-weight="600" fill="#334155">{safe}</text>\n'
        '</svg>\n'
    )


def default_avatar_rel_path(user_id: str) -> str:
    return f"{AVATAR_DIR_NAME}/{DEFAULT_AVATAR_SUBDIR}/{user_id}.svg"


def write_default_avatar_file(*, user_id: str, label: str) -> Path:
    if not (isinstance(user_id, str) and len(user_id) == 32 and user_id.isalnum()):
        raise ValueError("无效用户")
    abs_path = _default_avatar_dir() / f"{user_id}.svg"
    abs_path.write_text(build_default_avatar_svg(label), encoding="utf-8")
    return abs_path


def ensure_user_default_avatar(
    *,
    user_id: str,
    display_name: str | None,
    email: str | None = None,
    update_db: bool = True,
) -> str:
    ensure_auth_tables()
    label = resolve_avatar_label(display_name, email)
    write_default_avatar_file(user_id=user_id, label=label)
    rel_path = default_avatar_rel_path(user_id)
    if not update_db:
        return rel_path
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE hub_users SET avatar_path = %s, updated_at = %s WHERE id = %s",
                (rel_path, now, user_id),
            )
    finally:
        conn.close()
    return rel_path


def regenerate_default_avatar_if_applicable(
    *,
    user_id: str,
    display_name: str | None,
    avatar_path: str | None,
    email: str | None = None,
) -> Optional[str]:
    if not is_generated_default_avatar_path(avatar_path):
        custom = resolve_avatar_abs_path(avatar_path)
        if custom:
            return None
    return ensure_user_default_avatar(
        user_id=user_id,
        display_name=display_name,
        email=email,
        update_db=True,
    )


def backfill_missing_default_avatars() -> int:
    ensure_auth_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, display_name, avatar_path FROM hub_users "
                "WHERE avatar_path IS NULL OR avatar_path = ''"
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()

    count = 0
    for row in rows:
        uid = row.get("id")
        if not uid:
            continue
        ensure_user_default_avatar(
            user_id=uid,
            display_name=row.get("display_name"),
            email=row.get("email"),
            update_db=True,
        )
        count += 1
    return count


def backfill_stale_default_avatars_without_file() -> int:
    ensure_auth_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, display_name, avatar_path FROM hub_users "
                "WHERE avatar_path LIKE %s",
                (f"{AVATAR_DIR_NAME}/{DEFAULT_AVATAR_SUBDIR}/%",),
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()

    count = 0
    for row in rows:
        uid = row.get("id")
        path = row.get("avatar_path")
        if not uid or not path:
            continue
        if resolve_avatar_abs_path(path):
            continue
        ensure_user_default_avatar(
            user_id=uid,
            display_name=row.get("display_name"),
            email=row.get("email"),
            update_db=True,
        )
        count += 1
    return count
