"""
应用配置：对外保持 ``from core.config import UPLOADS_DIR, TOOLS`` 等用法不变。

子模块按职责拆分：路径、图片限制、工具注册表（含分组导航数据）。
"""

from core.config.database import (
    MYSQL_DATABASE,
    MYSQL_HOST,
    MYSQL_PASSWORD,
    MYSQL_PORT,
    MYSQL_USER,
)
from core.config.image_limits import (
    ALLOWED_IMAGE_EXTENSIONS,
    IMAGE_TOOL_REQUEST_MAX_RETRIES,
    IMAGE_TOOL_REQUEST_RETRY_DELAY_MS,
    IMAGE_TOOL_REQUEST_TIMEOUT_MS,
    IMAGE_TOOL_REQUEST_TIMEOUT_SEC,
    MAX_IMAGE_UPLOAD_BYTES,
    MAX_IMAGE_UPLOAD_MB,
)
from core.config.paths import BASE_DIR, UPLOADS_DIR, ensure_upload_dir
from core.config.tools_registry import (
    TOOL_CATEGORIES,
    TOOL_ROUTE_ALIASES,
    TOOLS,
    build_hf_nav_sections,
    filter_tools_for_viewer,
)

__all__ = [
    "ALLOWED_IMAGE_EXTENSIONS",
    "BASE_DIR",
    "MYSQL_DATABASE",
    "MYSQL_HOST",
    "MYSQL_PASSWORD",
    "MYSQL_PORT",
    "MYSQL_USER",
    "TOOL_CATEGORIES",
    "TOOL_ROUTE_ALIASES",
    "TOOLS",
    "build_hf_nav_sections",
    "filter_tools_for_viewer",
    "IMAGE_TOOL_REQUEST_MAX_RETRIES",
    "IMAGE_TOOL_REQUEST_RETRY_DELAY_MS",
    "IMAGE_TOOL_REQUEST_TIMEOUT_MS",
    "IMAGE_TOOL_REQUEST_TIMEOUT_SEC",
    "MAX_IMAGE_UPLOAD_BYTES",
    "MAX_IMAGE_UPLOAD_MB",
    "UPLOADS_DIR",
    "ensure_upload_dir",
]
