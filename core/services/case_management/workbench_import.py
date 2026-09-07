"""从用例工作台只读导入到用例库（不写回工作台表）。"""

from __future__ import annotations

import json
import re
from typing import Any

from core.services.case_management.case_db import bulk_insert_cases
from core.services.case_management.suite_db import assert_suite_in_project
from core.services.test_cases.requirement_case_db import (
    get_requirement_case,
    list_requirement_cases_for_user,
)


def list_workbench_sources(user_id: str, *, limit: int = 200) -> list[dict[str, Any]]:
    """只读列出当前用户工作台已保存的需求用例表，并附带蓝湖文档名便于分组展示。"""
    items = list_requirement_cases_for_user(user_id, limit=limit)
    name_by_doc_id: dict[str, str] = {}
    name_by_pid: dict[str, str] = {}
    name_by_key: dict[str, str] = {}
    saved_docs: list[dict[str, str]] = []
    try:
        from core.services.test_cases.lanhu_requirement_service import _parse_lanhu_url
        from core.services.test_cases.user_lanhu_docs_db import (
            extract_lanhu_doc_key,
            list_user_lanhu_docs,
        )

        for doc in list_user_lanhu_docs(user_id):
            title = str(doc.get("name") or "").strip()
            # list_user_lanhu_docs 序列化字段为 url / lanhuDocKey（非 lanhu_url）
            url = str(doc.get("url") or doc.get("lanhu_url") or "").strip()
            if not title:
                continue
            saved_docs.append({"name": title, "url": url})
            key = str(doc.get("lanhuDocKey") or doc.get("lanhu_doc_key") or "").strip()
            if not key:
                key = extract_lanhu_doc_key(url)
            if key:
                name_by_key[key] = title
                if key.startswith("doc:"):
                    name_by_doc_id[key[4:]] = title
            try:
                params = _parse_lanhu_url(url) if url else {}
            except ValueError:
                params = {}
            doc_id = str(params.get("doc_id") or "").strip()
            pid = str(params.get("project_id") or "").strip()
            if doc_id:
                name_by_doc_id[doc_id] = title
            if pid:
                # 同一 pid 多文档时保留最新（list 已按 updated_at DESC）
                name_by_pid.setdefault(pid, title)
    except Exception:  # noqa: BLE001
        pass

    def _resolve_doc_name(doc_id: str, pid: str, url: str) -> str:
        if doc_id and doc_id in name_by_doc_id:
            return name_by_doc_id[doc_id]
        if url:
            try:
                from core.services.test_cases.user_lanhu_docs_db import extract_lanhu_doc_key

                hit = name_by_key.get(extract_lanhu_doc_key(url)) or ""
                if hit:
                    return hit
            except Exception:  # noqa: BLE001
                pass
            for d in saved_docs:
                u = d["url"]
                if doc_id and doc_id in u:
                    return d["name"]
                if pid and pid in u and (not doc_id or doc_id in u):
                    return d["name"]
        if pid and pid in name_by_pid:
            return name_by_pid[pid]
        if doc_id:
            return "文档 " + doc_id[:8]
        return "未命名需求"

    out: list[dict[str, Any]] = []
    for it in items:
        row = dict(it)
        doc_id = str(row.get("lanhu_doc_id") or "").strip()
        pid = str(row.get("lanhu_pid") or "").strip()
        url = str(row.get("lanhu_url") or "").strip()
        row["doc_name"] = _resolve_doc_name(doc_id, pid, url)
        out.append(row)
    return out


def _col_index(columns: list[Any], *names: str) -> int | None:
    normalized = [str(c or "").strip() for c in (columns or [])]
    for name in names:
        if name in normalized:
            return normalized.index(name)
    return None


def _cell(row: list[Any], idx: int | None) -> str:
    if idx is None or idx < 0 or idx >= len(row):
        return ""
    return str(row[idx] or "").strip()


def _split_steps(text: str) -> list[str]:
    raw = str(text or "").replace("\\n", "\n").strip()
    if not raw:
        return []
    parts = re.split(r"(?:^|\n)\s*(?:\[\d+\]|\d+[\.、．)])\s*", raw)
    out = [p.strip() for p in parts if p and p.strip()]
    return out or [raw]


def import_from_workbench(
    user_id: str,
    project_id: str,
    *,
    lanhu_pid: str,
    lanhu_doc_id: str,
    lanhu_page_id: str,
    suite_id: str,
) -> dict[str, Any]:
    """只读导入工作台用例到指定目录（suite_id 必填）。"""
    target = assert_suite_in_project(user_id, project_id, suite_id)
    target_suite_id = str(target["id"])

    src = get_requirement_case(
        user_id,
        lanhu_pid=str(lanhu_pid or ""),
        lanhu_doc_id=str(lanhu_doc_id or ""),
        lanhu_page_id=str(lanhu_page_id or ""),
    )
    if not src:
        raise ValueError("未找到工作台用例数据")
    payload = src.get("payload") or {}
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {}
    columns = payload.get("columns") or []
    rows = payload.get("rows") or []
    if not isinstance(rows, list) or not rows:
        raise ValueError("工作台该页无用例行")

    title_i = _col_index(columns, "用例名称", "用例标题", "标题")
    module_i = _col_index(columns, "所属模块", "模块")
    pre_i = _col_index(columns, "前置条件")
    step_i = _col_index(columns, "步骤描述", "步骤")
    expect_i = _col_index(columns, "预期结果", "期望结果")
    pri_i = _col_index(columns, "用例等级", "优先级")
    tag_i = _col_index(columns, "标签")

    source_ref = "%s|%s|%s" % (
        src.get("lanhu_pid") or "",
        src.get("lanhu_doc_id") or "",
        src.get("lanhu_page_id") or "",
    )

    prepared: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, list):
            continue
        title = _cell(row, title_i) if title_i is not None else ""
        if not title:
            title = str(row[0] or "").strip() if row else ""
        if not title:
            continue

        step_parts = _split_steps(_cell(row, step_i))
        expect_parts = _split_steps(_cell(row, expect_i))
        n = max(len(step_parts), len(expect_parts), 1)
        steps = []
        for i in range(n):
            steps.append(
                {
                    "step": step_parts[i] if i < len(step_parts) else "",
                    "expect": expect_parts[i] if i < len(expect_parts) else "",
                }
            )
        priority = (_cell(row, pri_i) or "P2").upper()
        if priority not in ("P0", "P1", "P2", "P3"):
            priority = "P2"
        tags_raw = _cell(row, tag_i)
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []
        module = _cell(row, module_i) if module_i is not None else ""
        if module and module not in tags:
            tags.append(module)
        prepared.append(
            {
                "title": title,
                "suite_id": target_suite_id,
                "priority": priority,
                "status": "ready",
                "precondition": _cell(row, pre_i),
                "steps": steps,
                "tags": tags,
                "source": "workbench",
                "source_ref": source_ref[:128],
            }
        )

    result = bulk_insert_cases(user_id, project_id, prepared)
    result["parsed"] = len(prepared)
    result["page_name"] = src.get("page_name") or ""
    result["suite_id"] = target_suite_id
    result["suite_name"] = target.get("name") or ""
    return result