"""投稿建议图片附件配置（独立于视觉附件 / 用例上传）。"""

from __future__ import annotations

import os

FEEDBACK_IMAGE_MAX_COUNT = int(os.environ.get("FEEDBACK_IMAGE_MAX_COUNT", "3") or "3")
FEEDBACK_IMAGE_MAX_BYTES = int(
    float(os.environ.get("FEEDBACK_IMAGE_MAX_MB", "5") or "5") * 1024 * 1024
)

FEEDBACK_IMAGE_ALLOWED_EXTS = frozenset({".jpg", ".jpeg", ".png", ".webp", ".gif"})
FEEDBACK_IMAGE_ALLOWED_MIMES = frozenset(
    {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
    }
)

# Pillow 校验后的规范化格式 → 扩展名
FEEDBACK_IMAGE_FORMAT_EXT = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
    "GIF": ".gif",
}
