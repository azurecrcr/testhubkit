from __future__ import annotations

import json
import os
import time
from typing import Any, Dict, List, Optional

from core.config.paths import BASE_DIR
from core.services.test_cases.case_template_db import ensure_case_template_table, get_connection


def _now_str() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _load_seed_from_json() -> Optional[List[Dict[str, Any]]]:
    path = os.path.join(BASE_DIR, "scripts", "builtin_case_templates.json")
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        return None
    out: List[Dict[str, Any]] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        cols = item.get("columns")
        if not isinstance(cols, list) or not cols:
            continue
        out.append(
            {
                "id": str(item.get("id") or "").strip(),
                "name": str(item.get("name") or "").strip(),
                "badge": str(item.get("badge") or "").strip(),
                "badge_class": str(item.get("badge_class") or "").strip(),
                "hint": str(item.get("hint") or "").strip(),
                "columns": [str(c) for c in cols],
                "is_default": bool(item.get("is_default")),
                "sort_order": int(item.get("sort_order") or 0),
            }
        )
    return out or None


def _default_seed_entries() -> List[Dict[str, Any]]:
    from_json = _load_seed_from_json()
    if from_json:
        return from_json
    return [
        {
            "id": "metersphere",
            "name": "MeterSphere",
            "badge": "MS",
            "badge_class": "ms",
            "hint": "",
            "columns": [
                "用例名称",
                "所属模块",
                "标签",
                "前置条件",
                "步骤描述",
                "预期结果",
                "编辑模式",
                "备注",
                "用例等级",
            ],
            "is_default": True,
            "sort_order": 10,
        }
    ]


def _row_to_item(row: Dict[str, Any]) -> Dict[str, Any]:
    cols = row.get("columns")
    if isinstance(cols, str):
        try:
            cols = json.loads(cols)
        except json.JSONDecodeError:
            cols = []
    if not isinstance(cols, list):
        cols = []
    return {
        "id": row["id"],
        "name": row.get("name") or "",
        "badge": row.get("badge") or "",
        "badgeClass": row.get("badge_class") or "",
        "hint": row.get("hint") or "",
        "columns": [str(c) for c in cols],
        "isDefault": bool(row.get("is_default")),
        "sortOrder": int(row.get("sort_order") or 0),
    }


def _count_templates() -> int:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS c FROM test_case_templates")
            row = cur.fetchone() or {}
            return int(row.get("c") or 0)
    finally:
        conn.close()


def seed_default_templates_if_empty() -> None:
    if _count_templates() > 0:
        return
    entries = _default_seed_entries()
    now = _now_str()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for item in entries:
                if not item.get("id") or not item.get("name"):
                    continue
                cur.execute(
                    """
                    INSERT INTO test_case_templates
                        (id, name, badge, badge_class, hint, columns, is_default, sort_order, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        item["id"],
                        item["name"],
                        item.get("badge") or "",
                        item.get("badge_class") or "",
                        item.get("hint") or "",
                        json.dumps(item.get("columns") or [], ensure_ascii=False),
                        1 if item.get("is_default") else 0,
                        item.get("sort_order", 0),
                        now,
                        now,
                    ),
                )
    finally:
        conn.close()


def init_case_template_storage() -> None:
    ensure_case_template_table()
    seed_default_templates_if_empty()


def list_case_templates() -> List[Dict[str, Any]]:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, badge, badge_class, hint, columns, is_default, sort_order
                FROM test_case_templates
                ORDER BY sort_order ASC, id ASC
                """
            )
            rows = cur.fetchall() or []
            return [_row_to_item(r) for r in rows]
    finally:
        conn.close()


def get_case_template_by_id(template_id: str) -> Optional[Dict[str, Any]]:
    tid = str(template_id or "").strip()
    if not tid:
        return None
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, badge, badge_class, hint, columns, is_default, sort_order
                FROM test_case_templates
                WHERE id = %s
                LIMIT 1
                """,
                (tid,),
            )
            row = cur.fetchone()
            return _row_to_item(row) if row else None
    finally:
        conn.close()
