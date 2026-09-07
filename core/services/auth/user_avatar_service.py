from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Optional

from werkzeug.utils import secure_filename

from core.config import BASE_DIR, UPLOADS_DIR
from core.services.auth.auth_db import ensure_auth_tables
from core.services.test_cases.mysql_db import get_connection
from core.utils.image_upload import image_upload_size_bytes, validate_image_upload_size

AVATAR_DIR_NAME = "user_avatars"
ALLOWED_AVATAR_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_AVATAR_BYTES = 5 * 1024 * 1024


def _avatar_dir() -> Path:
    path = Path(UPLOADS_DIR) / AVATAR_DIR_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def default_avatar_abs_path() -> Path:
    return Path(BASE_DIR) / "static" / "images" / "auth" / "default-avatar.svg"


def avatar_public_url(updated_at: str | None = None) -> str:
    ts = (updated_at or "").replace(" ", "").replace(":", "")[:15] or str(int(time.time()))
    return f"/api/auth/avatar?v={ts}"


def resolve_avatar_abs_path(avatar_path: str | None) -> Optional[Path]:
    raw = (avatar_path or "").strip().replace("\\", "/")
    if not raw:
        return None
    if raw.startswith("/") or ".." in raw.split("/"):
        return None
    full = (Path(UPLOADS_DIR) / raw).resolve()
    uploads_root = Path(UPLOADS_DIR).resolve()
    if uploads_root not in full.parents and full != uploads_root:
        return None
    if not full.is_file():
        return None
    return full


def resolve_user_avatar_file(
    avatar_path: str | None,
    *,
    user_id: str | None = None,
    display_name: str | None = None,
    email: str | None = None,
) -> Path:
    custom = resolve_avatar_abs_path(avatar_path)
    if custom:
        return custom
    if user_id:
        from core.services.auth.user_default_avatar_service import ensure_user_default_avatar

        rel = ensure_user_default_avatar(
            user_id=user_id,
            display_name=display_name,
            email=email,
            update_db=not avatar_path,
        )
        generated = resolve_avatar_abs_path(rel)
        if generated:
            return generated
    return default_avatar_abs_path()


def save_user_avatar(*, user_id: str, file) -> dict[str, Any]:
    ensure_auth_tables()
    if not (isinstance(user_id, str) and len(user_id) == 32 and user_id.isalnum()):
        raise ValueError("无效用户")

    ok, msg = validate_image_upload_size(file)
    if not ok:
        raise ValueError(msg or "头像文件无效")

    size = image_upload_size_bytes(file)
    if size and size > MAX_AVATAR_BYTES:
        raise ValueError("头像不能超过 5 MB")

    orig = secure_filename(file.filename or "") or "avatar.png"
    ext = Path(orig).suffix.lower()
    if ext not in ALLOWED_AVATAR_EXTS:
        raise ValueError("仅支持 JPG、PNG、WebP、GIF 格式头像")

    rel_path = f"{AVATAR_DIR_NAME}/{user_id}{ext}"
    abs_path = _avatar_dir() / f"{user_id}{ext}"

    for old in _avatar_dir().glob(f"{user_id}.*"):
        if old.suffix.lower() in ALLOWED_AVATAR_EXTS and old != abs_path:
            try:
                old.unlink()
            except OSError:
                pass

    file.save(str(abs_path))
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

    from core.services.auth.user_service import get_user_by_id

    user = get_user_by_id(user_id)
    if not user:
        raise ValueError("保存头像失败")
    return user
