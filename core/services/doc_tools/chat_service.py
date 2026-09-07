"""文档工具 AI 编辑服务（与用户个人文本 AI 配置隔离）。"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Generator
from typing import Any

import requests

from core.services.doc_tools.response_service import (
    parse_doc_tools_ai_response,
    validate_doc_tools_matrix_against_source,
)
from core.services.test_cases.generation_stream_service import stream_chat_completions_messages

REASONING_PUSH_INTERVAL_SEC = 0.25

DOC_TOOLS_EDIT_SYSTEM_PROMPT = """【系统约束 — 文档工具表格 AI 编辑助手】

你必须认真、完整、准确地执行用户的编辑指令，并在编辑完成后返回整张表格的全部数据。

## 输入说明
- 你将收到当前表格 matrix（二维字符串数组，行优先，含全部单元格）
- 以及用户的编辑指令（可能附带历史对话）

## 输出格式（强制 — 违反以下任一条均视为失败）

你的最终回复有且仅有一个 JSON 对象。
禁止在 JSON 之外输出任何文字、解释、标题、注释或 markdown 代码块标记（禁止 ```json）。

JSON 结构必须严格如下，字段名不可更改、不可缺失、不可增加其他顶层字段：

{
  "summary": "一句话中文说明本次编辑做了什么",
  "matrix": [
    ["第1行第1列", "第1行第2列"],
    ["第2行第1列", "第2行第2列"]
  ]
}

## matrix 字段（强制）
- matrix 必须是二维字符串数组，表示编辑后的完整表格
- 必须包含所有行、所有列，不得省略任何行或列
- 每一行的列数必须完全相同
- 默认列数必须与输入表格一致，除非用户明确要求增加或删除列
- 空单元格必须使用空字符串 ""
- 禁止用 "..." / "其余不变" / "省略" 等方式跳过数据
- 禁止只返回 diff、patch、operations 或部分行

## summary 字段（强制）
- 必须是简短中文，描述实际完成的编辑

## 执行要求
- 先理解用户指令，再对整张表做完整编辑
- 若指令不明确，仍须返回完整 matrix（可在 summary 中说明假设）"""


def _normalize_history(history: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    if not history:
        return []
    out: list[dict[str, str]] = []
    for item in history:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        text = str(item.get("text") or item.get("content") or "").strip()
        if role not in {"user", "assistant"} or not text:
            continue
        out.append({"role": role, "text": text})
    return out[-20:]


def _extract_stream_status_prefix(buf: str) -> str:
    raw = str(buf or "")
    if not raw.strip():
        return ""
    fence = re.search(r"```(?:json)?\s*\n?\s*\{", raw, re.IGNORECASE)
    if fence and fence.start() > 0:
        prefix = raw[: fence.start()].strip()
        return prefix if len(prefix) >= 4 else ""
    idx = raw.find("{")
    if idx > 0:
        prefix = raw[:idx].strip()
        return prefix if len(prefix) >= 4 else ""
    if idx == 0 or "{" in raw:
        return ""
    preview = raw.strip()
    return preview if len(preview) >= 4 else ""


def build_chat_messages(
    user_message: str,
    table_matrix: list[list[str]],
    *,
    conversation_history: list[dict[str, Any]] | None = None,
) -> list[dict[str, str]]:
    matrix_json = json.dumps(table_matrix, ensure_ascii=False)
    if len(matrix_json) > 120000:
        matrix_json = matrix_json[:120000] + "…（表格过大，已截断）"
    system_text = (
        DOC_TOOLS_EDIT_SYSTEM_PROMPT
        + "\n\n【当前表格 matrix JSON（输入快照，编辑后须在 matrix 字段返回完整结果）】\n"
        + matrix_json
    )
    messages: list[dict[str, str]] = [{"role": "system", "content": system_text}]
    for turn in _normalize_history(conversation_history):
        messages.append({"role": turn["role"], "content": turn["text"]})
    messages.append({"role": "user", "content": user_message})
    return messages


def iter_doc_tools_chat_stream_events(
    *,
    base_url: str,
    api_key: str,
    model: str,
    user_message: str,
    table_matrix: list[list[str]],
    temperature: float | None = 0.1,
    conversation_history: list[dict[str, Any]] | None = None,
) -> Generator[dict[str, Any], None, None]:
    messages = build_chat_messages(
        user_message,
        table_matrix,
        conversation_history=conversation_history,
    )
    reasoning_parts: list[str] = []
    content_parts: list[str] = []
    last_reasoning_push = 0.0
    last_status_push = 0.0

    try:
        for stream_kind, delta in stream_chat_completions_messages(
            base_url,
            api_key,
            model,
            messages,
            temperature=temperature,
        ):
            if stream_kind == "reasoning":
                reasoning_parts.append(delta)
                now = time.time()
                if now - last_reasoning_push < REASONING_PUSH_INTERVAL_SEC:
                    continue
                last_reasoning_push = now
                text = "".join(reasoning_parts).strip()
                if text:
                    yield {"type": "reasoning", "content": text, "replace": True}
                continue
            if stream_kind != "content":
                continue
            content_parts.append(delta)
            full_content = "".join(content_parts)
            if "{" in full_content:
                yield {"type": "parsing", "content": "正在解析 AI 返回的表格数据…", "replace": True}
                continue
            now = time.time()
            if now - last_status_push < REASONING_PUSH_INTERVAL_SEC:
                continue
            prefix = _extract_stream_status_prefix(full_content)
            if prefix:
                last_status_push = now
                yield {"type": "status", "content": prefix, "replace": True}

        raw = "".join(content_parts).strip()
        if not raw:
            yield {"type": "error", "error": "AI 返回为空"}
            return
        parsed = parse_doc_tools_ai_response(raw)
        matrix = validate_doc_tools_matrix_against_source(
            parsed["matrix"],
            table_matrix if isinstance(table_matrix, list) else None,
        )
        yield {
            "type": "done",
            "success": True,
            "summary": parsed["summary"],
            "matrix": matrix,
            "content": parsed["summary"],
        }
    except ValueError as exc:
        yield {"type": "error", "error": str(exc)}
    except requests.exceptions.RequestException as exc:
        yield {"type": "error", "error": f"API请求失败: {str(exc)}"}
    except Exception as exc:
        yield {"type": "error", "error": str(exc)}
