"""项目路径与上传目录。"""

from __future__ import annotations

import os

# core/config/paths.py → core/config → core → 项目根
_CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
_CORE_DIR = os.path.dirname(_CONFIG_DIR)
BASE_DIR = os.path.dirname(_CORE_DIR)

UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")


def ensure_upload_dir() -> None:
    os.makedirs(UPLOADS_DIR, exist_ok=True)
