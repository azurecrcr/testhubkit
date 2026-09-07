"""附件文件存储（uploads/visual）。"""
from __future__ import annotations

import io
import os
import uuid
from pathlib import Path

from core.config.paths import UPLOADS_DIR
from core.services.visual_attachments.limits import MAX_ATTACH_BATCH_FILES

VISUAL_UPLOAD_DIR = os.path.join(UPLOADS_DIR, "visual")
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_PDF_BYTES = 30 * 1024 * 1024
MAX_TXT_BYTES = 2 * 1024 * 1024
MAX_BATCH_FILES = MAX_ATTACH_BATCH_FILES

ALLOWED_IMAGE_MIMES = frozenset(
    {"image/png", "image/jpeg", "image/jpg", "image/webp"}
)
ALLOWED_PDF_MIMES = frozenset({"application/pdf"})
ALLOWED_TXT_MIMES = frozenset({"text/plain"})


def ensure_upload_dir() -> str:
    os.makedirs(VISUAL_UPLOAD_DIR, exist_ok=True)
    return VISUAL_UPLOAD_DIR


def _guess_mime(filename: str, fallback: str = "") -> str:
    lower = (filename or "").lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".pdf"):
        return "application/pdf"
    if lower.endswith(".txt"):
        return "text/plain"
    return fallback or "application/octet-stream"


def save_upload(file_storage, *, user_id: str | None) -> tuple[str, str | None, str, int]:
    ensure_upload_dir()
    raw = file_storage.read()
    size = len(raw)
    mime = (getattr(file_storage, "mimetype", None) or "").split(";")[0].strip().lower()
    filename = getattr(file_storage, "filename", "") or ""
    if not mime:
        mime = _guess_mime(filename)
    elif filename.lower().endswith(".txt") and mime not in ALLOWED_TXT_MIMES:
        mime = "text/plain"

    if mime in ALLOWED_PDF_MIMES:
        if size > MAX_PDF_BYTES:
            raise ValueError(f"PDF 超过 {MAX_PDF_BYTES // (1024 * 1024)}MB 限制")
    elif mime in ALLOWED_TXT_MIMES:
        if size > MAX_TXT_BYTES:
            raise ValueError(f"TXT 超过 {MAX_TXT_BYTES // (1024 * 1024)}MB 限制")
    elif mime in ALLOWED_IMAGE_MIMES:
        if size > MAX_IMAGE_BYTES:
            raise ValueError(f"图片超过 {MAX_IMAGE_BYTES // (1024 * 1024)}MB 限制")
    else:
        raise ValueError("仅支持 PNG/JPG/WebP 图片、PDF 或 TXT 文本")

    prefix = (user_id or "anon")[:8]
    file_id = uuid.uuid4().hex
    ext = ".pdf" if mime == "application/pdf" else ".jpg"
    if mime == "text/plain":
        ext = ".txt"
    elif mime == "image/png":
        ext = ".png"
    elif mime == "image/webp":
        ext = ".webp"

    rel = f"{prefix}/{file_id}{ext}"
    abs_path = os.path.join(VISUAL_UPLOAD_DIR, rel)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, "wb") as f:
        f.write(raw)

    thumb_key = _make_thumb(raw, mime, prefix, file_id)
    return rel, thumb_key, mime, size


def _make_thumb(raw: bytes, mime: str, prefix: str, file_id: str) -> str | None:
    if mime in ALLOWED_PDF_MIMES or mime in ALLOWED_TXT_MIMES:
        return None
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(raw))
        img.thumbnail((160, 160))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        thumb_rel = f"{prefix}/{file_id}_thumb.jpg"
        thumb_path = os.path.join(VISUAL_UPLOAD_DIR, thumb_rel)
        img.save(thumb_path, format="JPEG", quality=85)
        return thumb_rel
    except Exception:
        return None


def resolve_path(storage_key: str) -> Path:
    safe = storage_key.replace("\\", "/").lstrip("/")
    if ".." in safe.split("/"):
        raise ValueError("非法路径")
    return Path(VISUAL_UPLOAD_DIR) / safe


def read_bytes(storage_key: str) -> bytes:
    path = resolve_path(storage_key)
    if not path.is_file():
        raise FileNotFoundError(storage_key)
    return path.read_bytes()


def delete_files(storage_key: str, thumb_key: str | None = None) -> None:
    for key in (storage_key, thumb_key):
        if not key:
            continue
        try:
            path = resolve_path(key)
            if path.is_file():
                path.unlink()
        except Exception:
            pass


def classify_asset_type(mime: str) -> str:
    if mime == "application/pdf":
        return "api_pdf"
    if mime == "text/plain":
        return "text_doc"
    return "design"
