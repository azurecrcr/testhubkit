"""缺陷管理表结构 ensure。"""

from __future__ import annotations

from core.services.test_cases.mysql_db import get_connection

_DEFECTS_SQL = (
    "CREATE TABLE IF NOT EXISTS dm_defects ("
    " id CHAR(32) NOT NULL PRIMARY KEY,"
    " project_id CHAR(32) NOT NULL,"
    " number INT NOT NULL,"
    " title VARCHAR(200) NOT NULL,"
    " description TEXT NOT NULL,"
    " status VARCHAR(16) NOT NULL DEFAULT 'open',"
    " severity VARCHAR(16) NOT NULL DEFAULT 'normal',"
    " reporter_id CHAR(32) NOT NULL,"
    " assignee_id CHAR(32) NULL,"
    " created_at DATETIME NOT NULL,"
    " updated_at DATETIME NOT NULL,"
    " UNIQUE KEY uk_dm_defect_project_number (project_id, number),"
    " INDEX idx_dm_defect_project_status_updated (project_id, status, updated_at),"
    " INDEX idx_dm_defect_project_assignee (project_id, assignee_id)"
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
)

_COMMENTS_SQL = (
    "CREATE TABLE IF NOT EXISTS dm_defect_comments ("
    " id CHAR(32) NOT NULL PRIMARY KEY,"
    " defect_id CHAR(32) NOT NULL,"
    " user_id CHAR(32) NOT NULL,"
    " body TEXT NOT NULL,"
    " created_at DATETIME NOT NULL,"
    " INDEX idx_dm_comment_defect_time (defect_id, created_at)"
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
)

_LINKS_SQL = (
    "CREATE TABLE IF NOT EXISTS dm_defect_case_links ("
    " defect_id CHAR(32) NOT NULL,"
    " case_id CHAR(32) NOT NULL,"
    " created_at DATETIME NOT NULL,"
    " PRIMARY KEY (defect_id, case_id),"
    " INDEX idx_dm_link_case (case_id)"
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
)

_COUNTERS_SQL = (
    "CREATE TABLE IF NOT EXISTS dm_project_counters ("
    " project_id CHAR(32) NOT NULL PRIMARY KEY,"
    " next_number INT NOT NULL DEFAULT 1"
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
)

_HANDLERS_SQL = (
    "CREATE TABLE IF NOT EXISTS dm_defect_handlers ("
    " defect_id CHAR(32) NOT NULL,"
    " user_id CHAR(32) NOT NULL,"
    " created_at DATETIME NOT NULL,"
    " PRIMARY KEY (defect_id, user_id),"
    " INDEX idx_dm_handler_user (user_id)"
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
)


def ensure_dm_tables(cur=None) -> None:
    own = cur is None
    conn = None
    if own:
        conn = get_connection()
        cur = conn.cursor()
    try:
        cur.execute(_DEFECTS_SQL)
        cur.execute(_COMMENTS_SQL)
        cur.execute(_LINKS_SQL)
        cur.execute(_COUNTERS_SQL)
        cur.execute(_HANDLERS_SQL)
        # 兼容旧单指派人：回填到处理人表（幂等）
        cur.execute(
            "INSERT IGNORE INTO dm_defect_handlers (defect_id, user_id, created_at) "
            "SELECT id, assignee_id, COALESCE(created_at, updated_at) "
            "FROM dm_defects "
            "WHERE assignee_id IS NOT NULL AND assignee_id != ''"
        )
    finally:
        if own:
            cur.close()
            conn.close()
