"""
认证/安全审计日志超期清理（独立模块）。

只删除早于留存下限的行；不修改登录写入、发码限流等既有路径。
覆盖表：hub_login_log、hub_auth_send_log、hub_desktop_audit_log。
"""

from __future__ import annotations

import time
from typing import Any

from core.config.auth_security_log_retention import (
    LOCK_NAME,
    cleanup_batch_size,
    cleanup_batch_sleep_ms,
    cleanup_max_batches,
    cleanup_max_runtime_sec,
    retention_days,
)
from core.services.test_cases.mysql_db import get_connection

# 仅清理这些审计表；不含 hub_user_activity_daily 等统计表
_PURGE_TABLES = (
    "hub_login_log",
    "hub_auth_send_log",
    "hub_desktop_audit_log",
)


def try_acquire_retention_lock(conn) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT GET_LOCK(%s, 0) AS got", (LOCK_NAME,))
        row = cur.fetchone() or {}
        return int(row.get("got") or 0) == 1


def release_retention_lock(conn) -> None:
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT RELEASE_LOCK(%s) AS rel", (LOCK_NAME,))
    except Exception:  # noqa: BLE001
        pass


def _table_exists(cur, table: str) -> bool:
    cur.execute(
        "SELECT COUNT(*) AS c FROM information_schema.tables "
        "WHERE table_schema = DATABASE() AND table_name = %s",
        (table,),
    )
    row = cur.fetchone() or {}
    return int(row.get("c") or 0) > 0


def _purge_table_batch(cur, table: str, days: int, limit: int) -> int:
    """删除单表一批超期行；返回本批删除行数。"""
    # 表名白名单，禁止拼接外部输入
    if table not in _PURGE_TABLES:
        return 0
    cur.execute(
        f"DELETE FROM `{table}` "
        f"WHERE created_at < (NOW() - INTERVAL %s DAY) "
        f"ORDER BY created_at ASC "
        f"LIMIT %s",
        (days, limit),
    )
    return int(cur.rowcount or 0)


def purge_expired_auth_security_logs(
    *,
    max_batches: int | None = None,
    max_runtime_sec: int | None = None,
) -> dict[str, Any]:
    """
    全站安全日志超期清理入口。
    拿不到锁时返回 lock_skipped=True。
    """
    days = retention_days()
    batches_cap = max_batches if max_batches is not None else cleanup_max_batches()
    runtime_cap = max_runtime_sec if max_runtime_sec is not None else cleanup_max_runtime_sec()
    sleep_ms = cleanup_batch_sleep_ms()
    batch_size = cleanup_batch_size()
    started = time.time()

    deleted_per_table: dict[str, int] = {t: 0 for t in _PURGE_TABLES}
    skipped_tables: list[str] = []
    total_batches = 0
    stopped_by = "done"

    lock_conn = get_connection()
    try:
        if not try_acquire_retention_lock(lock_conn):
            return {
                "lock_skipped": True,
                "retention_days": days,
                "deleted": 0,
                "deleted_per_table": deleted_per_table,
                "batches": 0,
                "elapsed_sec": 0,
                "skipped_tables": [],
            }

        work_conn = get_connection()
        try:
            with work_conn.cursor() as cur:
                existing = []
                for table in _PURGE_TABLES:
                    if _table_exists(cur, table):
                        existing.append(table)
                    else:
                        skipped_tables.append(table)

            for _ in range(max(1, batches_cap)):
                if time.time() - started >= runtime_cap:
                    stopped_by = "max_runtime"
                    break

                batch_deleted = 0
                with work_conn.cursor() as cur:
                    for table in existing:
                        n = _purge_table_batch(cur, table, days, batch_size)
                        deleted_per_table[table] = deleted_per_table.get(table, 0) + n
                        batch_deleted += n
                    work_conn.commit()

                total_batches += 1
                if batch_deleted == 0:
                    stopped_by = "done"
                    break
                if sleep_ms > 0:
                    time.sleep(sleep_ms / 1000.0)
            else:
                stopped_by = "max_batches"
        finally:
            work_conn.close()

        deleted_total = sum(deleted_per_table.values())
        return {
            "lock_skipped": False,
            "retention_days": days,
            "deleted": deleted_total,
            "deleted_per_table": deleted_per_table,
            "batches": total_batches,
            "stopped_by": stopped_by,
            "elapsed_sec": round(time.time() - started, 2),
            "skipped_tables": skipped_tables,
        }
    finally:
        release_retention_lock(lock_conn)
        lock_conn.close()
