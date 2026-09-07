"""用例二次校验：格式规则 + LLM 胡编/遗漏检测。"""
from __future__ import annotations

import time

import ast
import json
import re
import uuid
from collections.abc import Generator
from datetime import datetime
from typing import Any

import requests
from pymysql.err import OperationalError

from core.config.user_ai_credentials import resolve_text_ai_credentials
from core.services.ai.openai_compat import build_chat_completions_payload
from core.services.test_cases.generation_stream_service import _extract_stream_delta_parts
from core.services.test_cases.validation_db import ensure_validation_tables
from core.services.test_cases.case_template_service import get_case_template_by_id
from core.services.test_cases.mysql_db import get_connection
from core.services.test_cases.incremental_case_parser import (
    _is_mindmap_noise_line,
    _is_mindmap_outline_line,
    _line_indent_cols,
    extract_mindmap_parseable_text,
)

PRIORITY_VALUES = frozenset({"P0", "P1", "P2", "P3", "p0", "p1", "p2", "p3"})
VALIDATION_LLM_READ_TIMEOUT = 540
# 流式块间空闲超时：持续有 chunk 则续命；长时间无输出断开，避免挂死上游
VALIDATION_LLM_STREAM_READ_TIMEOUT = 540
VALIDATION_ISSUE_STATUSES = frozenset({"open", "resolved", "ignored"})


class LlmValidationParseError(ValueError):
    """AI 对照 content 无法解析为 issue_list。"""

# AI 质量检查结构化输出标记（正式回复 content 中必须使用）
TC_VALIDATION_RESULT_START = "<<<TC_VALIDATION_RESULT>>>"
TC_VALIDATION_RESULT_END = "<<<END_TC_VALIDATION_RESULT>>>"
TC_VALIDATION_RESULT_BLOCK_RE = re.compile(
    re.escape(TC_VALIDATION_RESULT_START)
    + r"\s*([\s\S]*?)\s*"
    + re.escape(TC_VALIDATION_RESULT_END),
    re.MULTILINE,
)
TC_VALIDATION_ISSUE_LIST_EXAMPLE = (
    'issue_list = [{"type":"hallucination","feature":"新建工单","status":"open",'
    '"case_index":0,"description":"需求未提及新建工单功能及工单标题字段"}]'
)
TC_VALIDATION_OUTPUT_FORMAT_EXAMPLE = (
    TC_VALIDATION_RESULT_START + "\n" + TC_VALIDATION_ISSUE_LIST_EXAMPLE + "\n" + TC_VALIDATION_RESULT_END
)


MINDMAP_SKIP_REQUIRED_LABELS = frozenset({"步骤描述", "预期结果", "用例等级"})
MINDMAP_REQUIRED_LABELS = frozenset({"用例名称", "所属模块"})
MINDMAP_SKIP_COLUMN_KEYWORDS: tuple[str, ...] = (
    "步骤", "step", "操作步骤", "测试步骤", "steps",
    "预期", "expected", "预期结果",
    "等级", "优先级", "priority", "用例等级",
)


def _column_matches_mindmap_skip(col_name: str) -> bool:
    text = str(col_name or "").strip().lower()
    if not text:
        return False
    for kw in MINDMAP_SKIP_COLUMN_KEYWORDS:
        if kw.lower() in text:
            return True
    return False



TEMPLATE_OPTIONAL_COLUMN_NAMES = frozenset({
    "标签", "备注", "引用", "关键词", "关联需求", "编辑模式", "相关需求",
})


def _find_exact_column(columns: list[str], name: str) -> int | None:
    target = str(name or "").strip().lower()
    for i, col in enumerate(columns):
        if str(col or "").strip().lower() == target:
            return i
    return None


def _is_optional_template_column(col_name: str) -> bool:
    text = str(col_name or "").strip()
    if not text:
        return True
    return text in TEMPLATE_OPTIONAL_COLUMN_NAMES


def _resolve_required_fields_for_template(
    template_id: str | None,
    columns: list[str],
) -> list[tuple[str, int | None]]:
    """按用例表头模板解析关键列（与各平台模板定义对齐）。"""
    tid = str(template_id or "").strip()
    if tid:
        tpl = get_case_template_by_id(tid)
        tpl_columns = [
            str(c).strip() for c in (tpl or {}).get("columns") or [] if str(c).strip()
        ]
        if tpl_columns:
            resolved: list[tuple[str, int | None]] = []
            for label in tpl_columns:
                if _is_optional_template_column(label):
                    continue
                resolved.append((label, _find_exact_column(columns, label)))
            return resolved

    resolved: list[tuple[str, int | None]] = []
    for label, keywords in REQUIRED_FIELD_SPECS:
        idx = _find_column(columns, keywords)
        if idx is not None:
            resolved.append((label, idx))
    return resolved


def _resolve_metersphere_priority_column(columns: list[str]) -> int | None:
    """P0~P3 取值检查仅针对 MeterSphere「用例等级」列。"""
    idx = _find_column(columns, ("用例等级",))
    if idx is None:
        return None
    if "用例等级" in str(columns[idx] or ""):
        return idx
    return None


REQUIRED_FIELD_SPECS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("用例名称", ("用例名称", "用例名", "标题", "name", "title")),
    ("所属模块", ("所属模块", "模块", "module")),
    ("步骤描述", ("步骤描述", "步骤", "测试步骤", "操作步骤", "steps")),
    ("预期结果", ("预期结果", "预期", "expected")),
    ("用例等级", ("用例等级", "优先级", "priority", "等级")),
)


def _now() -> datetime:
    return datetime.now()


def _new_id() -> str:
    return uuid.uuid4().hex


def _find_column(columns: list[str], keywords: tuple[str, ...]) -> int | None:
    for i, col in enumerate(columns):
        text = str(col or "").strip().lower()
        for kw in keywords:
            if kw.lower() in text:
                return i
    return None


def check_structure_rules(columns: list[str], rows: list[list[str]]) -> list[dict[str, Any]]:
    """第一层：校验行数据与当前表头列结构一致。"""
    issues: list[dict[str, Any]] = []
    if not columns:
        issues.append(
            {
                "row_index": None,
                "type": "structure",
                "message": "未应用表头模板，无法校验列格式",
            }
        )
        return issues

    col_count = len(columns)
    for ri, row in enumerate(rows):
        if not isinstance(row, list):
            issues.append(
                {
                    "row_index": ri,
                    "type": "structure",
                    "message": f"第 {ri + 1} 行：数据不是有效行",
                }
            )
            continue
        if len(row) != col_count:
            issues.append(
                {
                    "row_index": ri,
                    "type": "structure",
                    "message": f"第 {ri + 1} 行：列数与表头不一致（{len(row)}/{col_count}）",
                }
            )
            continue
        for ci, cell in enumerate(row):
            if cell is None:
                issues.append(
                    {
                        "row_index": ri,
                        "type": "structure",
                        "message": f"第 {ri + 1} 行：「{columns[ci]}」列值为 null",
                    }
                )
            elif not isinstance(cell, str):
                issues.append(
                    {
                        "row_index": ri,
                        "type": "structure",
                        "message": f"第 {ri + 1} 行：「{columns[ci]}」列值类型异常",
                    }
                )
    return issues


def check_required_field_rules(
    columns: list[str],
    rows: list[list[str]],
    *,
    required_profile: str = "default",
    template_id: str | None = None,
) -> list[dict[str, Any]]:
    """第二层：关键字段非空 + 用例等级取值（按表头模板）。"""
    issues: list[dict[str, Any]] = []
    if not columns:
        return issues

    is_mindmap = required_profile == "mindmap"
    skip_labels = MINDMAP_SKIP_REQUIRED_LABELS if is_mindmap else frozenset()

    if is_mindmap:
        resolved: list[tuple[str, int | None]] = []
        for label, keywords in REQUIRED_FIELD_SPECS:
            if label not in MINDMAP_REQUIRED_LABELS:
                continue
            if label in skip_labels:
                continue
            col_idx = _find_column(columns, keywords)
            if col_idx is not None and _column_matches_mindmap_skip(columns[col_idx]):
                continue
            resolved.append((label, col_idx))
        priority_col = None if "用例等级" in skip_labels else _resolve_metersphere_priority_column(columns)
    else:
        resolved = _resolve_required_fields_for_template(template_id, columns)
        priority_col = _resolve_metersphere_priority_column(columns)

    missing_headers = [label for label, idx in resolved if idx is None]
    if missing_headers:
        issues.append(
            {
                "row_index": None,
                "type": "required",
                "message": f"当前表头缺少关键列：{'、'.join(missing_headers)}",
            }
        )
        return issues

    if is_mindmap and priority_col is None:
        priority_col = _find_column(columns, ("用例等级", "优先级", "priority", "等级"))

    for ri, row in enumerate(rows):
        if not isinstance(row, list):
            continue
        for label, col_idx in resolved:
            if col_idx is None:
                continue
            val = str(row[col_idx] if col_idx < len(row) else "").strip()
            if not val:
                issues.append(
                    {
                        "row_index": ri,
                        "type": "required",
                        "message": f"第 {ri + 1} 行：{label} 为空",
                    }
                )
        if priority_col is not None:
            pri = str(row[priority_col] if priority_col < len(row) else "").strip()
            if pri and pri.upper() not in {p.upper() for p in PRIORITY_VALUES}:
                issues.append(
                    {
                        "row_index": ri,
                        "type": "required",
                        "message": f"第 {ri + 1} 行：用例等级「{pri}」不在 P0～P3 范围内",
                    }
                )
    return issues




def check_mindmap_ai_output_format(ai_output_text: str) -> list[dict[str, Any]]:
    """导图质量检查第一步：校验 AI 输出是否符合层级缩进 + TC: 格式。"""
    issues: list[dict[str, Any]] = []
    text = str(ai_output_text or "").strip()
    if not text:
        issues.append(
            {
                "row_index": None,
                "type": "structure",
                "message": "缺少 AI 输出原文，无法检查导图格式",
            }
        )
        return issues

    has_tc = bool(re.search(r"TC\s*[:：]", text, re.IGNORECASE))
    has_list = bool(re.search(r"test_cases\s*=|\[\s*\[", text))
    if has_list and not has_tc:
        issues.append(
            {
                "row_index": None,
                "type": "structure",
                "message": "AI 输出为表格列表格式，未按导图层级缩进 + TC: 格式",
            }
        )
        return issues

    cleaned = extract_mindmap_parseable_text(text)
    if not re.search(r"TC\s*[:：]", cleaned, re.IGNORECASE):
        issues.append(
            {
                "row_index": None,
                "type": "structure",
                "message": "AI 输出中未找到 TC: 用例行",
            }
        )
        return issues

    line_no = 0
    for raw_line in cleaned.splitlines():
        if not str(raw_line).strip():
            continue
        line_no += 1
        stripped = str(raw_line).strip()
        cols = _line_indent_cols(raw_line)
        if cols % 4 != 0:
            issues.append(
                {
                    "row_index": None,
                    "type": "structure",
                    "message": f"第 {line_no} 行缩进不是 4 空格的倍数",
                }
            )

        tc_match = re.match(r"^TC\s*[:：]\s*(.+)$", stripped, re.IGNORECASE)
        if tc_match:
            case_name = tc_match.group(1).strip()
            if not case_name:
                issues.append(
                    {
                        "row_index": None,
                        "type": "structure",
                        "message": f"第 {line_no} 行：TC: 后缺少用例名称",
                    }
                )
            elif cols != 12:
                issues.append(
                    {
                        "row_index": None,
                        "type": "structure",
                        "message": f"第 {line_no} 行：TC: 用例应使用 12 空格缩进（第四层）",
                    }
                )
            continue

        if _is_mindmap_noise_line(stripped):
            continue
        if not _is_mindmap_outline_line(raw_line):
            preview = stripped[:48] + ("…" if len(stripped) > 48 else "")
            issues.append(
                {
                    "row_index": None,
                    "type": "structure",
                    "message": f"第 {line_no} 行不符合导图层级格式：{preview}",
                }
            )

    return issues


def check_mindmap_nodes_nonempty(mindmap_nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """导图格式检查：校验导图所有节点标题非空（并入第一步，无独立关键字段步）。"""
    issues: list[dict[str, Any]] = []
    nodes = mindmap_nodes if isinstance(mindmap_nodes, list) else []
    if not nodes:
        issues.append(
            {
                "row_index": None,
                "type": "structure",
                "message": "导图中没有可检查的节点",
            }
        )
        return issues

    for idx, node in enumerate(nodes):
        if not isinstance(node, dict):
            continue
        topic = str(node.get("topic") or "").strip()
        path = str(node.get("path") or "").strip()
        if topic:
            continue
        label = path or f"节点 {idx + 1}"
        issues.append(
            {
                "row_index": idx,
                "type": "structure",
                "message": f"导图节点标题为空：{label}",
            }
        )
    return issues


def check_mindmap_format_rules(
    *,
    ai_output_text: str,
    mindmap_nodes: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """导图专用格式校验（与表格 check_format_rules 隔离）。"""
    return check_mindmap_ai_output_format(ai_output_text) + check_mindmap_nodes_nonempty(
        mindmap_nodes or []
    )


def check_format_rules(
    columns: list[str],
    rows: list[list[str]],
    *,
    required_profile: str = "default",
    template_id: str | None = None,
) -> list[dict[str, Any]]:
    """代码校验（第一层 + 第二层）。"""
    return check_structure_rules(columns, rows) + check_required_field_rules(
        columns, rows, required_profile=required_profile, template_id=template_id
    )


def _build_cases_summary(columns: list[str], rows: list[list[str]], limit: int = 40) -> str:
    name_col = _find_column(columns, ("用例名称", "用例名", "标题")) or 0
    lines: list[str] = []
    for i, row in enumerate(rows[:limit]):
        name = str(row[name_col] if name_col < len(row) else f"行{i+1}").strip()
        parts = [f"{columns[j]}={str(row[j]).strip()[:80]}" for j in range(min(len(columns), len(row)))]
        lines.append(f"- [{i}] {name}: " + " | ".join(parts[:6]))
    if len(rows) > limit:
        lines.append(f"... 共 {len(rows)} 条，仅展示前 {limit} 条")
    return "\n".join(lines)


def _build_cases_summary_for_qc(columns: list[str], rows: list[list[str]]) -> str:
    """质量检查历史短摘要格式（80 字/前 6 列）。保留供兼容，QC 入模已改用全文方法。

    不修改 `_build_cases_summary` 默认 limit，避免影响其它仍依赖短摘要的调用方。
    """
    name_col = _find_column(columns, ("用例名称", "用例名", "标题")) or 0
    lines: list[str] = []
    for i, row in enumerate(rows):
        name = str(row[name_col] if name_col < len(row) else f"行{i+1}").strip()
        parts = [f"{columns[j]}={str(row[j]).strip()[:80]}" for j in range(min(len(columns), len(row)))]
        lines.append(f"- [{i}] {name}: " + " | ".join(parts[:6]))
    return "\n".join(lines)


def _build_cases_full_text_for_qc(columns: list[str], rows: list[list[str]]) -> str:
    """质量检查专用：输出全部用例、全部列、单元格全文，不做字数/列数截断。

    新方法，不修改 `_build_cases_summary` / `_build_cases_summary_for_qc`，避免影响其它调用方。
    """
    cols = [str(c or "").strip() or f"列{j + 1}" for j, c in enumerate(columns or [])]
    if not cols:
        cols = ["用例内容"]
    blocks: list[str] = []
    for i, row in enumerate(rows or []):
        cells = list(row) if isinstance(row, (list, tuple)) else []
        lines = [f"### 用例 [{i}]"]
        for j, col_name in enumerate(cols):
            raw = cells[j] if j < len(cells) else ""
            text = str(raw if raw is not None else "").strip()
            if not text:
                text = "(空)"
            else:
                # 保留换行可读性，统一换行符，避免破坏标记结构
                text = text.replace("\r\n", "\n").replace("\r", "\n")
            if "\n" in text:
                indented = "\n".join(
                    ("  " + ln if ln else "") for ln in text.split("\n")
                )
                lines.append(f"- {col_name}:\n{indented}")
            else:
                lines.append(f"- {col_name}: {text}")
        blocks.append("\n".join(lines))
    if not blocks:
        return "(无用例)"
    return "\n\n".join(blocks)


def _strip_markdown_json_fences(raw: str) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    match = re.search(_markdown_fence_pattern(), text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return text


def _format_issue_display_message(feature: str, description: str) -> str:
    feature = str(feature or "").strip()
    description = str(description or "").strip()
    if feature and description:
        return f"【{feature}】{description}"
    return description or feature


def _normalize_issue_list_assign_source(text: str) -> str:
    """Strip markdown emphasis around issue_list so bracket extraction still works."""
    text = str(text or "")
    text = re.sub(r"\*{1,2}\s*(issue_list)\s*\*{1,2}", r"\1", text, flags=re.IGNORECASE)
    text = re.sub(r"_+(issue_list)_+", r"\1", text, flags=re.IGNORECASE)
    text = re.sub(r"(?i)issue_list\s*:", "issue_list =", text)
    text = re.sub(r"(?i)\bissue_list\b\s*(?=\[)", "issue_list = ", text)
    return text


def _fix_trailing_commas_json(text: str) -> str:
    text = str(text or "")
    prev = None
    while prev != text:
        prev = text
        text = re.sub(r",(\s*[}\]])", r"\1", text)
    return text


def _markdown_fence_pattern() -> str:
    return r"```(?:python|py|json|markdown|md|text|yaml|yml)?\s*([\s\S]*?)```"


def _looks_like_issue_item(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    itype = str(item.get("type") or "").strip().lower()
    if itype in ("hallucination", "gap"):
        return True
    if item.get("feature") or item.get("description") or item.get("message"):
        return True
    return False


def _scan_bracketed_arrays(text: str) -> list[str]:
    text = str(text or "")
    if not text:
        return []
    out: list[str] = []
    seen: set[str] = set()
    start = 0
    while True:
        pos = text.find("[", start)
        if pos < 0:
            break
        depth = 0
        in_string = False
        string_char = ""
        escape = False
        end = -1
        for i in range(pos, len(text)):
            ch = text[i]
            if escape:
                escape = False
                continue
            if ch == "\\" and in_string:
                escape = True
                continue
            if not in_string and ch in ('"', "'"):
                in_string = True
                string_char = ch
                continue
            if in_string:
                if ch == string_char:
                    in_string = False
                continue
            if ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end > pos:
            literal = text[pos:end]
            if literal not in seen:
                seen.add(literal)
                out.append(literal)
            start = end
        else:
            start = pos + 1
    return out


def _try_extract_issue_arrays_from_text(text: str) -> list[dict[str, Any]] | None:
    text = str(text or "").strip()
    if not text:
        return None
    match = re.search(r"(?is)issue_list\s*=\s*(\[[\s\S]*?\])", text)
    if match:
        items = _parse_array_literal_items(match.group(1))
        if items is not None:
            parsed = _parse_issue_list_items(items)
            if parsed is not None:
                return parsed
    best_nonempty: list[dict[str, Any]] | None = None
    saw_payload = False
    for literal in _scan_bracketed_arrays(text):
        items = _parse_array_literal_items(literal)
        if items is None or not items:
            continue
        if not all(isinstance(x, dict) for x in items):
            continue
        if not any(_looks_like_issue_item(x) for x in items):
            continue
        saw_payload = True
        parsed = _parse_issue_list_items(items)
        if parsed:
            best_nonempty = parsed
    if best_nonempty is not None:
        return best_nonempty
    if saw_payload:
        return []
    return None


def _extract_bracketed_array_literal(text: str, assign_name: str) -> str | None:
    text = _normalize_issue_list_assign_source(str(text or ""))
    match = re.search(rf"{re.escape(assign_name)}\s*[:=]", text, re.IGNORECASE)
    if not match:
        return None
    start = text.find("[", match.end())
    if start < 0:
        return None
    depth = 0
    in_string = False
    string_char = ""
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if not in_string and ch in ('"', "'"):
            in_string = True
            string_char = ch
            continue
        if in_string:
            if ch == string_char:
                in_string = False
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _parse_array_literal_items(literal: str) -> list[Any] | None:
    text = str(literal or "").strip()
    if not text:
        return None
    candidates = [text, text.replace("\n", " ").strip(), _fix_trailing_commas_json(text)]
    seen: set[str] = set()
    ordered: list[str] = []
    for candidate in candidates:
        candidate = str(candidate or "").strip()
        if candidate and candidate not in seen:
            seen.add(candidate)
            ordered.append(candidate)
    for candidate in ordered:
        try:
            parsed = ast.literal_eval(candidate)
        except (SyntaxError, ValueError):
            try:
                parsed = json.loads(candidate)
            except (json.JSONDecodeError, TypeError, ValueError):
                continue
        else:
            if isinstance(parsed, list):
                return parsed
    return None


def _parse_issue_list_items(items: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        itype = str(item.get("type") or "").strip().lower()
        if itype not in ("hallucination", "gap"):
            itype = "hallucination" if "胡编" in str(item.get("description") or item.get("message") or "") else "gap"
        status = str(item.get("status") or "open").strip().lower()
        if status not in VALIDATION_ISSUE_STATUSES:
            status = "open"
        feature = str(item.get("feature") or "").strip()
        description = str(item.get("description") or item.get("message") or "").strip()
        if not description and not feature:
            continue
        message = _format_issue_display_message(feature, description)
        case_index = item.get("case_index")
        if case_index is None:
            case_index = item.get("row_index")
        row_index = None
        if case_index is not None and str(case_index).strip() != "":
            try:
                row_index = int(case_index)
            except (TypeError, ValueError):
                row_index = None
        out.append(
            {
                "row_index": row_index,
                "case_index": row_index,
                "type": itype,
                "message": message,
                "feature": feature or None,
                "status": status,
                "description": description or None,
            }
        )
    return out


def _decode_issue_list_payload(raw: str) -> list[dict[str, Any]] | None:
    text = _strip_markdown_json_fences(_normalize_issue_list_assign_source(str(raw or "").strip()))
    if not text:
        return None
    candidates: list[str] = []
    seen: set[str] = set()

    def _push(piece: str) -> None:
        piece = str(piece or "").strip()
        if piece and piece not in seen:
            seen.add(piece)
            candidates.append(piece)

    literal = _extract_bracketed_array_literal(text, "issue_list")
    if literal:
        _push(literal)
    if "issue_list" in text.lower():
        _push(text)
    _push(text)

    best_nonempty: list[dict[str, Any]] | None = None
    saw_payload = False
    for candidate in candidates:
        if candidate.startswith("issue_list"):
            array_text = _extract_bracketed_array_literal(candidate, "issue_list") or candidate
        elif candidate.startswith("["):
            array_text = candidate
        else:
            continue
        items = _parse_array_literal_items(array_text)
        if items is None:
            continue
        saw_payload = True
        parsed = _parse_issue_list_items(items)
        if parsed:
            best_nonempty = parsed
    if best_nonempty is not None:
        return best_nonempty
    if saw_payload:
        return []
    return None


def _decode_validation_block_text(candidate: str) -> list[dict[str, Any]] | None:
    """优先解析 issue_list，再兼容旧版 issues JSON。"""
    candidate = _normalize_issue_list_assign_source(str(candidate or ""))
    issue_list = _decode_issue_list_payload(candidate)
    if issue_list is not None:
        return issue_list
    return _decode_json_issues_text(candidate)


def _has_structured_validation_block(raw: str) -> bool:
    return bool(TC_VALIDATION_RESULT_BLOCK_RE.search(str(raw or "")))


def _extract_structured_validation_json_texts(raw: str) -> list[str]:
    return [
        _strip_markdown_json_fences(match.group(1).strip())
        for match in TC_VALIDATION_RESULT_BLOCK_RE.finditer(str(raw or ""))
        if match.group(1).strip()
    ]


def _decode_json_issues_text(candidate: str) -> list[dict[str, Any]] | None:
    text = str(candidate or "").strip()
    if not text:
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    items = data.get("issues") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return None
    return _parse_llm_issue_items(items)


def _decode_structured_validation_payload(raw: str) -> list[dict[str, Any]] | None:
    """解析标记块；返回 None 表示未找到标记块或块内 JSON 无效。"""
    if not _has_structured_validation_block(raw):
        return None
    blocks = _extract_structured_validation_json_texts(raw)
    if not blocks:
        return []
    best_nonempty: list[dict[str, Any]] | None = None
    saw_payload = False
    for block in blocks:
        parsed = _decode_validation_block_text(block)
        if parsed is None:
            continue
        saw_payload = True
        if parsed:
            best_nonempty = parsed
    if best_nonempty is not None:
        return best_nonempty
    if saw_payload:
        return []
    return None


def _extract_bracketed_json_objects_with_issues(raw: str) -> list[str]:
    """Bracket-match inline objects/arrays for issues or issue_list payloads."""
    text = str(raw or "")
    if not text:
        return []
    objects: list[str] = []
    literal = _extract_bracketed_array_literal(text, "issue_list")
    if literal:
        objects.append(literal)
    for needle in ('"issues"', "'issues'"):
        idx = 0
        while True:
            pos = text.find(needle, idx)
            if pos < 0:
                break
            start = text.rfind("{", 0, pos)
            if start < 0:
                idx = pos + len(needle)
                continue
            depth = 0
            end = -1
            for i in range(start, len(text)):
                ch = text[i]
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            if end > start:
                objects.append(text[start:end])
            idx = pos + len(needle)
    return objects


def _iter_llm_issues_json_candidates(raw: str) -> list[str]:
    """Collect payload candidates; later non-empty results win during decode."""
    text = str(raw or "").strip()
    if not text:
        return []
    candidates: list[str] = []
    seen: set[str] = set()

    def _push(piece: str) -> None:
        piece = str(piece or "").strip()
        if piece and piece not in seen:
            seen.add(piece)
            candidates.append(piece)

    for match in re.finditer(_markdown_fence_pattern(), text, re.IGNORECASE):
        _push(match.group(1))
    issue_literal = _extract_bracketed_array_literal(text, "issue_list")
    if issue_literal:
        _push(issue_literal)
        _push("issue_list = " + issue_literal)
    for piece in _extract_bracketed_json_objects_with_issues(text):
        _push(piece)
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        _push(match.group(0))
    _push(_strip_markdown_json_fences(text))
    _push(text)
    return candidates


def _decode_llm_issues_payload(raw: str) -> list[dict[str, Any]] | None:
    """Decode issue_list / issues JSON; structured markers first, then legacy heuristics."""
    structured = _decode_structured_validation_payload(raw)
    if structured is not None:
        return structured

    issue_list = _decode_issue_list_payload(raw)
    if issue_list is not None:
        return issue_list

    best_nonempty: list[dict[str, Any]] | None = None
    saw_payload = False
    for candidate in _iter_llm_issues_json_candidates(raw):
        parsed = _decode_validation_block_text(candidate)
        if parsed is None:
            continue
        saw_payload = True
        if parsed:
            best_nonempty = parsed
    if best_nonempty is not None:
        return best_nonempty
    if saw_payload:
        return []
    return None


def _llm_issues_payload_present(raw: str) -> bool:
    """True when raw decodes to issue_list or {"issues": [...]} (may be empty)."""
    if _has_structured_validation_block(raw):
        return True
    text = str(raw or "").strip()
    if not text:
        return False
    if _decode_issue_list_payload(text) is not None:
        return True
    for candidate in _iter_llm_issues_json_candidates(text):
        if _decode_validation_block_text(candidate) is not None:
            return True
    return False


def _parse_llm_issue_items(items: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        itype = str(item.get("type") or "").strip().lower()
        if itype not in ("hallucination", "gap"):
            itype = "hallucination" if "胡编" in str(item.get("message", "")) else "gap"
        msg = str(item.get("message") or "").strip()
        if not msg:
            continue
        row_index = item.get("row_index")
        if row_index is not None:
            try:
                row_index = int(row_index)
            except (TypeError, ValueError):
                row_index = None
        out.append({"row_index": row_index, "type": itype, "message": msg})
    return out


def _parse_llm_issues(raw: str) -> list[dict[str, Any]]:
    parsed = _decode_llm_issues_payload(raw)
    return parsed or []


def _try_resolve_llm_issues_text(text: str) -> list[dict[str, Any]] | None:
    text = str(text or "").strip()
    if not text:
        return None
    structured = _decode_structured_validation_payload(text)
    if structured is not None:
        return structured
    if _llm_issues_payload_present(text):
        return _parse_llm_issues(text)
    loose = _try_extract_issue_arrays_from_text(text)
    if loose is not None:
        return loose
    return None


def _resolve_llm_issues_from_response(*, content: str, reasoning: str = "") -> list[dict[str, Any]]:
    """仅从正式回复 content 解析 issue_list；不使用 reasoning 思考内容。"""
    _ = reasoning
    content = str(content or "").strip()
    if not content:
        raise LlmValidationParseError("AI 对照未返回 content 结果")
    parsed = _try_resolve_llm_issues_text(content)
    if parsed is not None:
        return parsed
    raise LlmValidationParseError("AI 对照 content 中未找到有效的 issue_list 标记块")


def _resolve_llm_qc_issues_empty_content_as_pass(
    *, content: str, reasoning: str = ""
) -> list[dict[str, Any]]:
    """质量检查专用：content 为空视为无问题通过；有 content 时仍走正式解析。

    不修改 `_resolve_llm_issues_from_response`，避免影响其它仍按「空 content=解析失败」语义使用的路径。
    """
    _ = reasoning
    content = str(content or "").strip()
    if not content:
        return []
    return _resolve_llm_issues_from_response(content=content, reasoning="")


def _extract_message_reasoning_text(message: dict[str, Any]) -> str:
    if not isinstance(message, dict):
        return ""
    for key in ("reasoning_content", "reasoning", "thinking", "thought"):
        piece = str(message.get(key) or "").strip()
        if piece:
            return piece
    return ""


def _request_validation_llm(
    *,
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    temperature: float = 0.1,
) -> tuple[str, str]:
    """质量检查专用 LLM 调用：不限制 max_tokens，由模型自然结束输出。"""
    api_url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
    }
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    try:
        response = requests.post(
            api_url,
            json=payload,
            headers=headers,
            timeout=(10, VALIDATION_LLM_READ_TIMEOUT),
        )
        response.raise_for_status()
    except requests.exceptions.Timeout as exc:
        raise TimeoutError("AI 校验等待超时") from exc
    except requests.exceptions.RequestException as exc:
        raise RuntimeError(f"AI 校验请求失败：{exc}") from exc
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        return "", ""
    message = choices[0].get("message") or {}
    content = str(message.get("content") or "")
    reasoning = _extract_message_reasoning_text(message)
    return content, reasoning


def _resolve_llm_validation_credentials(
    *,
    use_builtin: bool,
    base_url: str,
    api_key: str,
    model: str,
    temperature: float | None,
    user_id: str | None,
) -> dict[str, Any] | None:
    quota_meta = None
    if use_builtin:
        try:
            ai_cfg = resolve_text_ai_credentials({"use_builtin": True}, user_id)
            from core.services.ai.user_ai_daily_quota_service import pop_quota_meta
            quota_meta = pop_quota_meta(ai_cfg)
            base_url = str(ai_cfg.get("base_url") or "")
            api_key = str(ai_cfg.get("api_key") or "")
            model = str(ai_cfg.get("model") or "")
            temperature = float(ai_cfg.get("temperature") or 0.1)
        except Exception:
            return None
    if not base_url or not api_key or not model:
        return None
    return {
        "base_url": base_url,
        "api_key": api_key,
        "model": model,
        "temperature": float(temperature or 0.1),
        "_quota_meta": quota_meta,
    }


def _resolve_llm_validation_credentials_for_qc(
    *,
    use_builtin: bool,
    base_url: str,
    api_key: str,
    model: str,
    temperature: float | None,
    user_id: str | None,
) -> dict[str, Any] | None:
    """质量检查流式专用：额度/登录异常向上抛出，不吞成「AI 配置不完整」。"""
    from core.config.user_ai_credentials import resolve_text_ai_credentials
    from core.services.ai.user_ai_daily_quota_service import pop_quota_meta

    quota_meta = None
    if use_builtin:
        ai_cfg = resolve_text_ai_credentials({"use_builtin": True}, user_id)
        quota_meta = pop_quota_meta(ai_cfg)
        base_url = str(ai_cfg.get("base_url") or "")
        api_key = str(ai_cfg.get("api_key") or "")
        model = str(ai_cfg.get("model") or "")
        temperature = float(ai_cfg.get("temperature") or 0.1)
    if not base_url or not api_key or not model:
        return None
    return {
        "base_url": base_url,
        "api_key": api_key,
        "model": model,
        "temperature": float(temperature or 0.1),
        "_quota_meta": quota_meta,
    }


def _qc_llm_credential_error_event(exc: BaseException) -> dict[str, Any]:
    """将额度/登录/配置异常转为 SSE error（带 code / ai_quota，供前端额度提示）。"""
    from core.config.user_ai_credentials import user_ai_config_error_response

    body, _status = user_ai_config_error_response(exc if isinstance(exc, Exception) else Exception(str(exc)))
    msg = str((body or {}).get("error") or exc).strip() or "AI 对照失败"
    ev: dict[str, Any] = {"type": "error", "message": msg}
    code = (body or {}).get("code")
    if code:
        ev["code"] = code
    ai_quota = (body or {}).get("ai_quota")
    if ai_quota:
        ev["ai_quota"] = ai_quota
    return ev


def _llm_quality_output_format_block() -> str:
    return (
        "【输出格式 - 必须严格遵守】\n"
        "正式回复（content）中只能输出一对标记块，不要 markdown、不要代码围栏、不要注释、不要任何额外说明文字。\n"
        "思考过程可自由分析，但不得在标记块之外输出 issue_list 或 JSON 草稿。\n"
        "标记块内只能是单行 issue_list 赋值，格式如下：\n"
        f"{TC_VALIDATION_OUTPUT_FORMAT_EXAMPLE}\n\n"
        "issue_list 每项字段规则：\n"
        "- type：hallucination（幻觉/需求未提及功能）或 gap（遗漏/需求未覆盖）\n"
        "- feature：问题相关的功能点名称（字符串，必填）\n"
        "- status：固定写 open（未解决）；resolved/ignored 仅用于人工后续处理\n"
        "- case_index：对应用例索引（0 起，与用例全文中 [i] 一致）；整批 gap 可省略\n"
        "- description：问题详细说明（字符串，必填）\n"
        "无问题时写：issue_list = []\n"
    )


def _llm_quality_judgment_principles_block(*, material_phrase: str) -> str:
    """保守判过原则：仅用于质量检查提示词，降低大页误报 gap/hallucination。"""
    return (
        "【总原则 - 必须遵守】\n"
        "- 只报告高置信问题；若功能点可能已被同义/部分/组合用例覆盖，或证据不足，"
        "不要报 gap，也不要报 hallucination。\n"
        f"- {material_phrase}未写死的实现细节、通用能力（登录态、权限校验、空态、加载中、"
        "浏览器兼容等），除非材料明确写出，否则不算 hallucination。\n"
        "- 一条用例可覆盖多个需求点；多个用例合起来覆盖一个需求点也算已覆盖。\n"
        "- 不要为了「找全」而拆细报；同一根因只报一条。\n"
        "- 拿不准时优先 issue_list = []，而不是猜测遗漏。\n"
        "- 若问题超过 15 条，只保留最重要的最多 15 条；其余合并进某条 description "
        "说明「另有若干次要项未逐条列出」。\n\n"
    )


def _llm_quality_hallucination_gap_rules(
    *,
    material_phrase: str,
    case_scope_phrase: str,
    gap_extra: str = "",
) -> str:
    """收紧 hallucination / gap 判据；gap_extra 用于批次范围补充说明。"""
    gap_suffix = f"；{gap_extra}" if gap_extra else ""
    return (
        "请检查（须同时满足下列判据）：\n"
        f"1. hallucination：仅当{case_scope_phrase}的主功能在{material_phrase}中"
        "完全找不到对应表述（含同义、上下位、模块归属）时才报；"
        "用例是某功能的前置/后置/异常分支且语境合理，"
        "或仅因字段名、按钮文案、步骤粒度不同 → 不报。\n"
        f"2. gap：仅当{material_phrase}中明确写出的独立可测主流程/关键规则，"
        f"在{case_scope_phrase}中均无任何体现时才报；"
        "隐含、一笔带过、非功能描述，或已有名称/模块/步骤语义相近的用例 → 视为已覆盖，不报"
        f"{gap_suffix}。\n\n"
    )


def _build_llm_quality_prompt(
    *,
    requirements: str,
    columns: list[str],
    rows: list[list[str]],
    scope_hint: str = "",
    user_content: str = "",
    validation_context: str = "",
) -> str:
    req = str(requirements or "").strip()
    user = str(user_content or "").strip()
    cases_full = _build_cases_full_text_for_qc(columns, rows)
    row_n = len(rows)
    ctx = str(validation_context or "").strip()
    is_parse_batch = ctx == "parse_batch"
    is_current_batch = is_parse_batch or str(scope_hint or "").strip() == "current_batch"
    scope_lines = ""
    material = "当前页需求"
    if is_parse_batch and row_n > 0:
        last_idx = max(0, row_n - 1)
        scope_lines = (
            "【校验范围】\n"
            f"仅检查下方「用例解析」步骤产出的 {row_n} 条用例（索引 0～{last_idx}）。\n"
            "不得引用表格其它行、历史会话、其它批次或需求以外知识。\n"
            f"case_index 必须是 0～{last_idx} 的整数，与用例全文中 [i] 一致；"
            "整批 gap 可省略 case_index。\n\n"
        )
        req_label = "【当前页需求】"
        check_rules = _llm_quality_hallucination_gap_rules(
            material_phrase=material,
            case_scope_phrase=f"上述 {row_n} 条用例",
            gap_extra="仅针对本批用例，不要求覆盖需求以外内容",
        )
    elif is_current_batch:
        scope_lines = (
            "【校验范围】\n"
            "仅对照下方「已生成用例全文」与「当前页需求」；"
            "gap 仅指当前页需求中本批用例未覆盖的功能点，"
            "不得引用其它页面、知识库或表格其它批次用例。\n\n"
        )
        req_label = "【当前页需求】"
        check_rules = _llm_quality_hallucination_gap_rules(
            material_phrase=material,
            case_scope_phrase="本批用例",
            gap_extra="不得引用其它页面或其它批次用例",
        )
    else:
        req_label = "【当前页需求】"
        check_rules = _llm_quality_hallucination_gap_rules(
            material_phrase=material,
            case_scope_phrase="用例",
        )
    user_block = f"【用户内容】\n{user}\n\n" if user else ""
    req_block = f"{req_label}\n{req}\n\n" if req else ""
    return (
        "你是测试用例质量审查员。仅依据【当前页需求】判断，不得引入需求以外的知识。\n\n"
        + scope_lines
        + user_block
        + req_block
        + "【表头】\n"
        f"{', '.join(columns)}\n\n"
        "【已生成用例全文】\n"
        f"{cases_full}\n\n"
        + _llm_quality_judgment_principles_block(material_phrase=material)
        + check_rules
        + "不要检查格式、空字段、列结构等问题（已由代码完成）。\n\n"
        + _llm_quality_output_format_block()
    )


def _build_mindmap_llm_quality_prompt(
    *,
    requirements: str,
    columns: list[str],
    rows: list[list[str]],
    user_content: str = "",
    rag_context: str = "",
) -> str:
    """导图 AI 对照：审查员 + 用户内容 + 蓝湖(可选) + RAG(可选) + 本轮用例。"""
    user = str(user_content or "").strip()
    req = str(requirements or "").strip()
    rag = str(rag_context or "").strip()
    cases_full = _build_cases_full_text_for_qc(columns, rows)
    row_n = len(rows)
    last_idx = max(0, row_n - 1)
    material = "用户内容/蓝湖需求/知识库"
    parts: list[str] = [
        "你是测试用例质量审查员。请依据下方提供的【用户内容】、【蓝湖需求】（如有）、"
        "【知识库】（如有）审查本轮思维导图用例，不得引入上述材料以外的外部知识。\n"
    ]
    if user:
        parts.append(f"【用户内容】\n{user}\n")
    if req:
        parts.append(f"【蓝湖需求】\n{req}\n")
    if rag:
        parts.append(f"【知识库】\n{rag}\n")
    parts.append("【表头】\n" + ", ".join(columns) + "\n")
    parts.append(
        f"【本轮次对话生成用例全文】\n"
        f"共 {row_n} 条（索引 0～{last_idx}，含质量检查补全的用例）：\n{cases_full}\n"
    )
    parts.append(_llm_quality_judgment_principles_block(material_phrase=material))
    parts.append(
        _llm_quality_hallucination_gap_rules(
            material_phrase=material,
            case_scope_phrase=f"上述 {row_n} 条用例",
        )
    )
    parts.append(
        "不要检查格式、空字段、节点结构等问题（已由代码完成）。\n\n"
        + _llm_quality_output_format_block()
    )
    return "\n".join(parts)


def _iter_validation_llm_stream(
    *,
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    temperature: float = 0.1,
) -> Generator[tuple[str, str], None, None]:
    api_url = f"{base_url.rstrip('/')}/chat/completions"
    payload = build_chat_completions_payload(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        stream=True,
        temperature=temperature,
        enable_thinking=True,
    )
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    with requests.post(
        api_url,
        json=payload,
        headers=headers,
        stream=True,
        timeout=(10, VALIDATION_LLM_STREAM_READ_TIMEOUT),
    ) as response:
        if response.status_code >= 400:
            detail = response.text[:400] if response.text else ""
            raise RuntimeError(f"AI 校验请求失败 ({response.status_code}): {detail}")
        for raw_line in response.iter_lines(decode_unicode=True):
            if not raw_line:
                continue
            line = raw_line.strip()
            if not line.startswith("data:"):
                continue
            data_str = line[5:].strip()
            if data_str == "[DONE]":
                break
            try:
                chunk = json.loads(data_str)
            except json.JSONDecodeError:
                continue
            for stream_kind, content_piece in _extract_stream_delta_parts(chunk):
                if content_piece:
                    yield stream_kind, content_piece




def _persist_validation_run_with_retry(persist_fn, max_attempts=3):
    last_exc = None
    for attempt in range(max_attempts):
        try:
            return persist_fn()
        except OperationalError as exc:
            last_exc = exc
            if exc.args and exc.args[0] == 1213 and attempt < max_attempts - 1:
                time.sleep(0.05 * (attempt + 1))
                continue
            raise
    if last_exc:
        raise last_exc
    return persist_fn()


def _persist_validation_run(
    *,
    user_id: str | None,
    batch_id: str | None,
    issues: list[dict[str, Any]],
) -> str:
    run_id = _new_id()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tc_validation_runs (id, batch_id, user_id, issue_count, created_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (run_id, batch_id, user_id, len(issues), _now()),
            )
            for issue in issues:
                cur.execute(
                    """
                    INSERT INTO tc_validation_issues
                        (id, run_id, row_index, issue_type, message, dismissed, created_at)
                    VALUES (%s, %s, %s, %s, %s, 0, %s)
                    """,
                    (
                        _new_id(),
                        run_id,
                        issue.get("row_index"),
                        issue.get("type") or "format",
                        issue.get("message") or "",
                        _now(),
                    ),
                )
    finally:
        conn.close()
    return run_id


def iter_llm_validation_stream_events(
    *,
    user_id: str | None,
    batch_id: str | None,
    requirements: str,
    columns: list[str],
    rows: list[list[str]],
    use_builtin: bool,
    base_url: str = "",
    api_key: str = "",
    model: str = "",
    temperature: float | None = 0.1,
    scope_hint: str = "",
    user_content: str = "",
    validation_context: str = "",
    rag_context: str = "",
) -> Generator[dict[str, Any], None, None]:
    """SSE：流式推送 AI 思考内容，结束时返回与 /validate 一致的 LLM 结果。"""
    req = str(requirements or "").strip()
    user = str(user_content or "").strip()
    rag = str(rag_context or "").strip()
    ctx = str(validation_context or "").strip()
    if not rows:
        yield {"type": "error", "message": "没有用例行，无法执行 AI 对照"}
        return
    if ctx == "mindmap_batch":
        if not user and not req and not rag:
            yield {"type": "error", "message": "缺少用户内容、蓝湖需求与知识库上下文，无法执行 AI 对照"}
            return
    elif not req and not user:
        yield {"type": "error", "message": "缺少用户内容与需求摘要，无法执行 AI 对照"}
        return
    try:
        creds = _resolve_llm_validation_credentials_for_qc(
            use_builtin=use_builtin,
            base_url=base_url,
            api_key=api_key,
            model=model,
            temperature=temperature,
            user_id=user_id,
        )
    except Exception as cred_exc:
        yield _qc_llm_credential_error_event(cred_exc)
        return
    if not creds:
        yield {"type": "error", "message": "AI 配置不完整，无法执行 AI 对照"}
        return

    if ctx == "mindmap_batch":
        prompt = _build_mindmap_llm_quality_prompt(
            requirements=req,
            columns=columns,
            rows=rows,
            user_content=user,
            rag_context=rag,
        )
    else:
        prompt = _build_llm_quality_prompt(
            requirements=req,
            columns=columns,
            rows=rows,
            scope_hint=scope_hint,
            user_content=user,
            validation_context=validation_context,
        )
    reasoning_parts: list[str] = []
    content_parts: list[str] = []
    quota_meta = creds.get("_quota_meta")
    if quota_meta:
        yield {"type": "ai_quota", "ai_quota": quota_meta}
    yield {"type": "start"}
    try:
        for stream_kind, piece in _iter_validation_llm_stream(
            base_url=creds["base_url"],
            api_key=creds["api_key"],
            model=creds["model"],
            prompt=prompt,
            temperature=creds["temperature"],
        ):
            if stream_kind == "reasoning":
                reasoning_parts.append(piece)
                yield {"type": "stream_chunk", "stream_kind": "reasoning", "content": piece}
            elif stream_kind == "content":
                content_parts.append(piece)
    except requests.exceptions.Timeout as exc:
        issues = [{"row_index": None, "type": "gap", "message": "AI 校验超时，请稍后重试或减少用例行数"}]
        run_id = _persist_validation_run(user_id=user_id, batch_id=batch_id, issues=issues)
        yield {
            "type": "done",
            "run_id": run_id,
            "issues": issues,
            "llm_count": len(issues),
            "reasoning_text": "".join(reasoning_parts),
        }
        return
    except Exception as exc:
        issues = [{"row_index": None, "type": "gap", "message": f"AI 校验调用失败：{exc}"}]
        run_id = _persist_validation_run(user_id=user_id, batch_id=batch_id, issues=issues)
        yield {
            "type": "done",
            "run_id": run_id,
            "issues": issues,
            "llm_count": len(issues),
            "reasoning_text": "".join(reasoning_parts),
        }
        return

    raw = "".join(content_parts)
    try:
        issues = _resolve_llm_qc_issues_empty_content_as_pass(
            content=raw,
            reasoning="".join(reasoning_parts),
        )
    except LlmValidationParseError as exc:
        yield {"type": "error", "message": str(exc)}
        return
    run_id = _persist_validation_run(user_id=user_id, batch_id=batch_id, issues=issues)
    yield {
        "type": "done",
        "run_id": run_id,
        "issues": issues,
        "llm_count": len(issues),
        "reasoning_text": "".join(reasoning_parts),
    }


def check_llm_quality(
    *,
    requirements: str,
    columns: list[str],
    rows: list[list[str]],
    use_builtin: bool,
    base_url: str = "",
    api_key: str = "",
    model: str = "",
    temperature: float | None = 0.1,
    scope_hint: str = "",
    user_content: str = "",
    user_id: str | None = None,
    validation_context: str = "",
    rag_context: str = "",
) -> list[dict[str, Any]]:
    """第三层：AI 对照蓝湖需求查胡编/遗漏（非流式，供 Agent 等路径复用）。"""
    req = str(requirements or "").strip()
    user = str(user_content or "").strip()
    rag = str(rag_context or "").strip()
    ctx = str(validation_context or "").strip()
    if not rows:
        return []
    if ctx == "mindmap_batch":
        if not user and not req and not rag:
            return []
    elif not req and not user:
        return []
    creds = _resolve_llm_validation_credentials(
        use_builtin=use_builtin,
        base_url=base_url,
        api_key=api_key,
        model=model,
        temperature=temperature,
        user_id=user_id,
    )
    if not creds:
        return []
    if ctx == "mindmap_batch":
        prompt = _build_mindmap_llm_quality_prompt(
            requirements=req,
            columns=columns,
            rows=rows,
            user_content=user,
            rag_context=rag,
        )
    else:
        prompt = _build_llm_quality_prompt(
            requirements=req,
            columns=columns,
            rows=rows,
            scope_hint=scope_hint,
            user_content=user,
            validation_context=ctx,
        )
    try:
        content, reasoning = _request_validation_llm(
            base_url=creds["base_url"],
            api_key=creds["api_key"],
            model=creds["model"],
            prompt=prompt,
            temperature=creds["temperature"],
        )
    except TimeoutError:
        return [{"row_index": None, "type": "gap", "message": "AI 校验超时，请稍后重试或减少用例行数"}]
    except Exception as exc:
        return [{"row_index": None, "type": "gap", "message": f"AI 校验调用失败：{exc}"}]
    try:
        return _resolve_llm_qc_issues_empty_content_as_pass(
            content=content,
            reasoning=reasoning,
        )
    except LlmValidationParseError as exc:
        return [{"row_index": None, "type": "gap", "message": str(exc)}]


def run_validation(
    *,
    user_id: str | None,
    batch_id: str | None,
    requirements: str,
    columns: list[str],
    rows: list[list[str]],
    use_llm: bool,
    format_check: bool = True,
    use_builtin: bool,
    base_url: str = "",
    api_key: str = "",
    model: str = "",
    llm_scope_hint: str = "",
    user_content: str = "",
    required_profile: str = "default",
    template_id: str | None = None,
    ai_output_text: str = "",
    mindmap_nodes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    ensure_validation_tables()
    format_issues: list[dict[str, Any]] = []
    structure_count = 0
    required_count = 0
    if format_check:
        profile = required_profile if required_profile in ("default", "mindmap") else "default"
        if profile == "mindmap":
            format_issues = check_mindmap_format_rules(
                ai_output_text=ai_output_text,
                mindmap_nodes=mindmap_nodes or [],
            )
        else:
            format_issues = check_format_rules(columns, rows, required_profile=profile, template_id=template_id)
        if profile == "mindmap":
            structure_count = len(format_issues)
            required_count = 0
        else:
            structure_count = sum(1 for i in format_issues if i.get("type") == "structure")
            required_count = sum(1 for i in format_issues if i.get("type") == "required")
    llm_issues: list[dict[str, Any]] = []
    if use_llm:
        llm_issues = check_llm_quality(
            requirements=requirements,
            columns=columns,
            rows=rows,
            use_builtin=use_builtin,
            base_url=base_url,
            api_key=api_key,
            model=model,
            scope_hint=llm_scope_hint,
            user_content=user_content,
            user_id=user_id,
        )
    all_issues = format_issues + llm_issues

    def _do_persist():
        run_id = _new_id()
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO tc_validation_runs (id, batch_id, user_id, issue_count, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (run_id, batch_id, user_id, len(all_issues), _now()),
                )
                for issue in all_issues:
                    cur.execute(
                        """
                        INSERT INTO tc_validation_issues
                            (id, run_id, row_index, issue_type, message, dismissed, created_at)
                        VALUES (%s, %s, %s, %s, %s, 0, %s)
                        """,
                        (
                            _new_id(),
                            run_id,
                            issue.get("row_index"),
                            issue.get("type") or "format",
                            issue.get("message") or "",
                            _now(),
                        ),
                    )
        finally:
            conn.close()
        return run_id

    run_id = _persist_validation_run_with_retry(_do_persist)

    result: dict[str, Any] = {
        "run_id": run_id,
        "issue_count": len(all_issues),
        "issues": all_issues,
        "format_count": len(format_issues),
        "structure_count": structure_count,
        "required_count": required_count,
        "llm_count": len(llm_issues),
    }
    return result


def dismiss_issue(run_id: str, issue_index: int) -> None:
    ensure_validation_tables()
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM tc_validation_issues
                WHERE run_id = %s ORDER BY created_at LIMIT 1 OFFSET %s
                """,
                (run_id, max(0, issue_index)),
            )
            row = cur.fetchone()
            if row:
                cur.execute(
                    "UPDATE tc_validation_issues SET dismissed = 1 WHERE id = %s",
                    (row["id"],),
                )
    finally:
        conn.close()
