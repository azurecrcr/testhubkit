from __future__ import annotations

import os
from typing import Optional, Tuple

from core.config import MAX_IMAGE_UPLOAD_BYTES, MAX_IMAGE_UPLOAD_MB


def image_upload_size_bytes(file) -> Optional[int]:
    try:
        file.seek(0, os.SEEK_END)
        size = int(file.tell())
        file.seek(0)
        return size
    except Exception:
        return None


def validate_image_upload_size(file) -> Tuple[bool, Optional[str]]:
    size = image_upload_size_bytes(file)
    if size is None:
        return False, "无法读取上传文件大小，请重试或更换浏览器"
    if size <= 0:
        return False, "上传的文件为空，请重新上传"
    if size > MAX_IMAGE_UPLOAD_BYTES:
        mb = size / (1024 * 1024)
        return False, f"图片大小超过限制（最大 {MAX_IMAGE_UPLOAD_MB:g} MB，当前约 {mb:.1f} MB）"
    return True, None
