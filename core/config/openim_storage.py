"""OpenIM 对象存储（MinIO / S3 兼容）配置。"""

from __future__ import annotations

import os

OPENIM_MINIO_ENDPOINT = os.environ.get("OPENIM_MINIO_ENDPOINT", "minio:9000")
OPENIM_MINIO_ACCESS_KEY = os.environ.get("OPENIM_MINIO_ACCESS_KEY", "")
OPENIM_MINIO_SECRET_KEY = os.environ.get("OPENIM_MINIO_SECRET_KEY", "")
OPENIM_MINIO_BUCKET = os.environ.get("OPENIM_MINIO_BUCKET", "openim")
OPENIM_MINIO_USE_SSL = os.environ.get("OPENIM_MINIO_USE_SSL", "false").lower() in (
    "1",
    "true",
    "yes",
)
OPENIM_MEDIA_PREFIX = os.environ.get("OPENIM_MEDIA_PREFIX", "testhub/media/")
if not OPENIM_MEDIA_PREFIX.endswith("/"):
    OPENIM_MEDIA_PREFIX += "/"

OPENIM_CLEANUP_MAX_AGE_HOURS = float(os.environ.get("OPENIM_CLEANUP_MAX_AGE_HOURS", "24"))
