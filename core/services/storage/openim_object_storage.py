"""OpenIM 对象存储：通过 MinIO（S3 兼容）保存多媒体临时文件。"""

from __future__ import annotations

import io
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from core.config import openim_storage as cfg

logger = logging.getLogger(__name__)

_storage: Optional["OpenIMObjectStorage"] = None


def is_openim_storage_enabled() -> bool:
    return bool(
        cfg.OPENIM_MINIO_ENDPOINT
        and cfg.OPENIM_MINIO_BUCKET
        and cfg.OPENIM_MINIO_ACCESS_KEY
        and cfg.OPENIM_MINIO_SECRET_KEY
    )


def get_openim_storage() -> "OpenIMObjectStorage":
    global _storage
    if _storage is None:
        _storage = OpenIMObjectStorage()
    return _storage


class OpenIMObjectStorage:
    def __init__(self) -> None:
        if not is_openim_storage_enabled():
            raise RuntimeError("OpenIM MinIO 未配置，请设置 OPENIM_MINIO_* 环境变量")

        from minio import Minio

        self._client = Minio(
            cfg.OPENIM_MINIO_ENDPOINT,
            access_key=cfg.OPENIM_MINIO_ACCESS_KEY,
            secret_key=cfg.OPENIM_MINIO_SECRET_KEY,
            secure=cfg.OPENIM_MINIO_USE_SSL,
        )
        self.bucket = cfg.OPENIM_MINIO_BUCKET
        self.prefix = cfg.OPENIM_MEDIA_PREFIX
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        import time

        last_err = None
        for attempt in range(8):
            try:
                if not self._client.bucket_exists(self.bucket):
                    self._client.make_bucket(self.bucket)
                    logger.info("已创建 MinIO 桶: %s", self.bucket)
                return
            except Exception as exc:
                last_err = exc
                time.sleep(min(2 + attempt, 6))
        raise RuntimeError(f"无法连接 OpenIM MinIO: {last_err}") from last_err

    def _object_key(self, category: str, filename: str, task_id: Optional[str] = None) -> str:
        tid = task_id or uuid.uuid4().hex
        safe_name = filename.replace("\\", "_").replace("/", "_") or "file"
        return f"{self.prefix}{category}/{tid}/{safe_name}"

    def put_bytes(
        self,
        category: str,
        filename: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        task_id: Optional[str] = None,
    ) -> str:
        key = self._object_key(category, filename, task_id)
        self._client.put_object(
            self.bucket,
            key,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )
        return key

    def put_file(
        self,
        category: str,
        filename: str,
        filepath: str,
        content_type: str = "application/octet-stream",
        task_id: Optional[str] = None,
    ) -> str:
        key = self._object_key(category, filename, task_id)
        self._client.fput_object(
            self.bucket,
            key,
            filepath,
            content_type=content_type,
        )
        return key

    def remove(self, key: str) -> None:
        try:
            self._client.remove_object(self.bucket, key)
        except Exception as exc:
            logger.warning("删除 OpenIM 对象失败 %s: %s", key, exc)

    def cleanup_older_than(self, max_age_hours: float) -> int:
        if max_age_hours <= 0:
            max_age_hours = 24.0
        cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
        deleted = 0
        for obj in self._client.list_objects(
            self.bucket, prefix=self.prefix, recursive=True
        ):
            last_modified = obj.last_modified
            if last_modified.tzinfo is None:
                last_modified = last_modified.replace(tzinfo=timezone.utc)
            if last_modified < cutoff:
                self._client.remove_object(self.bucket, obj.object_name)
                deleted += 1
        return deleted
