# -*- coding: utf-8 -*-
"""工作台→CM 增量同步（只读源，禁止写回工作台）。"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from core.services.case_management.access import assert_project_editor
from core.services.case_management.schema_import import _load_workbench_table
from core.services.l5_bridge.schema_l5 import ensure_l5_tables
from core.services.test_cases.mysql_db import get_connection


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _new_id() -> str:
    return uuid.uuid4().hex


def _source_ref(lanhu_pid: str, lanhu_doc_id: str, lanhu_page_id: str) -> str:
    return "%s|%s|%s" % (
        str(lanhu_pid or "").strip(),
        str(lanhu_doc_id or "").strip(),
        str(lanhu_page_id or "").strip(),
    )


def diff_workbench_against_suite_l5(
    user_id: str,
    project_id: str,
    *,
    suite_id: str,
    lanhu_pid: str,
    lanhu_doc_id: str,
    lanhu_page_id: str,
) -> dict[str, Any]:
    assert_project_editor(user_id, project_id)
    ensure_l5_tables()
    # 只读加载工作台表（复用现有内部加载，不改工作台）
    columns, rows, _src = _load_workbench_table(
        user_id,
        lanhu_pid=lanhu_pid,
        lanhu_doc_id=lanhu_doc_id,
        lanhu_page_id=lanhu_page_id,
    )
    wb_rows = rows if isinstance(rows, list) else []
    # 标题列：优先匹配常见列名
    title_idx = 0
    for i, c in enumerate(columns or []):
        name = str(c or "")
        if "标题" in name or "名称" in name or name.lower() in ("title", "name"):
            title_idx = i
            break
    src = _source_ref(lanhu_pid, lanhu_doc_id, lanhu_page_id)
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, title, source_ref FROM cm_test_cases "
                "WHERE project_id=%s AND suite_id=%s AND is_deleted=0 AND source='workbench'",
                (project_id, suite_id),
            )
            existing = cur.fetchall() or []
    finally:
        conn.close()
    by_title = {}
    for r in existing:
        t = str(r.get("title") or "").strip()
        by_title.setdefault(t, []).append(r)
    add, update, unchanged = [], [], []
    for row in wb_rows:
        title = ""
        if isinstance(row, (list, tuple)) and len(row) > title_idx:
            title = str(row[title_idx] or "").strip()
        elif isinstance(row, dict):
            title = str(row.get("title") or row.get("用例名称") or row.get("name") or "").strip()
        if not title:
            continue
        hits = by_title.get(title) or []
        if not hits:
            add.append({"title": title})
        else:
            update.append({"title": title, "case_id": str(hits[0].get("id") or "")})
            by_title[title] = hits[1:]
    for t, left in by_title.items():
        for r in left:
            unchanged.append({"title": t, "case_id": str(r.get("id") or ""), "note": "source_only"})
    return {
        "source_ref": src,
        "suite_id": suite_id,
        "add": add,
        "update": update,
        "unchanged": unchanged,
        "counts": {"add": len(add), "update": len(update), "source_only": len(unchanged)},
    }


def apply_workbench_sync_l5(
    user_id: str,
    project_id: str,
    *,
    suite_id: str,
    lanhu_pid: str,
    lanhu_doc_id: str,
    lanhu_page_id: str,
    strategy: str = "upsert",
) -> dict[str, Any]:
    """执行同步：对 add 建用例；update 仅 touch updated_at/title 保持简单。不写回工作台。"""
    from core.services.case_management import case_db

    assert_project_editor(user_id, project_id)
    preview = diff_workbench_against_suite_l5(
        user_id,
        project_id,
        suite_id=suite_id,
        lanhu_pid=lanhu_pid,
        lanhu_doc_id=lanhu_doc_id,
        lanhu_page_id=lanhu_page_id,
    )
    src = preview["source_ref"]
    created, updated = 0, 0
    for row in preview.get("add") or []:
        created_case = case_db.create_case(
            user_id,
            project_id,
            {
                "suite_id": suite_id,
                "title": row.get("title"),
                "status": "draft",
                "priority": "P2",
                "source": "workbench",
                "source_ref": src[:128],
                "fields": {"review_badge": "review_unknown"},
            },
        )
        # L5 列：独立 UPDATE，避免改 create_case 签名
        try:
            cid = str((created_case or {}).get("id") or "")
            if cid:
                conn_u = get_connection()
                try:
                    with conn_u.cursor() as cur_u:
                        cur_u.execute(
                            "UPDATE cm_test_cases SET review_badge=%s WHERE id=%s",
                            ("review_unknown", cid),
                        )
                finally:
                    conn_u.close()
        except Exception:  # noqa: BLE001
            pass
        created += 1
    if strategy == "upsert":
        for row in preview.get("update") or []:
            cid = str(row.get("case_id") or "")
            if not cid:
                continue
            try:
                case_db.update_case(user_id, cid, {"title": row.get("title")})
                updated += 1
            except Exception:  # noqa: BLE001
                pass
    batch_id = _new_id()
    report = {
        "created": created,
        "updated": updated,
        "preview_counts": preview.get("counts"),
        "strategy": strategy,
    }
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO cm_workbench_sync_batches_l5 "
                "(id, project_id, suite_id, source_ref, report_json, actor_id, created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s)",
                (
                    batch_id,
                    project_id,
                    suite_id,
                    src[:256],
                    json.dumps(report, ensure_ascii=False),
                    user_id,
                    _now(),
                ),
            )
    finally:
        conn.close()
    try:
        from core.services.l5_bridge.activity_l5 import write_audit_l5
        from core.services.l5_bridge.notify_l5 import notify_sync_done_l5

        write_audit_l5(
            project_id,
            user_id,
            "sync.apply",
            ref_type="sync_batch",
            ref_id=batch_id,
            payload=report,
        )
        notify_sync_done_l5(
            user_id, project_id, created=created, updated=updated, batch_id=batch_id
        )
    except Exception:  # noqa: BLE001
        pass
    return {"batch_id": batch_id, **report}


def list_sync_batches_l5(user_id: str, project_id: str, *, limit: int = 30) -> list[dict[str, Any]]:
    assert_project_editor(user_id, project_id)
    ensure_l5_tables()
    lim = max(1, min(int(limit or 30), 100))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, project_id, suite_id, source_ref, report_json, actor_id, created_at "
                "FROM cm_workbench_sync_batches_l5 WHERE project_id=%s "
                "ORDER BY created_at DESC LIMIT %s",
                (project_id, lim),
            )
            rows = cur.fetchall() or []
        out = []
        for r in rows:
            report = {}
            try:
                report = json.loads(r.get("report_json") or "{}")
            except Exception:  # noqa: BLE001
                report = {}
            out.append(
                {
                    "id": str(r.get("id") or ""),
                    "suite_id": str(r.get("suite_id") or ""),
                    "source_ref": str(r.get("source_ref") or ""),
                    "actor_id": str(r.get("actor_id") or ""),
                    "created_at": str(r.get("created_at") or ""),
                    "report": report,
                }
            )
        return out
    finally:
        conn.close()


def detect_broken_source_links_l5(user_id: str, project_id: str, *, limit: int = 100) -> dict[str, Any]:
    """
    新方法：只读检测 CM 中 source=workbench 的用例，source_ref 格式异常或源页不可读时标记。
    不改工作台、不写回源。
    """
    from core.services.case_management.access import assert_project_viewer

    assert_project_viewer(user_id, project_id)
    ensure_l5_tables()
    lim = max(1, min(int(limit or 100), 300))
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, title, source_ref, suite_id FROM cm_test_cases "
                "WHERE project_id=%s AND is_deleted=0 AND source='workbench' "
                "ORDER BY updated_at DESC LIMIT %s",
                (project_id, lim),
            )
            rows = cur.fetchall() or []
    finally:
        conn.close()

    broken = []
    ok = 0
    for r in rows:
        cid = str(r.get("id") or "")
        title = str(r.get("title") or "")
        ref = str(r.get("source_ref") or "").strip()
        parts = ref.split("|") if ref else []
        reason = ""
        if len(parts) < 3 or not parts[0]:
            reason = "source_ref_invalid"
        else:
            try:
                _load_workbench_table(
                    user_id,
                    lanhu_pid=parts[0],
                    lanhu_doc_id=parts[1] if len(parts) > 1 else "",
                    lanhu_page_id=parts[2] if len(parts) > 2 else "",
                )
                ok += 1
            except Exception as exc:  # noqa: BLE001
                reason = "source_unreadable:" + str(exc)[:120]
        if reason:
            broken.append(
                {
                    "case_id": cid,
                    "title": title,
                    "source_ref": ref,
                    "suite_id": str(r.get("suite_id") or ""),
                    "reason": reason,
                }
            )
    return {
        "checked": len(rows),
        "ok": ok,
        "broken": broken,
        "broken_count": len(broken),
        "no_workbench_writeback": True,
    }
