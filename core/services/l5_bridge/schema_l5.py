# -*- coding: utf-8 -*-
"""L5 表结构 ensure：只增不改旧表语义；缺陷无附件表。"""

from __future__ import annotations

from core.services.test_cases.mysql_db import get_connection

# 每个 worker 进程只跑一次，避免每次 API 打 information_schema / CREATE TABLE
_L5_TABLES_READY = False


def _col_exists(cur, table: str, column: str) -> bool:
    cur.execute(
        "SELECT COUNT(1) AS c FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s AND COLUMN_NAME = %s",
        (table, column),
    )
    row = cur.fetchone() or {}
    return int(row.get("c") or 0) > 0


def _add_col(cur, table: str, column: str, ddl: str) -> None:
    if _col_exists(cur, table, column):
        return
    cur.execute("ALTER TABLE %s ADD COLUMN %s" % (table, ddl))


def ensure_l5_tables(cur=None) -> None:
    global _L5_TABLES_READY
    if _L5_TABLES_READY and cur is None:
        return
    own = cur is None
    conn = None
    if own:
        conn = get_connection()
        cur = conn.cursor()
    try:
        # ---- column extensions ----
        _add_col(cur, "cm_executions", "defect_id", "defect_id CHAR(32) NULL AFTER comment")
        _add_col(cur, "cm_executions", "run_id", "run_id CHAR(32) NULL AFTER defect_id")
        _add_col(cur, "dm_defects", "source_execution_id", "source_execution_id CHAR(32) NULL")
        _add_col(cur, "dm_defects", "repro_steps", "repro_steps TEXT NULL")
        _add_col(cur, "dm_defects", "expected_result", "expected_result TEXT NULL")
        _add_col(cur, "dm_defects", "actual_result", "actual_result TEXT NULL")
        _add_col(cur, "dm_defects", "environment", "environment VARCHAR(200) NULL")
        _add_col(cur, "dm_defects", "module", "module VARCHAR(200) NULL")
        _add_col(cur, "dm_defects", "find_phase", "find_phase VARCHAR(64) NULL")
        _add_col(cur, "dm_defects", "defect_type", "defect_type VARCHAR(64) NULL")
        _add_col(cur, "dm_defects", "priority", "priority VARCHAR(16) NULL")
        _add_col(cur, "dm_defects", "evidence_url", "evidence_url VARCHAR(1000) NULL")
        _add_col(
            cur,
            "cm_test_cases",
            "review_badge",
            "review_badge VARCHAR(32) NULL AFTER defect_ref",
        )

        cur.execute(
            "CREATE TABLE IF NOT EXISTS cm_case_regression_flags_l5 ("
            " case_id CHAR(32) NOT NULL PRIMARY KEY,"
            " project_id CHAR(32) NOT NULL,"
            " defect_id CHAR(32) NOT NULL,"
            " status VARCHAR(16) NOT NULL DEFAULT 'pending',"
            " updated_at DATETIME NOT NULL,"
            " INDEX idx_cm_reg_proj_status (project_id, status)"
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS cm_test_plans_l5 ("
            " id CHAR(32) NOT NULL PRIMARY KEY,"
            " project_id CHAR(32) NOT NULL,"
            " name VARCHAR(200) NOT NULL,"
            " description TEXT NULL,"
            " owner_id CHAR(32) NOT NULL,"
            " status VARCHAR(16) NOT NULL DEFAULT 'draft',"
            " start_at DATETIME NULL,"
            " end_at DATETIME NULL,"
            " created_at DATETIME NOT NULL,"
            " updated_at DATETIME NOT NULL,"
            " INDEX idx_cm_plan_proj (project_id, status)"
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS cm_test_runs_l5 ("
            " id CHAR(32) NOT NULL PRIMARY KEY,"
            " plan_id CHAR(32) NOT NULL,"
            " project_id CHAR(32) NOT NULL,"
            " name VARCHAR(200) NOT NULL,"
            " build_no VARCHAR(100) NULL,"
            " environment VARCHAR(200) NULL,"
            " status VARCHAR(16) NOT NULL DEFAULT 'not_started',"
            " created_at DATETIME NOT NULL,"
            " updated_at DATETIME NOT NULL,"
            " INDEX idx_cm_run_plan (plan_id),"
            " INDEX idx_cm_run_proj (project_id)"
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        )
        # plans/runs 表创建后再加列（兼容旧库）
        _add_col(
            cur,
            "cm_test_plans_l5",
            "release_status",
            "release_status VARCHAR(16) NOT NULL DEFAULT 'open'",
        )
        _add_col(
            cur,
            "cm_test_runs_l5",
            "run_type",
            "run_type VARCHAR(16) NOT NULL DEFAULT 'custom'",
        )

        cur.execute(
            "CREATE TABLE IF NOT EXISTS cm_test_run_items_l5 ("
            " id CHAR(32) NOT NULL PRIMARY KEY,"
            " run_id CHAR(32) NOT NULL,"
            " case_id CHAR(32) NOT NULL,"
            " assignee_id CHAR(32) NULL,"
            " result VARCHAR(16) NULL,"
            " comment VARCHAR(2000) NULL,"
            " execution_id CHAR(32) NULL,"
            " updated_at DATETIME NOT NULL,"
            " UNIQUE KEY uk_cm_run_case (run_id, case_id),"
            " INDEX idx_cm_run_item_case (case_id)"
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS cm_case_revisions_l5 ("
            " id CHAR(32) NOT NULL PRIMARY KEY,"
            " case_id CHAR(32) NOT NULL,"
            " rev_no INT NOT NULL,"
            " snapshot_json MEDIUMTEXT NOT NULL,"
            " editor_id CHAR(32) NOT NULL,"
            " created_at DATETIME NOT NULL,"
            " UNIQUE KEY uk_cm_case_rev (case_id, rev_no),"
            " INDEX idx_cm_rev_case (case_id)"
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        )
        # 基线功能已下线：清理表（若存在）
        cur.execute("DROP TABLE IF EXISTS cm_baseline_cases_l5")
        cur.execute("DROP TABLE IF EXISTS cm_baselines_l5")
        cur.execute(
            "CREATE TABLE IF NOT EXISTS dm_defect_activity_l5 ("
            " id CHAR(32) NOT NULL PRIMARY KEY,"
            " defect_id CHAR(32) NOT NULL,"
            " actor_id CHAR(32) NOT NULL,"
            " action VARCHAR(64) NOT NULL,"
            " payload_json TEXT NULL,"
            " created_at DATETIME NOT NULL,"
            " INDEX idx_dm_act_defect (defect_id, created_at)"
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS dm_defect_watchers_l5 ("
            " defect_id CHAR(32) NOT NULL,"
            " user_id CHAR(32) NOT NULL,"
            " created_at DATETIME NOT NULL,"
            " PRIMARY KEY (defect_id, user_id)"
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS dm_defect_relations_l5 ("
            " from_id CHAR(32) NOT NULL,"
            " to_id CHAR(32) NOT NULL,"
            " rel_type VARCHAR(16) NOT NULL,"
            " created_at DATETIME NOT NULL,"
            " PRIMARY KEY (from_id, to_id, rel_type)"
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS cm_project_audit_l5 ("
            " id CHAR(32) NOT NULL PRIMARY KEY,"
            " project_id CHAR(32) NOT NULL,"
            " actor_id CHAR(32) NOT NULL,"
            " action VARCHAR(64) NOT NULL,"
            " ref_type VARCHAR(32) NULL,"
            " ref_id CHAR(32) NULL,"
            " payload_json TEXT NULL,"
            " created_at DATETIME NOT NULL,"
            " INDEX idx_cm_audit_proj (project_id, created_at)"
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS cm_workbench_sync_batches_l5 ("
            " id CHAR(32) NOT NULL PRIMARY KEY,"
            " project_id CHAR(32) NOT NULL,"
            " suite_id CHAR(32) NOT NULL,"
            " source_ref VARCHAR(256) NOT NULL,"
            " report_json MEDIUMTEXT NULL,"
            " actor_id CHAR(32) NOT NULL,"
            " created_at DATETIME NOT NULL,"
            " INDEX idx_cm_sync_proj (project_id, created_at)"
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        )
        cur.execute(
            "CREATE TABLE IF NOT EXISTS cm_project_l5_settings ("
            " project_id CHAR(32) NOT NULL PRIMARY KEY,"
            " settings_json MEDIUMTEXT NULL,"
            " updated_at DATETIME NOT NULL"
            ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        )
        if own and conn is not None:
            conn.commit()
        if own:
            _L5_TABLES_READY = True
    finally:
        if own and conn is not None:
            conn.close()
