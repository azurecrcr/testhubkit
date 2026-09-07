"""多媒体处理结果写入 OpenIM 对象存储。"""

from __future__ import annotations

import uuid
from typing import Optional

from core.services.storage import get_openim_storage, is_openim_storage_enabled


def persist_media_bytes(
    category: str,
    filename: str,
    data: bytes,
    content_type: str,
    task_id: Optional[str] = None,
) -> Optional[str]:
    if not is_openim_storage_enabled():
        raise RuntimeError("OpenIM 对象存储未配置，无法保存多媒体文件")
    tid = task_id or uuid.uuid4().hex
    storage = get_openim_storage()
    return storage.put_bytes(category, filename, data, content_type, task_id=tid)
