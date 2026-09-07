# -*- coding: utf-8 -*-
"""用例修订（新表）。"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from core.services.case_management.access import assert_project_editor
from core.services.case_management.case_db import get_case, update_case
from core.services.l5_bridge.schema_l5 import ensure_l5_tables
from core.services.test_cases.mysql_db import get_connection


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def _new_id() -> str:
    return uuid.uuid4().hex


def save_case_revision_l5(user_id: str, case_id: str) -> dict[str, Any]:
    case = get_case(case_id)
    if not case:
        raise ValueError("用例不存在")
    assert_project_editor(user_id, str(case.get("project_id") or ""))
    ensure_l5_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COALESCE(MAX(rev_no), 0) AS m FROM cm_case_revisions_l5 WHERE case_id=%s",
                (case_id,),
            )
            row = cur.fetchone() or {}
            rev = int(row.get("m") or 0) + 1
            snap = json.dumps(case, ensure_ascii=False, default=str)
            cur.execute(
                "INSERT INTO cm_case_revisions_l5 "
                "(id, case_id, rev_no, snapshot_json, editor_id, created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s)",
                (_new_id(), case_id, rev, snap, user_id, _now()),
            )
    finally:
        conn.close()
    return {"case_id": case_id, "rev_no": rev}


def update_case_l5(user_id: str, case_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """新包装：调用现有 update_case 后写修订。"""
    item = update_case(user_id, case_id, data)
    try:
        save_case_revision_l5(user_id, case_id)
    except Exception:  # noqa: BLE001
        pass
    return item
