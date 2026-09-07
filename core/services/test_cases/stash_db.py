"""测试用例数据库连接（暂存已删除，仅保留 get_connection 供 user_lanhu_config_db 等使用）"""

from __future__ import annotations

from core.services.test_cases.mysql_db import get_connection, ping_mysql

__all__ = ["get_connection", "ping_mysql"]
