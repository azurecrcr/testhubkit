"""用例管理（独立模块，与用例工作台隔离）。"""

from __future__ import annotations

from core.services.case_management.project_db import ensure_cm_tables


__all__ = ["ensure_cm_tables"]
