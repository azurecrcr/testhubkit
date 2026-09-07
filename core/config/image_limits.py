"""图片上传与图片工具 HTTP 客户端相关限制（可由环境变量覆盖）。"""

from __future__ import annotations

import os

ALLOWED_IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".gif", ".webp")

MAX_IMAGE_UPLOAD_MB = float(os.environ.get("IMAGE_MAX_UPLOAD_MB", "25"))
MAX_IMAGE_UPLOAD_BYTES = int(MAX_IMAGE_UPLOAD_MB * 1024 * 1024)

IMAGE_TOOL_REQUEST_TIMEOUT_SEC = float(os.environ.get("IMAGE_TOOL_REQUEST_TIMEOUT_SEC", "120"))
IMAGE_TOOL_REQUEST_MAX_RETRIES = int(os.environ.get("IMAGE_TOOL_REQUEST_MAX_RETRIES", "3"))
IMAGE_TOOL_REQUEST_RETRY_DELAY_MS = int(os.environ.get("IMAGE_TOOL_REQUEST_RETRY_DELAY_MS", "1000"))
IMAGE_TOOL_REQUEST_TIMEOUT_MS = int(IMAGE_TOOL_REQUEST_TIMEOUT_SEC * 1000)
