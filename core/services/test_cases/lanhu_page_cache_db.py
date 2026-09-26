"""蓝湖需求树：按用户缓存单页需求文本与字数。"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from core.services.test_cases.mysql_db import get_connection

_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS tc_lanhu_page_content_cache (
    user_id CHAR(32) NOT NULL,
    doc_id VARCHAR(64) NOT NULL,
    page_id VARCHAR(64) NOT NULL,
    page_name VARCHAR(200) NULL,
    lanhu_url VARCHAR(2048) NOT NULL DEFAULT '',
    content_text MEDIUMTEXT NOT NULL,
    content_chars INT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (user_id, doc_id, page_id),
    INDEX idx_tc_lanhu_page_cache_user_doc (user_id, doc_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


def ensure_lanhu_page_cache_table() -> None:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(_TABLE_SQL)
    finally:
        conn.close()


def upsert_page_cache(
    *,
    user_id: str,
    doc_id: str,
    page_id: str,
    page_name: str | None,
    lanhu_url: str,
    content_text: str,
    content_chars: int,
) -> None:
    ensure_lanhu_page_cache_table()
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_lanhu_page_content_cache
                    (user_id, doc_id, page_id, page_name, lanhu_url,
                     content_text, content_chars, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    page_name = VALUES(page_name),
                    lanhu_url = VALUES(lanhu_url),
                    content_text = VALUES(content_text),
                    content_chars = VALUES(content_chars),
                    updated_at = VALUES(updated_at)
                """,
                (
                    user_id,
                    doc_id,
                    page_id,
                    (page_name or "")[:200] or None,
                    (lanhu_url or "")[:2048],
                    content_text or "",
                    int(content_chars or 0),
                    now,
                ),
            )
    finally:
        conn.close()


def list_page_cache_for_doc(user_id: str, doc_id: str) -> list[dict[str, Any]]:
    ensure_lanhu_page_cache_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT page_id, page_name, content_text, content_chars, updated_at
                FROM tc_lanhu_page_content_cache
                WHERE user_id = %s AND doc_id = %s
                ORDER BY updated_at DESC
                """,
                (user_id, doc_id),
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()
    out: list[dict[str, Any]] = []
    for row in rows:
        out.append(
            {
                "page_id": row.get("page_id") or "",
                "page_name": row.get("page_name") or "",
                "content_text": row.get("content_text") or "",
                "content_chars": int(row.get("content_chars") or 0),
                "updated_at": str(row.get("updated_at") or ""),
            }
        )
    return out

def sql_exclude_pages_bound_to_other_doc(table_alias: str = "c") -> str:
    """排除 page 在缓存中已绑定其它需求文档的脏数据行。"""
    t = table_alias
    return (
        f" AND ({t}.lanhu_page_id = '' OR NOT EXISTS ("
        f" SELECT 1 FROM tc_lanhu_page_content_cache p"
        f" WHERE p.user_id = {t}.user_id AND p.page_id = {t}.lanhu_page_id"
        f" AND p.doc_id != {t}.lanhu_doc_id"
        f"))"
    )


def _other_doc_page_has_saved_cases(user_id: str, page_id: str, current_doc_id: str) -> bool:
    """其它文档下该页是否已有非空用例；有则视为真实跨文档冲突。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM tc_requirement_cases "
                "WHERE user_id = %s AND lanhu_page_id = %s AND lanhu_doc_id != %s "
                "AND row_count > 0 LIMIT 1",
                (user_id, page_id, current_doc_id),
            )
            if cur.fetchone():
                return True
            # 表可能尚未建：忽略并按无冲突处理
    except Exception:
        return False
    finally:
        try:
            conn.close()
        except Exception:
            pass
    return False


def _drop_stale_page_cache_other_docs(user_id: str, page_id: str, current_doc_id: str) -> int:
    """清掉同 page 绑在其它 doc 上的过期缓存（无用例冲突时）。"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM tc_lanhu_page_content_cache "
                "WHERE user_id = %s AND page_id = %s AND doc_id != %s",
                (user_id, page_id, current_doc_id),
            )
            return int(cur.rowcount or 0)
    finally:
        conn.close()



def _migrate_other_doc_page_cases_to_current_doc(
    user_id: str,
    page_id: str,
    current_doc_id: str,
    lanhu_pid: str = "",
) -> int:
    """把同 page 落在其它文档上的用例迁到当前文档（生成落库专用）。"""
    uid = str(user_id or "").strip()
    pid_page = str(page_id or "").strip()
    doc_id = str(current_doc_id or "").strip()
    pid = str(lanhu_pid or "").strip()
    if not uid or not pid_page or not doc_id:
        return 0
    moved = 0
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, lanhu_pid, lanhu_doc_id, row_count, updated_at "
                "FROM tc_requirement_cases "
                "WHERE user_id = %s AND lanhu_page_id = %s AND lanhu_doc_id != %s",
                (uid, pid_page, doc_id),
            )
            others = cur.fetchall() or []
            if not others:
                return 0
            if pid:
                cur.execute(
                    "SELECT id, row_count FROM tc_requirement_cases "
                    "WHERE user_id = %s AND lanhu_page_id = %s AND lanhu_doc_id = %s "
                    "AND lanhu_pid = %s LIMIT 1",
                    (uid, pid_page, doc_id, pid),
                )
            else:
                cur.execute(
                    "SELECT id, row_count FROM tc_requirement_cases "
                    "WHERE user_id = %s AND lanhu_page_id = %s AND lanhu_doc_id = %s LIMIT 1",
                    (uid, pid_page, doc_id),
                )
            current = cur.fetchone()
            for row in others:
                other_id = row.get("id")
                if not other_id:
                    continue
                if current:
                    cur_count = int(current.get("row_count") or 0)
                    other_count = int(row.get("row_count") or 0)
                    if other_count > cur_count:
                        # 先删当前文档旧行，再改 doc_id，避免唯一键冲突
                        cur.execute(
                            "DELETE FROM tc_requirement_cases WHERE id = %s",
                            (current.get("id"),),
                        )
                        cur.execute(
                            "UPDATE tc_requirement_cases SET "
                            "lanhu_doc_id = %s, "
                            "lanhu_pid = IF(%s <> '', %s, lanhu_pid), "
                            "updated_at = UTC_TIMESTAMP() WHERE id = %s",
                            (doc_id, pid, pid, other_id),
                        )
                        current = {"id": other_id, "row_count": other_count}
                    else:
                        cur.execute(
                            "DELETE FROM tc_requirement_cases WHERE id = %s",
                            (other_id,),
                        )
                else:
                    cur.execute(
                        "UPDATE tc_requirement_cases SET "
                        "lanhu_doc_id = %s, "
                        "lanhu_pid = IF(%s <> '', %s, lanhu_pid), "
                        "updated_at = UTC_TIMESTAMP() WHERE id = %s",
                        (doc_id, pid, pid, other_id),
                    )
                    current = {
                        "id": other_id,
                        "row_count": int(row.get("row_count") or 0),
                    }
                moved += 1
    except Exception:
        return 0
    finally:
        try:
            conn.close()
        except Exception:
            pass
    return moved


def prepare_page_doc_binding_for_generation_save(
    user_id: str,
    lanhu_doc_id: str,
    lanhu_page_id: str,
    lanhu_pid: str = "",
) -> None:
    """生成落库专用：清脏缓存，并把同页其它文档用例迁到当前文档。
    不改变手动编辑路径的严格跨文档拒绝逻辑。
    """
    uid = str(user_id or "").strip()
    doc_id = str(lanhu_doc_id or "").strip()
    page_id = str(lanhu_page_id or "").strip()
    if not uid or not doc_id or not page_id:
        return
    ensure_lanhu_page_cache_table()
    _drop_stale_page_cache_other_docs(uid, page_id, doc_id)
    _migrate_other_doc_page_cases_to_current_doc(
        uid, page_id, doc_id, lanhu_pid=lanhu_pid
    )
    _drop_stale_page_cache_other_docs(uid, page_id, doc_id)


def assert_page_belongs_to_requirement_doc(
    user_id: str,
    lanhu_doc_id: str,
    lanhu_page_id: str,
) -> None:
    """保存前校验：真实跨文档冲突仍拒绝；仅缓存脏绑定时自动清理后放行。"""
    uid = str(user_id or "").strip()
    doc_id = str(lanhu_doc_id or "").strip()
    page_id = str(lanhu_page_id or "").strip()
    if not uid or not doc_id or not page_id:
        return
    ensure_lanhu_page_cache_table()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM tc_lanhu_page_content_cache "
                "WHERE user_id = %s AND page_id = %s AND doc_id != %s LIMIT 1",
                (uid, page_id, doc_id),
            )
            conflict = cur.fetchone()
    finally:
        conn.close()
    if not conflict:
        return
    if _other_doc_page_has_saved_cases(uid, page_id, doc_id):
        raise ValueError("该需求页属于其他蓝湖需求文档，请在正确的项目/文档下编辑用例")
    # 仅缓存脏数据：清掉其它 doc 绑定，允许当前文档保存
    _drop_stale_page_cache_other_docs(uid, page_id, doc_id)
