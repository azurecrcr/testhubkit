"""交流群微信二维码：可写 uploads，经 Nginx /community-qr/ 直出（避免拖慢页面静态资源）。"""

from __future__ import annotations

import shutil
import time
from pathlib import Path
from typing import Any, Optional

from werkzeug.datastructures import FileStorage

from core.config import BASE_DIR, UPLOADS_DIR
from core.utils.image_upload import validate_image_upload_size

_REL_DIR = "community"
_FILENAME = "wechat_group_qr.png"
_ALLOWED_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_MAX_BYTES = 5 * 1024 * 1024
# 由 nginx 直接提供，不经 Flask，避免占用应用连接
_PUBLIC_PATH = "/community-qr/wechat_group_qr.png"


def _upload_path() -> Path:
    d = Path(UPLOADS_DIR) / _REL_DIR
    d.mkdir(parents=True, exist_ok=True)
    return d / _FILENAME


def _default_static_path() -> Path:
    return Path(BASE_DIR) / "static" / "img" / "community" / _FILENAME


def ensure_upload_qr_seeded() -> Path:
    """
    确保 uploads 下有可给 nginx 直出的文件。
    若尚无管理员上传，则从 static 默认图复制一份（独立方法，不影响其它上传逻辑）。
    """
    dest = _upload_path()
    if dest.is_file() and dest.stat().st_size > 0:
        return dest
    default = _default_static_path()
    if not default.is_file():
        raise FileNotFoundError("微信交流群二维码文件不存在")
    try:
        shutil.copy2(default, dest)
    except Exception as exc:
        raise RuntimeError("初始化交流群二维码失败") from exc
    return dest


def resolve_wechat_qr_abs_path() -> Path:
    """优先 uploads（含 seed），否则 static 默认图。"""
    try:
        return ensure_upload_qr_seeded()
    except Exception:
        default = _default_static_path()
        if default.is_file():
            return default
        raise FileNotFoundError("微信交流群二维码文件不存在")


def wechat_qr_version_token() -> str:
    try:
        p = resolve_wechat_qr_abs_path()
        return str(int(p.stat().st_mtime))
    except Exception:
        return str(int(time.time()))


def wechat_qr_public_url() -> str:
    """Nginx 静态路径，带版本参数便于刷新缓存。"""
    try:
        ensure_upload_qr_seeded()
    except Exception:
        pass
    return f"{_PUBLIC_PATH}?v={wechat_qr_version_token()}"


def save_wechat_qr_upload(file: FileStorage) -> dict[str, Any]:
    """管理员上传替换；写入 uploads，由 nginx /community-qr/ 提供。"""
    if file is None or not getattr(file, "filename", None):
        raise ValueError("请选择要上传的二维码图片")

    ok, err = validate_image_upload_size(file)
    if not ok:
        raise ValueError(err or "图片无效")

    size = None
    try:
        file.stream.seek(0, 2)
        size = int(file.stream.tell())
        file.stream.seek(0)
    except Exception:
        size = None
    if size is not None and size > _MAX_BYTES:
        raise ValueError("二维码图片不能超过 5 MB")

    name = (file.filename or "").strip().lower()
    ext = Path(name).suffix
    if ext not in _ALLOWED_EXTS:
        raise ValueError("仅支持 PNG / JPG / WEBP / GIF")

    dest = _upload_path()
    backup: Optional[Path] = None
    if dest.is_file():
        backup = dest.with_suffix(dest.suffix + f".bak_{int(time.time())}")
        try:
            shutil.copy2(dest, backup)
        except Exception:
            backup = None

    tmp = dest.with_suffix(".upload_tmp")
    try:
        file.stream.seek(0)
        file.save(str(tmp))
        if dest.exists():
            dest.unlink()
        tmp.replace(dest)
    except Exception:
        if tmp.exists():
            try:
                tmp.unlink()
            except Exception:
                pass
        if backup and backup.is_file() and not dest.is_file():
            try:
                shutil.copy2(backup, dest)
            except Exception:
                pass
        raise RuntimeError("保存二维码失败，请稍后重试")

    return {
        "url": wechat_qr_public_url(),
        "version": wechat_qr_version_token(),
    }


def sniff_wechat_qr_mimetype(path: Path) -> str:
    try:
        head = path.read_bytes()[:16]
    except Exception:
        return "image/png"
    if head.startswith(b"\x89PNG"):
        return "image/png"
    if head.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if head.startswith(b"RIFF") and b"WEBP" in head[:16]:
        return "image/webp"
    return "image/png"
