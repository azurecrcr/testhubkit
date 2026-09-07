"""cm_projects 及建表入口。"""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from core.services.test_cases.mysql_db import get_connection

# 每个 gunicorn worker 进程内只跑一次建表/迁移，避免每次 API 都打 information_schema
_CM_TABLES_READY = False

_TABLES_SQL = [
    (
        "CREATE TABLE IF NOT EXISTS cm_projects ("
        " id CHAR(32) NOT NULL PRIMARY KEY,"
        " user_id CHAR(32) NOT NULL,"
        " name VARCHAR(200) NOT NULL,"
        " description VARCHAR(1000) NOT NULL DEFAULT '',"
        " team_id CHAR(32) NULL,"
        " created_at DATETIME NOT NULL,"
        " updated_at DATETIME NOT NULL,"
        " INDEX idx_cm_proj_user_updated (user_id, updated_at),"
        " INDEX idx_cm_proj_team (team_id)"
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    ),
    (
        "CREATE TABLE IF NOT EXISTS cm_suites ("
        " id CHAR(32) NOT NULL PRIMARY KEY,"
        " project_id CHAR(32) NOT NULL,"
        " parent_id CHAR(32) NULL,"
        " user_id CHAR(32) NOT NULL,"
        " name VARCHAR(200) NOT NULL,"
        " sort_order INT NOT NULL DEFAULT 0,"
        " created_at DATETIME NOT NULL,"
        " updated_at DATETIME NOT NULL,"
        " INDEX idx_cm_suite_project (project_id, sort_order),"
        " INDEX idx_cm_suite_parent (parent_id),"
        " INDEX idx_cm_suite_user (user_id)"
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    ),
    (
        "CREATE TABLE IF NOT EXISTS cm_test_cases ("
        " id CHAR(32) NOT NULL PRIMARY KEY,"
        " project_id CHAR(32) NOT NULL,"
        " suite_id CHAR(32) NULL,"
        " user_id CHAR(32) NOT NULL,"
        " title VARCHAR(500) NOT NULL,"
        " priority VARCHAR(8) NOT NULL DEFAULT 'P2',"
        " status VARCHAR(32) NOT NULL DEFAULT 'draft',"
        " precondition TEXT NULL,"
        " steps_json LONGTEXT NOT NULL,"
        " tags_json LONGTEXT NULL,"
        " source VARCHAR(32) NOT NULL DEFAULT 'manual',"
        " source_ref VARCHAR(128) NULL,"
        " req_ref VARCHAR(128) NULL,"
        " defect_ref VARCHAR(128) NULL,"
        " is_deleted TINYINT(1) NOT NULL DEFAULT 0,"
        " deleted_at DATETIME NULL,"
        " deleted_by CHAR(32) NULL,"
        " created_at DATETIME NOT NULL,"
        " updated_at DATETIME NOT NULL,"
        " INDEX idx_cm_case_user_updated (user_id, updated_at),"
        " INDEX idx_cm_case_project_suite (project_id, suite_id),"
        " INDEX idx_cm_case_priority (project_id, priority),"
        " INDEX idx_cm_case_status (project_id, status),"
        " INDEX idx_cm_case_project_deleted (project_id, is_deleted),"
        " INDEX idx_cm_case_trash_owner (project_id, is_deleted, deleted_by)"
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    ),
    (
        "CREATE TABLE IF NOT EXISTS cm_executions ("
        " id CHAR(32) NOT NULL PRIMARY KEY,"
        " case_id CHAR(32) NOT NULL,"
        " project_id CHAR(32) NOT NULL,"
        " user_id CHAR(32) NOT NULL,"
        " result VARCHAR(16) NOT NULL,"
        " comment VARCHAR(2000) NOT NULL DEFAULT '',"
        " executed_at DATETIME NOT NULL,"
        " INDEX idx_cm_exec_case_time (case_id, executed_at),"
        " INDEX idx_cm_exec_project (project_id, executed_at),"
        " INDEX idx_cm_exec_user (user_id)"
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    ),
]


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _new_id() -> str:
    return uuid.uuid4().hex


def ensure_cm_tables() -> None:
    global _CM_TABLES_READY
    if _CM_TABLES_READY:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for sql in _TABLES_SQL:
                cur.execute(sql)
    finally:
        conn.close()

    for migrator in (
        _ensure_case_soft_delete_columns,
        _ensure_case_deleted_by_column,
        _ensure_case_fields_json_column,
        _ensure_case_last_result_columns,
        _ensure_case_trash_expiry_index,
        _ensure_suite_schemas_table,
        _ensure_project_members,
        _ensure_project_invites_and_messages,
    ):
        mconn = get_connection()
        try:
            with mconn.cursor() as cur:
                migrator(cur)
        except Exception as exc:  # noqa: BLE001
            # 多 worker 并发建列/索引时可能撞 Duplicate；忽略后继续后续迁移
            msg = str(exc)
            if "Duplicate" in msg or "1060" in msg or "1061" in msg:
                continue
            raise
        finally:
            mconn.close()
    _CM_TABLES_READY = True


def _ensure_project_members(cur) -> None:
    from core.services.case_management.member_db import backfill_owner_members, ensure_member_tables

    ensure_member_tables(cur)
    backfill_owner_members(cur)


def _ensure_project_invites_and_messages(cur) -> None:
    from core.services.case_management.invite_db import ensure_invite_tables
    from core.services.case_management.message_db import ensure_message_tables

    ensure_invite_tables(cur)
    ensure_message_tables(cur)


def _ensure_case_last_result_columns(cur) -> None:
    """最近一次执行结果冗余字段（幂等）。"""
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cm_test_cases' "
        "AND COLUMN_NAME = 'last_result'"
    )
    row = cur.fetchone()
    if not row or not row.get("n"):
        cur.execute(
            "ALTER TABLE cm_test_cases "
            "ADD COLUMN last_result VARCHAR(16) NULL AFTER fields_json, "
            "ADD COLUMN last_executed_at DATETIME NULL AFTER last_result"
        )
        cur.execute(
            "UPDATE cm_test_cases c "
            "INNER JOIN ("
            "  SELECT e.case_id, e.result, e.executed_at FROM cm_executions e "
            "  INNER JOIN ("
            "    SELECT case_id, MAX(executed_at) AS mx FROM cm_executions GROUP BY case_id"
            "  ) t ON e.case_id = t.case_id AND e.executed_at = t.mx"
            ") x ON c.id = x.case_id "
            "SET c.last_result = x.result, c.last_executed_at = x.executed_at "
            "WHERE c.last_result IS NULL"
        )
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cm_test_cases' "
        "AND INDEX_NAME = 'idx_cm_case_last_result'"
    )
    idx = cur.fetchone()
    if not idx or not idx.get("n"):
        cur.execute(
            "CREATE INDEX idx_cm_case_last_result ON cm_test_cases (project_id, last_result)"
        )


def _ensure_case_fields_json_column(cur) -> None:
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cm_test_cases' "
        "AND COLUMN_NAME = 'fields_json'"
    )
    row = cur.fetchone()
    if not row or not row.get("n"):
        cur.execute(
            "ALTER TABLE cm_test_cases "
            "ADD COLUMN fields_json LONGTEXT NULL AFTER tags_json"
        )


def _ensure_suite_schemas_table(cur) -> None:
    cur.execute(
        "CREATE TABLE IF NOT EXISTS cm_suite_schemas ("
        " id CHAR(32) NOT NULL PRIMARY KEY,"
        " suite_id CHAR(32) NOT NULL,"
        " project_id CHAR(32) NOT NULL,"
        " user_id CHAR(32) NOT NULL,"
        " version INT NOT NULL DEFAULT 1,"
        " status VARCHAR(16) NOT NULL DEFAULT 'empty',"
        " columns_json LONGTEXT NOT NULL,"
        " source_kind VARCHAR(32) NULL,"
        " source_ref VARCHAR(256) NULL,"
        " locked_at DATETIME NULL,"
        " updated_at DATETIME NOT NULL,"
        " UNIQUE KEY uk_cm_suite_schema_suite (suite_id),"
        " INDEX idx_cm_suite_schema_project (project_id),"
        " INDEX idx_cm_suite_schema_user (user_id)"
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    )

def _ensure_case_soft_delete_columns(cur) -> None:
    """存量库补齐用例软删除字段（幂等）。"""
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cm_test_cases' "
        "AND COLUMN_NAME = 'is_deleted'"
    )
    row = cur.fetchone()
    if not row or not row.get("n"):
        cur.execute(
            "ALTER TABLE cm_test_cases "
            "ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER defect_ref, "
            "ADD COLUMN deleted_at DATETIME NULL AFTER is_deleted"
        )
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cm_test_cases' "
        "AND INDEX_NAME = 'idx_cm_case_project_deleted'"
    )
    idx = cur.fetchone()
    if not idx or not idx.get("n"):
        cur.execute(
            "CREATE INDEX idx_cm_case_project_deleted ON cm_test_cases (project_id, is_deleted)"
        )


def _ensure_case_deleted_by_column(cur) -> None:
    """个人回收站：记录移入回收站的操作人（幂等）。"""
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cm_test_cases' "
        "AND COLUMN_NAME = 'deleted_by'"
    )
    row = cur.fetchone()
    if not row or not row.get("n"):
        cur.execute(
            "ALTER TABLE cm_test_cases "
            "ADD COLUMN deleted_by CHAR(32) NULL AFTER deleted_at"
        )
        # 仅在刚补列时回填，避免每次 ensure 全表扫软删行
        cur.execute(
            "UPDATE cm_test_cases SET deleted_by = user_id "
            "WHERE is_deleted = 1 AND (deleted_by IS NULL OR deleted_by = '')"
        )
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cm_test_cases' "
        "AND INDEX_NAME = 'idx_cm_case_trash_owner'"
    )
    idx = cur.fetchone()
    if not idx or not idx.get("n"):
        cur.execute(
            "CREATE INDEX idx_cm_case_trash_owner "
            "ON cm_test_cases (project_id, is_deleted, deleted_by)"
        )


def _ensure_case_trash_expiry_index(cur) -> None:
    """回收站过期清理索引；缺失 deleted_at 仅在建索引时回填。"""
    cur.execute(
        "SELECT COUNT(*) AS n FROM information_schema.STATISTICS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cm_test_cases' "
        "AND INDEX_NAME = 'idx_cm_case_trash_expiry'"
    )
    idx = cur.fetchone()
    if not idx or not idx.get("n"):
        cur.execute(
            "UPDATE cm_test_cases SET deleted_at = updated_at "
            "WHERE is_deleted = 1 AND deleted_at IS NULL AND updated_at IS NOT NULL"
        )
        cur.execute(
            "CREATE INDEX idx_cm_case_trash_expiry ON cm_test_cases (is_deleted, deleted_at)"
        )


def list_projects(user_id: str) -> list[dict[str, Any]]:
    uid = str(user_id or "").strip()
    if not uid:
        return []
    ensure_cm_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT p.id, p.user_id, p.name, p.description, p.team_id, "
                "p.created_at, p.updated_at, "
                "COALESCE(m.role, CASE WHEN p.user_id = %s THEN 'owner' ELSE NULL END) AS my_role "
                "FROM cm_projects p "
                "LEFT JOIN cm_project_members m ON m.project_id = p.id AND m.user_id = %s "
                "WHERE m.user_id IS NOT NULL OR p.user_id = %s "
                "ORDER BY p.updated_at DESC",
                (uid, uid, uid),
            )
            rows = cur.fetchall() or []
        items = []
        for r in rows:
            item = _serialize_project(r)
            item["is_primary_owner"] = item.get("user_id") == uid
            items.append(item)
        return items
    finally:
        conn.close()


def get_project(project_id: str) -> Optional[dict[str, Any]]:
    pid = str(project_id or "").strip()
    if not pid:
        return None
    ensure_cm_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, user_id, name, description, team_id, created_at, updated_at "
                "FROM cm_projects WHERE id = %s LIMIT 1",
                (pid,),
            )
            row = cur.fetchone()
        return _serialize_project(row) if row else None
    finally:
        conn.close()


def create_project(user_id: str, *, name: str, description: str = "") -> dict[str, Any]:
    uid = str(user_id or "").strip()
    title = str(name or "").strip()
    if not uid:
        raise ValueError("请先登录")
    if not title:
        raise ValueError("项目名称不能为空")
    if len(title) > 200:
        raise ValueError("项目名称过长")
    ensure_cm_tables()
    now = _now()
    pid = _new_id()
    desc = str(description or "").strip()[:1000]
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO cm_projects (id, user_id, name, description, team_id, created_at, updated_at) "
                "VALUES (%s,%s,%s,%s,NULL,%s,%s)",
                (pid, uid, title, desc, now, now),
            )
    finally:
        conn.close()
    from core.services.case_management.member_db import ensure_primary_owner_member

    ensure_primary_owner_member(pid, uid)
    item = get_project(pid) or {
        "id": pid,
        "user_id": uid,
        "name": title,
        "description": desc,
        "team_id": None,
        "created_at": now,
        "updated_at": now,
    }
    item["my_role"] = "owner"
    item["is_primary_owner"] = True
    return item


def update_project(
    user_id: str,
    project_id: str,
    *,
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> dict[str, Any]:
    from core.services.case_management.access import assert_project_owner

    project = assert_project_owner(user_id, project_id)
    fields: list[str] = []
    values: list[Any] = []
    if name is not None:
        title = str(name).strip()
        if not title:
            raise ValueError("项目名称不能为空")
        if len(title) > 200:
            raise ValueError("项目名称过长")
        fields.append("name = %s")
        values.append(title)
    if description is not None:
        fields.append("description = %s")
        values.append(str(description).strip()[:1000])
    if not fields:
        return project
    now = _now()
    fields.append("updated_at = %s")
    values.append(now)
    values.append(project_id)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cm_projects SET " + ", ".join(fields) + " WHERE id = %s",
                tuple(values),
            )
    finally:
        conn.close()
    return get_project(project_id) or project


def delete_project(user_id: str, project_id: str, *, force: bool = False) -> dict[str, Any]:
    from core.services.case_management.access import assert_project_owner

    project = assert_project_owner(user_id, project_id)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_test_cases WHERE project_id = %s AND is_deleted = 0",
                (project_id,),
            )
            case_count = int((cur.fetchone() or {}).get("c") or 0)
            cur.execute(
                "SELECT COUNT(*) AS c FROM cm_suites WHERE project_id = %s",
                (project_id,),
            )
            suite_count = int((cur.fetchone() or {}).get("c") or 0)
            if (case_count or suite_count) and not force:
                raise ValueError(
                    "项目下仍有目录或用例，请先清空后再删，或传 force=true 强制删除"
                )
            cur.execute("DELETE FROM cm_executions WHERE project_id = %s", (project_id,))
            cur.execute("DELETE FROM cm_test_cases WHERE project_id = %s", (project_id,))
            cur.execute("DELETE FROM cm_suite_schemas WHERE project_id = %s", (project_id,))
            cur.execute("DELETE FROM cm_suites WHERE project_id = %s", (project_id,))
            cur.execute("DELETE FROM cm_project_members WHERE project_id = %s", (project_id,))
            cur.execute("DELETE FROM cm_projects WHERE id = %s", (project_id,))
    finally:
        conn.close()
    return {"deleted": True, "id": project["id"]}


def touch_project(project_id: str) -> None:
    pid = str(project_id or "").strip()
    if not pid:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cm_projects SET updated_at = %s WHERE id = %s",
                (_now(), pid),
            )
    finally:
        conn.close()


def _serialize_project(row: dict[str, Any]) -> dict[str, Any]:
    uid = str(row.get("user_id") or "")
    my_role = row.get("my_role")
    if my_role:
        my_role = str(my_role)
    return {
        "id": str(row.get("id") or ""),
        "user_id": uid,
        "name": str(row.get("name") or ""),
        "description": str(row.get("description") or ""),
        "team_id": row.get("team_id"),
        "created_at": str(row.get("created_at") or ""),
        "updated_at": str(row.get("updated_at") or ""),
        "my_role": my_role,
        "is_primary_owner": False,  # 由调用方按当前用户补全时可覆盖
    }
