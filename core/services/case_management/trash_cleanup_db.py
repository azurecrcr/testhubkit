"""回收站过期自动清理（独立于手动 purge / delete_case，供定时任务调用）。"""

from __future__ import annotations

import os
import time
from typing import Any

from core.services.case_management.project_db import ensure_cm_tables
from core.services.test_cases.mysql_db import get_connection

_LOCK_NAME = "cm_trash_cleanup"


def retention_days() -> int:
    try:
        days = int(os.environ.get("CM_TRASH_RETENTION_DAYS", "30"))
    except ValueError:
        days = 30
    return max(1, min(days, 365))


def cleanup_batch_size() -> int:
    try:
        size = int(os.environ.get("CM_TRASH_CLEANUP_BATCH_SIZE", "200"))
    except ValueError:
        size = 200
    return max(1, min(size, 1000))


def cleanup_max_batches() -> int:
    try:
        n = int(os.environ.get("CM_TRASH_CLEANUP_MAX_BATCHES", "50"))
    except ValueError:
        n = 50
    return max(1, min(n, 500))


def cleanup_batch_sleep_ms() -> int:
    try:
        ms = int(os.environ.get("CM_TRASH_CLEANUP_BATCH_SLEEP_MS", "50"))
    except ValueError:
        ms = 50
    return max(0, min(ms, 5000))


def cleanup_max_runtime_sec() -> int:
    try:
        sec = int(os.environ.get("CM_TRASH_CLEANUP_MAX_RUNTIME_SEC", "300"))
    except ValueError:
        sec = 300
    return max(30, min(sec, 3600))


def list_expired_trash_cases(*, limit: int | None = None) -> list[dict[str, Any]]:
    """查出已过期软删用例（仅 id 等轻量字段）。deleted_at 为空的不纳入。"""
    ensure_cm_tables()
    lim = max(1, min(int(limit or cleanup_batch_size()), 1000))
    days = retention_days()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, user_id, project_id, suite_id, deleted_at "
                "FROM cm_test_cases "
                "WHERE is_deleted = 1 "
                "AND deleted_at IS NOT NULL "
                "AND deleted_at < (NOW() - INTERVAL %s DAY) "
                "ORDER BY deleted_at ASC, id ASC "
                "LIMIT %s",
                (days, lim),
            )
            rows = cur.fetchall() or []
        return [
            {
                "id": str(r.get("id") or ""),
                "user_id": str(r.get("user_id") or ""),
                "project_id": str(r.get("project_id") or ""),
                "suite_id": str(r.get("suite_id") or "") or None,
                "deleted_at": str(r.get("deleted_at") or "") or None,
            }
            for r in rows
            if r.get("id")
        ]
    finally:
        conn.close()


def hard_delete_trashed_case_system(case_id: str) -> str:
    """
    系统硬删单条软删用例（含执行记录）。
    返回: deleted | skipped | missing
    - 仅删除 is_deleted=1 的行，避免误伤活跃用例
    - 独立事务，不改动既有 delete_case / purge_cases
    """
    cid = str(case_id or "").strip()
    if not cid:
        return "missing"

    conn = get_connection()
    # get_connection 默认 autocommit=True，此处显式关事务以保证 exec+case 同事务
    prev = conn.get_autocommit()
    conn.autocommit(False)
    suite_id = None
    project_id = None
    user_id = None
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, suite_id, project_id, user_id FROM cm_test_cases "
                "WHERE id = %s AND is_deleted = 1 LIMIT 1 FOR UPDATE",
                (cid,),
            )
            row = cur.fetchone()
            if not row:
                conn.rollback()
                # 区分：不存在 vs 已恢复为活跃
                cur.execute("SELECT id, is_deleted FROM cm_test_cases WHERE id = %s LIMIT 1", (cid,))
                exist = cur.fetchone()
                if not exist:
                    return "missing"
                return "skipped"

            suite_id = row.get("suite_id")
            project_id = str(row.get("project_id") or "") or None
            user_id = str(row.get("user_id") or "") or None
            cur.execute("DELETE FROM cm_executions WHERE case_id = %s", (cid,))
            cur.execute(
                "DELETE FROM cm_test_cases WHERE id = %s AND is_deleted = 1",
                (cid,),
            )
            if cur.rowcount == 0:
                conn.rollback()
                return "skipped"
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:  # noqa: BLE001
            pass
        raise
    finally:
        try:
            conn.autocommit(prev)
        except Exception:  # noqa: BLE001
            pass
        conn.close()

    # schema 重置放在事务外，失败不影响已删除成功
    if suite_id and project_id and user_id:
        try:
            from core.services.case_management.case_ops_db import _reset_schema_keep_trash

            _reset_schema_keep_trash(user_id, project_id, str(suite_id))
        except Exception:  # noqa: BLE001
            pass
    return "deleted"


def purge_expired_trash_batch(*, batch_size: int | None = None) -> dict[str, Any]:
    """处理一批过期软删用例。"""
    rows = list_expired_trash_cases(limit=batch_size)
    deleted = 0
    skipped = 0
    missing = 0
    errors: list[str] = []
    for row in rows:
        cid = row.get("id") or ""
        try:
            status = hard_delete_trashed_case_system(cid)
            if status == "deleted":
                deleted += 1
            elif status == "skipped":
                skipped += 1
            else:
                missing += 1
        except Exception as exc:  # noqa: BLE001
            errors.append("%s: %s" % (cid[:8], exc))
            if len(errors) >= 20:
                break
    return {
        "scanned": len(rows),
        "deleted": deleted,
        "skipped": skipped,
        "missing": missing,
        "errors": errors,
        "retention_days": retention_days(),
    }


def try_acquire_cleanup_lock(conn) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT GET_LOCK(%s, 0) AS got", (_LOCK_NAME,))
        row = cur.fetchone() or {}
        return int(row.get("got") or 0) == 1


def release_cleanup_lock(conn) -> None:
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT RELEASE_LOCK(%s) AS rel", (_LOCK_NAME,))
    except Exception:  # noqa: BLE001
        pass


def purge_all_expired_trash(
    *,
    max_batches: int | None = None,
    max_runtime_sec: int | None = None,
) -> dict[str, Any]:
    """
    全站清理入口：顾问锁防多 worker 重入，分批 + 时限。
    拿不到锁时返回 lock_skipped=True。
    """
    ensure_cm_tables()
    batches_cap = max_batches if max_batches is not None else cleanup_max_batches()
    runtime_cap = max_runtime_sec if max_runtime_sec is not None else cleanup_max_runtime_sec()
    sleep_ms = cleanup_batch_sleep_ms()
    started = time.time()

    lock_conn = get_connection()
    try:
        if not try_acquire_cleanup_lock(lock_conn):
            return {
                "lock_skipped": True,
                "deleted": 0,
                "skipped": 0,
                "missing": 0,
                "errors": [],
                "batches": 0,
                "retention_days": retention_days(),
                "elapsed_sec": 0,
            }

        total = {
            "lock_skipped": False,
            "deleted": 0,
            "skipped": 0,
            "missing": 0,
            "errors": [],
            "batches": 0,
            "retention_days": retention_days(),
        }
        for _ in range(max(1, batches_cap)):
            if time.time() - started >= runtime_cap:
                total["stopped_by"] = "max_runtime"
                break
            stats = purge_expired_trash_batch()
            total["batches"] += 1
            total["deleted"] += int(stats.get("deleted") or 0)
            total["skipped"] += int(stats.get("skipped") or 0)
            total["missing"] += int(stats.get("missing") or 0)
            errs = stats.get("errors") or []
            if errs:
                total["errors"].extend(errs[: max(0, 20 - len(total["errors"]))])
            if int(stats.get("scanned") or 0) == 0:
                total["stopped_by"] = "done"
                break
            # 连续错误过多提前停，避免打满库
            if len(total["errors"]) >= 20:
                total["stopped_by"] = "too_many_errors"
                break
            if sleep_ms > 0:
                time.sleep(sleep_ms / 1000.0)
        else:
            total["stopped_by"] = "max_batches"

        total["elapsed_sec"] = round(time.time() - started, 2)
        return total
    finally:
        release_cleanup_lock(lock_conn)
        lock_conn.close()
