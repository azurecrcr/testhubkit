"""AI 将工作台表格用例转换为要素分类法思维导图（与规则引擎 convert_table_to_mindmap 隔离）。"""

from __future__ import annotations

import json
import re
from typing import Any, Callable

from core.services.test_cases.smart_edit_service import (
    REASONING_PUSH_INTERVAL_SEC,
    _extract_edit_stream_thinking_prefix,
    _trim_reasoning_text,
)
from core.services.test_cases.test_case_generator_service import generate_chat_completions_messages

AI_TABLE_TO_MINDMAP_SYSTEM_PROMPT = """【系统角色】
你是资深测试架构师，专职将结构化测试用例表格转换为「要素分类法」思维导图。

【硬性输出约束 — 必须 100% 遵守，违反任一条即视为失败】
1. 只允许输出思维导图层级纯文本；禁止 JSON、Python、Markdown 代码块、表格、编号列表、解释性文字、前后导语。
2. 缩进必须严格按 4 空格一级：第二层 4 空格、第三层 8 空格、第四层 12 空格（要素取值）、第五层 16 空格 + TC:
3. 第一行必须是：测试用例
4. 第二层节点 = 测试对象，标题后必须带（测试对象）
5. 第三层节点 = 测试要素，标题后必须带（测试要素）
6. 第三层下的子节点 = 要素取值（如：空值、少于6位、正确格式）
7. TC: 或 TC： 开头 + 用例名称（对应用例名称列），位于要素取值之下（16 空格）或测试要素之下（12 空格）
8. 必须覆盖输入表格中每一条有效用例，不得遗漏；不得编造表格中不存在的用例
9. 严禁胡思乱想：仅依据输入表格用例进行转换，不得臆造、推测或补充表格中未出现的用例、步骤、预期、模块或业务场景
10. 根据「所属模块/模块/产品」归纳测试对象；从步骤描述、前置条件、预期结果提取测试要素与要素取值（信息不足时用「未分类」占位，禁止自行补全细节）
11. 禁止输出 test_cases= 或 [[...]] 列表格式

【输出格式示例（仅作结构参考，内容必须来自输入表格；请用空格缩进，不要用 └── 树形符号）】
测试用例
    登录页（测试对象）
        密码输入框（测试要素）
            空值
                TC: 密码为空时点击登录提示必填
            少于6位
                TC: 密码长度不足时提示格式错误
            正确格式
                TC: 输入合法密码可正常提交

【再次强调】
- 只输出上述格式的完整导图文本，不要任何其他内容
- 每条 TC: 行必须对应输入表格中的一条用例
- 严禁脱离表格胡思乱想，所有节点文案必须能从表格列值中找到依据
- 若无法归类，测试对象用「未分类（测试对象）」
"""

AI_TABLE_TO_MINDMAP_OUTPUT_BLOCK = """【输出格式要求 — 必须严格执行】
请按要素分类法输出完整思维导图纯文本（仅空格缩进，禁止 └── 树形符号）：
测试用例 → 测试对象（测试对象） → 测试要素（测试要素） → 要素取值 → TC:用例名称

缩进规则（每层 4 空格）：
- 第 1 层（0 空格）：测试用例
- 第 2 层（4 空格）：xxx（测试对象）
- 第 3 层（8 空格）：xxx（测试要素）
- 第 4 层（12 空格）：要素取值名称
- 第 5 层（16 空格）：TC:用例名称

若无独立要素取值层，可将 TC: 放在第 4 层（12 空格）。
禁止输出 JSON、Python 列表、Markdown、解释文字。仅输出完整导图层级文本。

【转换边界 — 严禁胡思乱想】
仅依据上方「当前表格用例」JSON 进行转换：不得编造、推测或补充表格中未出现的用例、步骤、预期或业务场景；测试对象与测试要素只能从表格列值归纳，不得引入表格外知识。"""


def _cell_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\r\n", "\n").replace("\r", "\n").strip()


def _normalize_columns(columns: list[Any]) -> list[str]:
    return [str(c) for c in columns if str(c).strip()]


def _normalize_rows(columns: list[str], rows: list[Any]) -> list[list[str]]:
    out: list[list[str]] = []
    col_count = len(columns)
    name_candidates = ("用例名称", "用例标题", "用例摘要", "标题")
    name_idx = 0
    for i, col in enumerate(columns):
        if col in name_candidates:
            name_idx = i
            break
    for row in rows:
        if not isinstance(row, (list, tuple)):
            continue
        cells = [_cell_str(v) for v in row]
        while len(cells) < col_count:
            cells.append("")
        if col_count:
            cells = cells[:col_count]
        if not any(cells):
            continue
        if not _cell_str(cells[name_idx] if name_idx < len(cells) else ""):
            continue
        out.append(cells)
    return out


def _build_table_cases_block(columns: list[str], rows: list[list[str]]) -> str:
    cases = []
    for i, cells in enumerate(rows):
        item = {"rowIndex": i}
        for j, col in enumerate(columns):
            item[col] = cells[j] if j < len(cells) else ""
        cases.append(item)
    payload = {
        "columns": columns,
        "rowCount": len(cases),
        "cases": cases,
    }
    return (
        "【当前表格用例（JSON，必须全部纳入导图）】\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)
    )


def _load_mindmap_rule() -> str:
    try:
        from core.services.test_cases.system_prompt_db import get_tc_system_prompt

        rule = get_tc_system_prompt("mindmap_rule_preset")
        return str(rule or "").strip()
    except Exception:
        return ""


def build_ai_table_to_mindmap_messages(
    columns: list[str],
    rows: list[list[str]],
    *,
    root_topic: str = "测试用例",
) -> list[dict[str, str]]:
    parts = [
        _build_table_cases_block(columns, rows),
        AI_TABLE_TO_MINDMAP_OUTPUT_BLOCK,
        f"根节点标题固定为：{root_topic or '测试用例'}",
        "请立即输出完整思维导图层级文本，不要输出任何解释；严格仅按上方表格用例转换，禁止胡思乱想或补充表格外内容。",
    ]
    rule = _load_mindmap_rule()
    if rule:
        parts.insert(1, "【补充规则】\n" + rule)
    return [
        {"role": "system", "content": AI_TABLE_TO_MINDMAP_SYSTEM_PROMPT},
        {"role": "user", "content": "\n\n".join(parts)},
    ]




import time
from collections.abc import Generator

import requests

from core.services.test_cases.generation_stream_service import stream_chat_completions_messages

AI_TABLE_STREAM_PUSH_SEC = 0.06



_RE_TREE_PREFIX = re.compile(
    r"^(\s*)(?:[|│├└─\-]+\s*)*(.+)$"
)


def _normalize_ai_table_mindmap_outline_text(text: str) -> str:
    """将树形符号行转为空格缩进大纲，便于校验与前端 parseMindmapElementClassificationResult 对齐。"""
    raw = str(text or "")
    if not raw.strip():
        return raw
    out_lines: list[str] = []
    for raw_line in raw.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            out_lines.append("")
            continue
        m = _RE_TREE_PREFIX.match(line)
        if not m:
            out_lines.append(line)
            continue
        lead, body = m.group(1), m.group(2).strip()
        if not body:
            out_lines.append(line)
            continue
        # 每个树形连接符层级约等于 4 空格
        tree_depth = len(re.findall(r"[|│├└]", line)) or 0
        base_cols = sum(4 if ch == "\t" else 1 for ch in lead)
        depth_cols = max(base_cols, tree_depth * 4)
        if re.match(r"^TC\s*[:：]", body, re.I):
            depth_cols = max(depth_cols, 12)
        out_lines.append(" " * depth_cols + body)
    normalized = "\n".join(out_lines)
    if normalized and not normalized.endswith("\n"):
        normalized += "\n"
    return normalized


def check_ai_table_to_mindmap_output_format(ai_output_text: str) -> list[dict[str, Any]]:
    """表格 AI 转导图专用格式校验：与前端 parseMindmapElementClassificationResult 对齐，允许 TC 在 8/12/16 空格层级。"""
    from core.services.test_cases.incremental_case_parser import (
        _is_mindmap_noise_line,
        _is_mindmap_outline_line,
        _line_indent_cols,
        extract_mindmap_parseable_text,
    )

    issues: list[dict[str, Any]] = []
    text = _normalize_ai_table_mindmap_outline_text(
        extract_mindmap_parseable_text(str(ai_output_text or "").strip())
    )
    if not text.strip():
        issues.append(
            {
                "row_index": None,
                "type": "structure",
                "message": "缺少 AI 输出原文，无法检查导图格式",
            }
        )
        return issues

    if not re.search(r"TC\s*[:：]", text, re.IGNORECASE):
        issues.append(
            {
                "row_index": None,
                "type": "structure",
                "message": "AI 输出中未找到 TC: 用例行",
            }
        )
        return issues

    line_no = 0
    for raw_line in text.splitlines():
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
            elif cols < 8 or cols > 48:
                issues.append(
                    {
                        "row_index": None,
                        "type": "structure",
                        "message": f"第 {line_no} 行：TC: 用例缩进层级异常（应为 8/12/16 空格等等）",
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




def _extract_mindmap_text_response(raw: str) -> tuple[str, str]:
    """AI 表格转导图专用：从模型原始输出提取 summary 与导图正文（不依赖 mindmap_smart_edit）。"""
    from core.services.test_cases.incremental_case_parser import extract_mindmap_parseable_text

    text = str(raw or "").strip()
    if not text:
        return "", ""

    mindmap_text = extract_mindmap_parseable_text(text)
    if not mindmap_text.strip():
        mindmap_text = text

    summary = ""
    first_mind_line = ""
    for line in mindmap_text.splitlines():
        if str(line).strip():
            first_mind_line = str(line).strip()
            break
    if first_mind_line and first_mind_line in text:
        prefix = text.split(first_mind_line, 1)[0].strip()
    else:
        prefix = text
    if prefix:
        thinking = _extract_edit_stream_thinking_prefix(prefix)
        if thinking:
            prefix = prefix.replace(thinking, "", 1).strip()
        for line in prefix.splitlines():
            stripped = str(line).strip()
            if not stripped:
                continue
            if stripped == first_mind_line:
                break
            if re.match(r"^测试用例\s*$", stripped):
                continue
            if len(stripped) <= 160:
                summary = stripped
                break

    tc_count = len(re.findall(r"^\s*TC\s*[:：]", mindmap_text, re.MULTILINE | re.IGNORECASE))
    if not summary:
        summary = f"已生成 {tc_count} 条 TC 用例节点" if tc_count else "AI 转导图完成"
    return summary, mindmap_text


def _finalize_ai_table_mindmap_text(raw: str) -> dict[str, Any]:
    summary, mindmap_text = _extract_mindmap_text_response(raw)
    mindmap_text = _normalize_ai_table_mindmap_outline_text(mindmap_text)
    format_issues = check_ai_table_to_mindmap_output_format(mindmap_text)
    critical = [i for i in format_issues if i.get("type") == "structure"]
    if critical:
        preview = critical[0].get("message") or "格式不符合要求"
        raise ValueError(f"AI 返回格式校验失败：{preview}")
    tc_count = len(re.findall(r"^\s*TC\s*[:：]", mindmap_text, re.MULTILINE | re.IGNORECASE))
    return {
        "success": True,
        "summary": summary,
        "mindmap_text": mindmap_text,
        "stats": {"tc_lines": tc_count},
    }


def iter_ai_table_to_mindmap_stream_events(
    *,
    base_url: str,
    api_key: str,
    model: str,
    columns: list[Any],
    rows: list[Any],
    temperature: float | None = 0.2,
    root_topic: str = "测试用例",
    should_cancel: Callable[[], bool] | None = None,
) -> Generator[dict[str, Any], None, None]:
    norm_columns = _normalize_columns(list(columns or []))
    if not norm_columns:
        yield {"type": "error", "error": "缺少表头 columns"}
        return
    norm_rows = _normalize_rows(norm_columns, list(rows or []))
    if not norm_rows:
        yield {"type": "error", "error": "未找到有效用例行（需包含用例名称）"}
        return

    messages = build_ai_table_to_mindmap_messages(norm_columns, norm_rows, root_topic=root_topic)
    content_parts: list[str] = []
    reasoning_parts: list[str] = []
    last_push = 0.0
    last_reasoning_push = 0.0
    last_content_thinking_push = 0.0

    try:
        for stream_kind, delta in stream_chat_completions_messages(
            base_url,
            api_key,
            model,
            messages,
            temperature=temperature,
            should_cancel=should_cancel,
        ):
            if should_cancel and should_cancel():
                yield {"type": "cancelled", "error": "已取消转换"}
                return
            if stream_kind == "reasoning":
                reasoning_parts.append(delta)
                now = time.time()
                if now - last_reasoning_push < REASONING_PUSH_INTERVAL_SEC:
                    continue
                last_reasoning_push = now
                reasoning_text = _trim_reasoning_text("".join(reasoning_parts))
                if reasoning_text:
                    yield {"type": "reasoning", "content": reasoning_text, "replace": True}
                continue
            if stream_kind != "content":
                continue
            content_parts.append(delta)
            full = "".join(content_parts)
            if re.search(r"TC\s*[:：]", full, re.IGNORECASE):
                now = time.time()
                if now - last_push < AI_TABLE_STREAM_PUSH_SEC:
                    continue
                last_push = now
                if full.strip():
                    yield {"type": "content", "content": full, "replace": True}
                continue
            if reasoning_parts:
                continue
            now = time.time()
            if now - last_content_thinking_push < REASONING_PUSH_INTERVAL_SEC:
                continue
            thinking = _extract_edit_stream_thinking_prefix(full)
            if not thinking:
                continue
            last_content_thinking_push = now
            yield {
                "type": "reasoning",
                "content": _trim_reasoning_text(thinking),
                "replace": True,
            }

        if should_cancel and should_cancel():
            yield {"type": "cancelled", "error": "已取消转换"}
            return
        raw = "".join(content_parts)
        if raw.strip():
            yield {"type": "content", "content": raw, "replace": True}
        result = _finalize_ai_table_mindmap_text(raw)
        stats = dict(result.get("stats") or {})
        stats["input_rows"] = len(norm_rows)
        yield {
            "type": "done",
            "success": True,
            "summary": result.get("summary"),
            "mindmap_text": result.get("mindmap_text"),
            "stats": stats,
        }
    except ValueError as exc:
        yield {"type": "error", "error": str(exc)}
    except requests.exceptions.RequestException as exc:
        yield {"type": "error", "error": f"API请求失败: {str(exc)}"}
    except Exception as exc:
        yield {"type": "error", "error": str(exc)}

def run_ai_table_to_mindmap(
    *,
    base_url: str,
    api_key: str,
    model: str,
    columns: list[Any],
    rows: list[Any],
    temperature: float | None = 0.2,
    root_topic: str = "测试用例",
) -> dict[str, Any]:
    norm_columns = _normalize_columns(list(columns or []))
    if not norm_columns:
        raise ValueError("缺少表头 columns")
    norm_rows = _normalize_rows(norm_columns, list(rows or []))
    if not norm_rows:
        raise ValueError("未找到有效用例行（需包含用例名称）")

    messages = build_ai_table_to_mindmap_messages(
        norm_columns, norm_rows, root_topic=root_topic
    )
    raw = generate_chat_completions_messages(
        base_url,
        api_key,
        model,
        messages,
        temperature=temperature,
    )
    result = _finalize_ai_table_mindmap_text(raw)
    stats = dict(result.get("stats") or {})
    stats["input_rows"] = len(norm_rows)
    result["stats"] = stats
    result["raw"] = raw
    return result
