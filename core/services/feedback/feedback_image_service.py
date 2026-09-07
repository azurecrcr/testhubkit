"""投稿建议图片保存与校验（独立模块，不复用视觉附件 / 用例上传实现）。"""

from __future__ import annotations

import io
import os
import uuid
from datetime import datetime, timezone
from typing import Any, BinaryIO

from core.config import feedback_images as cfg
from core.config.paths import UPLOADS_DIR, ensure_upload_dir
from core.services.feedback import feedback_image_db

FEEDBACK_UPLOAD_DIR = os.path.join(UPLOADS_DIR, "feedback")


def _ensure_feedback_upload_dir() -> str:
    ensure_upload_dir()
    os.makedirs(FEEDBACK_UPLOAD_DIR, exist_ok=True)
    return FEEDBACK_UPLOAD_DIR


def _ext_from_name(filename: str) -> str:
    name = (filename or "").strip().lower()
    _, ext = os.path.splitext(name)
    return ext


def _normalize_mime(mime: str) -> str:
    m = (mime or "").strip().lower().split(";")[0].strip()
    if m == "image/jpg":
        return "image/jpeg"
    return m


def validate_and_read_feedback_image(
    *,
    filename: str,
    mime_type: str,
    stream: BinaryIO,
) -> tuple[bytes, str, str]:
    """校验并读取单张投稿图片。返回 (bytes, mime, ext)。"""
    ext = _ext_from_name(filename)
    mime = _normalize_mime(mime_type)
    if ext not in cfg.FEEDBACK_IMAGE_ALLOWED_EXTS and mime not in cfg.FEEDBACK_IMAGE_ALLOWED_MIMES:
        # 粘贴可能无文件名：仅靠 mime
        if mime not in cfg.FEEDBACK_IMAGE_ALLOWED_MIMES:
            raise ValueError("仅支持 JPG / PNG / WEBP / GIF 图片")

    data = stream.read(cfg.FEEDBACK_IMAGE_MAX_BYTES + 1)
    if not data:
        raise ValueError("图片内容为空")
    if len(data) > cfg.FEEDBACK_IMAGE_MAX_BYTES:
        mb = max(1, cfg.FEEDBACK_IMAGE_MAX_BYTES // (1024 * 1024))
        raise ValueError(f"单张图片不能超过 {mb}MB")

    try:
        from PIL import Image

        img = Image.open(io.BytesIO(data))
        img.verify()
        img = Image.open(io.BytesIO(data))
        fmt = (img.format or "").upper()
    except Exception as exc:  # noqa: BLE001
        raise ValueError("文件不是有效图片") from exc

    if fmt not in cfg.FEEDBACK_IMAGE_FORMAT_EXT:
        raise ValueError("仅支持 JPG / PNG / WEBP / GIF 图片")

    out_ext = cfg.FEEDBACK_IMAGE_FORMAT_EXT[fmt]
    out_mime = {
        ".jpg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }[out_ext]
    return data, out_mime, out_ext


def save_feedback_images(
    *,
    feedback_id: str,
    files: list[Any],
) -> list[dict[str, Any]]:
    """将上传文件列表写入磁盘并入库。files 为 Werkzeug FileStorage 列表。"""
    feedback_id = str(feedback_id or "").strip()
    if not feedback_id:
        raise ValueError("缺少投稿 ID")

    items = [f for f in (files or []) if f is not None]
    if len(items) > cfg.FEEDBACK_IMAGE_MAX_COUNT:
        raise ValueError(f"最多上传 {cfg.FEEDBACK_IMAGE_MAX_COUNT} 张图片")

    _ensure_feedback_upload_dir()
    feedback_dir = os.path.join(FEEDBACK_UPLOAD_DIR, feedback_id)
    os.makedirs(feedback_dir, exist_ok=True)

    saved: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for idx, fs in enumerate(items):
        filename = getattr(fs, "filename", None) or f"image_{idx + 1}"
        mime_hint = getattr(fs, "content_type", None) or ""
        stream = getattr(fs, "stream", None) or fs
        data, mime, ext = validate_and_read_feedback_image(
            filename=str(filename),
            mime_type=str(mime_hint),
            stream=stream,
        )
        image_id = uuid.uuid4().hex
        disk_name = f"{image_id}{ext}"
        abs_path = os.path.join(feedback_dir, disk_name)
        with open(abs_path, "wb") as out:
            out.write(data)
        # 相对 uploads 的路径，便于迁移
        rel_path = os.path.join("feedback", feedback_id, disk_name).replace("\\", "/")
        row = {
            "id": image_id,
            "feedback_id": feedback_id,
            "file_name": os.path.basename(str(filename))[:255] or disk_name,
            "mime_type": mime,
            "size_bytes": len(data),
            "storage_path": rel_path,
            "sort_order": idx,
            "created_at": now,
        }
        feedback_image_db.insert_feedback_image(row)
        saved.append(
            {
                "id": image_id,
                "file_name": row["file_name"],
                "mime_type": mime,
                "size_bytes": len(data),
                "sort_order": idx,
            }
        )
    return saved


def resolve_feedback_image_abs_path(storage_path: str) -> str:
    """将库内相对路径解析为绝对路径；拒绝路径穿越。"""
    rel = str(storage_path or "").replace("\\", "/").lstrip("/")
    if not rel.startswith("feedback/") or ".." in rel.split("/"):
        raise ValueError("非法图片路径")
    abs_path = os.path.normpath(os.path.join(UPLOADS_DIR, rel))
    root = os.path.normpath(FEEDBACK_UPLOAD_DIR)
    if not abs_path.startswith(root + os.sep) and abs_path != root:
        raise ValueError("非法图片路径")
    return abs_path
