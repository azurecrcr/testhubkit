"""用例导出报告：校验、去重、列映射统计。"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from core.services.test_cases.case_template_service import get_case_template_by_id
from core.services.test_cases.export_report_db import ensure_export_report_table
from core.services.test_cases.mysql_db import get_connection

EXPORT_REQUIRED_FIELDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("用例名称", ("用例名称", "用例名", "标题", "name", "title")),
    ("步骤描述", ("步骤描述", "步骤", "测试步骤", "操作步骤", "steps")),
    ("预期结果", ("预期结果", "预期", "expected")),
)


def _now_iso() -> str:
    return datetime.now().replace(microsecond=0).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex


def _find_column(columns: list[str], keywords: tuple[str, ...]) -> int | None:
    for i, col in enumerate(columns):
        text = str(col or "").strip().lower()
        for kw in keywords:
            if kw.lower() in text:
                return i
    return None


def _find_exact_column(columns: list[str], name: str) -> int | None:
    target = str(name or "").strip().lower()
    for i, col in enumerate(columns):
        if str(col or "").strip().lower() == target:
            return i
    return None


def _resolve_profile(profile_key: str) -> dict[str, Any]:
    tpl = get_case_template_by_id(profile_key)
    if tpl and isinstance(tpl.get("columns"), list) and tpl["columns"]:
        return tpl
    fallback = get_case_template_by_id("metersphere")
    if fallback:
        return fallback
    return {
        "id": profile_key or "metersphere",
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
    }


def build_export_report(
    *,
    profile_key: str,
    columns: list[str],
    rows: list[list[str]],
) -> dict[str, Any]:
    profile = _resolve_profile(profile_key)
    profile_columns = [str(c) for c in profile.get("columns") or []]
    source_columns = [str(c) for c in columns or []]
    source_rows = [
        [str(cell) if cell is not None else "" for cell in row]
        for row in rows
        if isinstance(row, list)
    ]

    col_map: dict[int, int | None] = {}
    for pi, pcol in enumerate(profile_columns):
        exact = _find_exact_column(source_columns, pcol)
        col_map[pi] = exact

    required_specs: list[tuple[str, int]] = []
    for label, keywords in EXPORT_REQUIRED_FIELDS:
        idx = None
        for pi, pcol in enumerate(profile_columns):
            if pcol == label or _find_column((pcol,), keywords) == 0:
                idx = pi
                break
        if idx is None:
            for pi, pcol in enumerate(profile_columns):
                if label in str(pcol):
                    idx = pi
                    break
        if idx is None:
            fuzzy = _find_column(profile_columns, keywords)
            idx = fuzzy
        if idx is not None:
            required_specs.append((label, idx))

    name_idx = None
    for pi, pcol in enumerate(profile_columns):
        if "用例名称" in pcol or "标题" in pcol:
            name_idx = pi
            break
    if name_idx is None:
        name_idx = 0

    skipped: list[dict[str, Any]] = []
    duplicates: list[dict[str, Any]] = []
    exported_rows: list[list[str]] = []
    seen_names: set[str] = set()

    for ri, row in enumerate(source_rows):
        mapped = []
        for pi in range(len(profile_columns)):
            si = col_map.get(pi)
            val = ""
            if si is not None and si < len(row):
                val = str(row[si] or "").strip()
            mapped.append(val)

        missing = [label for label, idx in required_specs if not str(mapped[idx] or "").strip()]
        if missing:
            skipped.append({"row_index": ri, "reason": "缺少" + missing[0]})
            continue

        norm_name = str(mapped[name_idx] or "").strip().lower()
        if norm_name in seen_names:
            duplicates.append({"row_index": ri, "reason": "用例名称重复"})
            continue
        seen_names.add(norm_name)
        exported_rows.append(mapped)

    report = {
        "exported_at": _now_iso(),
        "profile": str(profile.get("id") or profile_key or "metersphere"),
        "total_rows": len(source_rows),
        "exported_rows": len(exported_rows),
        "skipped_count": len(skipped),
        "duplicate_count": len(duplicates),
        "skipped": skipped,
        "duplicates": duplicates,
    }
    return {
        "report": report,
        "export_columns": profile_columns,
        "export_rows": exported_rows,
    }


def save_export_report(user_id: str | None, report: dict[str, Any]) -> str:
    ensure_export_report_table()
    report_id = _new_id()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_export_reports
                    (id, user_id, batch_id, profile_key, summary_json, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    report_id,
                    user_id,
                    str(report.get("batch_id") or "")[:64] or None,
                    str(report.get("profile") or "metersphere")[:64],
                    json.dumps(report, ensure_ascii=False),
                    datetime.now(),
                ),
            )
    finally:
        conn.close()
    return report_id
