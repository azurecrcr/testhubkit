"""投稿建议图片附件表（独立于 system_feedback 写入逻辑）。"""

from __future__ import annotations

import threading
from typing import Any

from core.services.feedback.feedback_db import get_connection

_IMAGES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS system_feedback_images (
    id CHAR(32) NOT NULL PRIMARY KEY,
    feedback_id CHAR(32) NOT NULL,
    file_name VARCHAR(255) NOT NULL DEFAULT '',
    mime_type VARCHAR(80) NOT NULL DEFAULT '',
    size_bytes INT NOT NULL DEFAULT 0,
    storage_path VARCHAR(500) NOT NULL,
    sort_order TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    INDEX idx_feedback_images_fid (feedback_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""

_ready = False
_lock = threading.Lock()


def ensure_feedback_images_table() -> None:
    global _ready
    if _ready:
        return
    with _lock:
        if _ready:
            return
        # 先确保主表存在（外键依赖）
        from core.services.feedback.feedback_db import ensure_feedback_table

        ensure_feedback_table()
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(_IMAGES_TABLE_SQL)
            _ready = True
        finally:
            conn.close()


def insert_feedback_image(row: dict[str, Any]) -> None:
    ensure_feedback_images_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO system_feedback_images
                    (id, feedback_id, file_name, mime_type, size_bytes, storage_path, sort_order, created_at)
                VALUES
                    (%(id)s, %(feedback_id)s, %(file_name)s, %(mime_type)s, %(size_bytes)s,
                     %(storage_path)s, %(sort_order)s, %(created_at)s)
                """,
                row,
            )
    finally:
        conn.close()


def list_images_by_feedback_ids(feedback_ids: list[str]) -> list[dict[str, Any]]:
    """按投稿 ID 批量查图片元数据（不含二进制）。"""
    ids = [str(x).strip() for x in (feedback_ids or []) if str(x).strip()]
    if not ids:
        return []
    ensure_feedback_images_table()
    placeholders = ", ".join(["%s"] * len(ids))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT id, feedback_id, file_name, mime_type, size_bytes, storage_path, sort_order, created_at
                FROM system_feedback_images
                WHERE feedback_id IN ({placeholders})
                ORDER BY feedback_id ASC, sort_order ASC, created_at ASC
                """,
                tuple(ids),
            )
            rows = cur.fetchall() or []
            return [dict(r) for r in rows]
    finally:
        conn.close()


def get_feedback_image_by_id(image_id: str) -> dict[str, Any] | None:
    image_id = str(image_id or "").strip()
    if not image_id:
        return None
    ensure_feedback_images_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, feedback_id, file_name, mime_type, size_bytes, storage_path, sort_order, created_at
                FROM system_feedback_images
                WHERE id = %s
                LIMIT 1
                """,
                (image_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()
