"""用例生成采纳率：批次创建、行级反馈、统计。"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

from core.services.test_cases.adoption_db import ensure_adoption_tables
from core.services.test_cases.mysql_db import get_connection

VALID_ACTIONS = frozenset({"accept", "edit_accept", "reject", "export"})
TC_STATS_DISPLAY_DAYS = 30
TC_STATS_RETENTION_DAYS = 90
TC_STATS_PAGE_SIZE = 15


def _now() -> datetime:
    return datetime.now()


def _parse_created_at(value: Any) -> datetime:
    if not value:
        return _now()
    if isinstance(value, datetime):
        return value
    s = str(value).strip().replace("Z", "").replace("z", "")
    if "T" in s:
        s = s.replace("T", " ", 1)
    try:
        return datetime.strptime(s[:19], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return _now()


def _new_id() -> str:
    return uuid.uuid4().hex


def create_batch(
    *,
    user_id: str | None,
    session_key: str | None,
    mode: str,
    ai_mode: str,
    rag_used: bool,
    row_count: int,
) -> dict[str, Any]:
    ensure_adoption_tables()
    batch_id = _new_id()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_generation_batches
                    (id, user_id, session_key, mode, ai_mode, rag_used, row_count, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    batch_id,
                    user_id,
                    session_key,
                    mode if mode in ("list", "mindmap") else "list",
                    ai_mode if ai_mode in ("preset", "custom") else "preset",
                    1 if rag_used else 0,
                    max(0, int(row_count)),
                    _now(),
                ),
            )
    finally:
        conn.close()
    return {
        "id": batch_id,
        "row_count": row_count,
        "created_at": _now().isoformat(timespec="seconds"),
    }


def upsert_feedback(batch_id: str, row_index: int, action: str) -> dict[str, Any]:
    if action not in VALID_ACTIONS:
        raise ValueError(f"无效 action: {action}")
    ensure_adoption_tables()
    feedback_id = _new_id()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, row_count, closed_at FROM tc_generation_batches WHERE id = %s",
                (batch_id,),
            )
            batch = cur.fetchone()
            if not batch:
                raise LookupError("批次不存在")
            if batch.get("closed_at"):
                raise ValueError("批次已关闭，无法继续反馈")
            row_index = int(row_index)
            if row_index < 0 or row_index >= int(batch["row_count"]):
                raise ValueError("行索引超出批次范围")
            cur.execute(
                """
                INSERT INTO tc_generation_feedback (id, batch_id, row_index, action, created_at)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE action = VALUES(action), created_at = VALUES(created_at)
                """,
                (feedback_id, batch_id, row_index, action, _now()),
            )
    finally:
        conn.close()
    return get_batch_stats(batch_id)


def batch_accept_all(batch_id: str) -> dict[str, Any]:
    ensure_adoption_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT row_count, closed_at FROM tc_generation_batches WHERE id = %s",
                (batch_id,),
            )
            batch = cur.fetchone()
            if not batch:
                raise LookupError("批次不存在")
            if batch.get("closed_at"):
                raise ValueError("批次已关闭")
            row_count = int(batch["row_count"])
            now = _now()
            for i in range(row_count):
                cur.execute(
                    """
                    INSERT INTO tc_generation_feedback (id, batch_id, row_index, action, created_at)
                    VALUES (%s, %s, %s, 'accept', %s)
                    ON DUPLICATE KEY UPDATE action = 'accept', created_at = VALUES(created_at)
                    """,
                    (_new_id(), batch_id, i, now),
                )
    finally:
        conn.close()
    return get_batch_stats(batch_id)


def batch_reject_all(batch_id: str) -> dict[str, Any]:
    ensure_adoption_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT row_count, closed_at FROM tc_generation_batches WHERE id = %s",
                (batch_id,),
            )
            batch = cur.fetchone()
            if not batch:
                raise LookupError("批次不存在")
            if batch.get("closed_at"):
                raise ValueError("批次已关闭")
            row_count = int(batch["row_count"])
            now = _now()
            for i in range(row_count):
                cur.execute(
                    """
                    INSERT INTO tc_generation_feedback (id, batch_id, row_index, action, created_at)
                    VALUES (%s, %s, %s, 'reject', %s)
                    ON DUPLICATE KEY UPDATE action = 'reject', created_at = VALUES(created_at)
                    """,
                    (_new_id(), batch_id, i, now),
                )
    finally:
        conn.close()
    return get_batch_stats(batch_id)


def close_batch(batch_id: str) -> None:
    ensure_adoption_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE tc_generation_batches SET closed_at = %s WHERE id = %s AND closed_at IS NULL",
                (_now(), batch_id),
            )
    finally:
        conn.close()


def get_batch_stats(batch_id: str) -> dict[str, Any]:
    ensure_adoption_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, user_id, mode, ai_mode, rag_used, row_count, created_at, closed_at
                FROM tc_generation_batches WHERE id = %s
                """,
                (batch_id,),
            )
            batch = cur.fetchone()
            if not batch:
                raise LookupError("批次不存在")
            cur.execute(
                """
                SELECT row_index, action FROM tc_generation_feedback
                WHERE batch_id = %s ORDER BY row_index
                """,
                (batch_id,),
            )
            feedback_rows = cur.fetchall() or []
    finally:
        conn.close()

    row_count = int(batch["row_count"])
    feedback_map = {int(r["row_index"]): r["action"] for r in feedback_rows}
    accepted = sum(
        1 for a in feedback_map.values() if a in ("accept", "edit_accept", "export")
    )
    rejected = sum(1 for a in feedback_map.values() if a == "reject")
    processed = len(feedback_map)
    rate = round(accepted / row_count * 100, 1) if row_count else 0.0

    return {
        "batch_id": batch["id"],
        "mode": batch["mode"],
        "ai_mode": batch["ai_mode"],
        "rag_used": bool(batch["rag_used"]),
        "row_count": row_count,
        "accepted": accepted,
        "rejected": rejected,
        "processed": processed,
        "adoption_rate": rate,
        "created_at": batch["created_at"].isoformat(timespec="seconds")
        if batch.get("created_at")
        else None,
        "closed_at": batch["closed_at"].isoformat(timespec="seconds")
        if batch.get("closed_at")
        else None,
        "feedback": feedback_map,
    }


def import_user_batch_summaries(user_id: str, batches: list[dict[str, Any]]) -> dict[str, int]:
    """将本机 localStorage 中的统计批次摘要导入账号（保留行数、采纳数与时间）。"""
    ensure_adoption_tables()
    cutoff = _now() - timedelta(days=TC_STATS_RETENTION_DAYS)
    imported = 0
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for raw in (batches or [])[:100]:
                if not isinstance(raw, dict):
                    continue
                created = _parse_created_at(raw.get("created_at"))
                if created < cutoff:
                    continue
                row_count = max(0, int(raw.get("row_count") or 0))
                if row_count <= 0:
                    continue
                accepted = max(0, min(int(raw.get("accepted") or 0), row_count))
                batch_id = _new_id()
                mode = raw.get("mode") if raw.get("mode") in ("list", "mindmap") else "list"
                ai_mode = raw.get("ai_mode") if raw.get("ai_mode") in ("preset", "custom") else "preset"
                rag_used = 1 if raw.get("rag_used") else 0
                cur.execute(
                    """
                    INSERT INTO tc_generation_batches
                        (id, user_id, session_key, mode, ai_mode, rag_used, row_count, created_at, closed_at)
                    VALUES (%s, %s, NULL, %s, %s, %s, %s, %s, %s)
                    """,
                    (batch_id, user_id, mode, ai_mode, rag_used, row_count, created, _now()),
                )
                for i in range(accepted):
                    cur.execute(
                        """
                        INSERT INTO tc_generation_feedback (id, batch_id, row_index, action, created_at)
                        VALUES (%s, %s, %s, 'accept', %s)
                        """,
                        (_new_id(), batch_id, i, created),
                    )
                imported += 1
        conn.commit()
    finally:
        conn.close()
    return {"imported": imported}


def purge_old_generation_batches(retention_days: int = TC_STATS_RETENTION_DAYS) -> int:
    """删除超过保留期的生成批次（反馈表级联删除）。"""
    ensure_adoption_tables()
    days = max(1, min(int(retention_days), 365))
    cutoff = _now() - timedelta(days=days)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM tc_generation_batches WHERE created_at < %s",
                (cutoff,),
            )
            deleted = int(cur.rowcount or 0)
        conn.commit()
        return deleted
    finally:
        conn.close()


def list_user_stats(
    user_id: str,
    days: int = TC_STATS_DISPLAY_DAYS,
    *,
    page: int = 1,
    page_size: int = TC_STATS_PAGE_SIZE,
) -> dict[str, Any]:
    ensure_adoption_tables()
    purge_old_generation_batches(TC_STATS_RETENTION_DAYS)
    since = _now() - timedelta(days=max(1, min(days, TC_STATS_DISPLAY_DAYS)))
    page = max(1, int(page))
    page_size = max(5, min(int(page_size), 50))
    offset = (page - 1) * page_size
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS batch_count,
                       COALESCE(SUM(b.row_count), 0) AS total_rows,
                       COALESCE(SUM(acc.accepted), 0) AS total_accepted
                FROM tc_generation_batches b
                LEFT JOIN (
                    SELECT batch_id,
                           SUM(CASE WHEN action IN ('accept','edit_accept','export') THEN 1 ELSE 0 END) AS accepted
                    FROM tc_generation_feedback
                    GROUP BY batch_id
                ) acc ON acc.batch_id = b.id
                WHERE b.user_id = %s AND b.created_at >= %s
                """,
                (user_id, since),
            )
            agg = cur.fetchone() or {}
            batch_count = int(agg.get("batch_count") or 0)
            total_rows = int(agg.get("total_rows") or 0)
            total_accepted = int(agg.get("total_accepted") or 0)
            total_pages = max(1, (batch_count + page_size - 1) // page_size) if batch_count else 1
            if page > total_pages:
                page = total_pages
                offset = (page - 1) * page_size

            cur.execute(
                """
                SELECT b.id, b.mode, b.ai_mode, b.rag_used, b.row_count, b.created_at,
                       SUM(CASE WHEN f.action IN ('accept','edit_accept','export') THEN 1 ELSE 0 END) AS accepted
                FROM tc_generation_batches b
                LEFT JOIN tc_generation_feedback f ON f.batch_id = b.id
                WHERE b.user_id = %s AND b.created_at >= %s
                GROUP BY b.id
                ORDER BY b.created_at DESC
                LIMIT %s OFFSET %s
                """,
                (user_id, since, page_size, offset),
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()

    batches = []
    for r in rows:
        rc = int(r["row_count"] or 0)
        acc = int(r["accepted"] or 0)
        batches.append(
            {
                "batch_id": r["id"],
                "mode": r["mode"],
                "ai_mode": r["ai_mode"],
                "rag_used": bool(r["rag_used"]),
                "row_count": rc,
                "accepted": acc,
                "adoption_rate": round(acc / rc * 100, 1) if rc else 0.0,
                "created_at": r["created_at"].isoformat(timespec="seconds")
                if r.get("created_at")
                else None,
            }
        )
    overall = round(total_accepted / total_rows * 100, 1) if total_rows else 0.0
    return {
        "days": days,
        "batch_count": batch_count,
        "total_rows": total_rows,
        "total_accepted": total_accepted,
        "overall_adoption_rate": overall,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "batches": batches,
    }
