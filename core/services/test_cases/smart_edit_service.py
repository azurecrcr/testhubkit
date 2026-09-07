"""智能编辑服务：根据用户提示词对已有表格执行新增/更新操作（禁止删除）。"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Callable, Generator
from typing import Any

import requests

from core.services.test_cases.generation_stream_service import stream_chat_completions_messages
from core.services.test_cases.test_case_generator_service import generate_chat_completions_messages

REASONING_UI_LIMIT = 999999
REASONING_PUSH_INTERVAL_SEC = 0.25

SYSTEM_PROMPT = """【系统约束 — 智能编辑助手】
你是测试用例表格编辑助手。你将收到表格表头（列定义 columns）、当前表格数据快照和用户编辑指令。

## 表头与数据格式（必读）
- columns 是表格表头，定义每一列的列名与字段含义；所有 cells 的 key 必须与 columns 中的列名完全一致（区分大小写，不得自造列名、不得改名、不得增减列）
- 编辑时必须参照快照中现有行的 cells 结构与列含义填写，保持与表头一致的用例格式
- 若表格存在空行（该行所有列均无有效用例内容），必须用 update 填入从 rowIndex=0 起第一个空行，禁止对空行使用 add
- 仅当快照中每一行均已有用例内容时，才使用 add 在表尾追加；用户若要求新增多条且表已满，输出多条 add（每条 add 一个 cells），按顺序追加到表尾

## 允许的操作
- update：修改已有行的指定单元格（必须提供 rowIndex 和 cells，cells 只包含需要修改的列）
- add：仅在表格无空行时于表尾追加新行（一个 cells 代表一行；新增 N 行则输出 N 条 add，不得把多条用例塞进同一个 cells）

## 禁止的操作
- 禁止 delete、禁止清空整行、禁止修改 columns 表头定义
- 禁止输出 markdown 代码块以外的多余解释
- 禁止返回 type 为 delete 或 remove 的操作
- 禁止使用表头以外的字段名（如 title、name、step 等别名）

## 输出格式（严格 JSON，无其他文字）
{
  "summary": "一句话描述做了什么",
  "operations": [
    { "type": "update", "rowIndex": 0, "cells": { "列名": "新值" } },
    { "type": "add", "cells": { "模块": "值", "用例标题": "值", "步骤": "值" } },
    { "type": "add", "cells": { "模块": "值", "用例标题": "值", "步骤": "值" } }
  ]
}

## 数据规范
- rowIndex 从 0 开始，不得超过 rowCount - 1
- cells 的 key 必须且仅能来自【表格表头 columns】列表
- add 时应按表头尽量补全各列；暂无内容的列填 ""
- 单元格内容为纯文本，不含 HTML
- 若用户指令不明确或无法执行，返回空 operations 并在 summary 中说明原因
"""

METERSPHERE_EDIT_MODE_PROMPT = """
## MeterSphere 编辑模式约束（当前表格为 MeterSphere 表头）
- 表头包含「编辑模式」列；凡 add/update 的 cells 涉及「编辑模式」，其值必须且只能填写 STEP（全大写，禁止 STMP、Step、step 等其他写法，不得留空）
- 新增用例（add）时必须为「编辑模式」列填写 STEP
- 更新用例（update）时若修改或补全「编辑模式」列，同样必须为 STEP
"""


def _format_columns_block(columns: list[str]) -> str:
    if not columns:
        return "（无）"
    return "\n".join(f"{i}. {col}" for i, col in enumerate(columns, 1))


def _normalize_conversation_history(
    history: list[dict[str, Any]] | None,
    *,
    max_turns: int = 20,
) -> list[dict[str, str]]:
    if not history:
        return []
    out: list[dict[str, str]] = []
    for item in history:
        if not isinstance(item, dict):
            continue
        user = str(item.get("user_prompt") or item.get("user") or "").strip()
        if not user:
            continue
        summary = str(
            item.get("assistant_summary")
            or item.get("summary")
            or item.get("assistant")
            or ""
        ).strip()
        assistant_content = str(item.get("assistant_content") or "").strip()
        operations = item.get("operations")
        if not isinstance(operations, list):
            operations = []
        out.append(
            {
                "user_prompt": user,
                "assistant_summary": summary,
                "assistant_content": assistant_content,
                "operations": operations,
            }
        )
        if len(out) >= max_turns:
            break
    return out


def _format_conversation_history_block(history: list[dict[str, str]] | None) -> str:
    if not history:
        return ""
    blocks: list[str] = []
    for idx, item in enumerate(history, 1):
        user = str(item.get("user_prompt") or "").strip()
        if not user:
            continue
        summary = str(item.get("assistant_summary") or "").strip()
        block = f"第{idx}轮\n用户：{user}"
        if summary:
            block += f"\n助手：{summary}"
        blocks.append(block)
    if not blocks:
        return ""
    return (
        "\n\n【本次会话中先前的编辑对话（仅供理解当前指令；"
        "实际编辑必须以当前表格快照为准）】\n"
        + "\n\n".join(blocks)
    )


def _build_system_content(is_metersphere_headers: bool) -> str:
    content = SYSTEM_PROMPT
    if is_metersphere_headers:
        content += METERSPHERE_EDIT_MODE_PROMPT
    return content

def _build_snapshot_context_block(table_snapshot: dict[str, Any]) -> str:
    columns = list(table_snapshot.get("columns") or [])
    headers_block = _format_columns_block(columns)
    snapshot_json = json.dumps(table_snapshot, ensure_ascii=False, indent=2)
    return (
        "【表格表头 columns（cells 的 key 必须且仅能使用以下列名）】\n"
        + headers_block
        + "\n\n【当前表格数据快照】\n"
        + "说明：快照 JSON 含 columns（表头）、rows（行数据）、rowCount（行数）；"
        + "rows 中每行以 cells 对象存储，key 为表头列名。\n"
        + snapshot_json
    )

def _build_history_assistant_content(item: dict[str, str]) -> str:
    raw = str(item.get("assistant_content") or "").strip()
    if raw:
        return raw
    summary = str(item.get("assistant_summary") or "").strip()
    operations = item.get("operations")
    if not isinstance(operations, list):
        operations = []
    if summary or operations:
        return json.dumps(
            {"summary": summary or "已完成编辑", "operations": operations},
            ensure_ascii=False,
        )
    return ""

def _build_current_user_content(
    user_prompt: str,
    table_snapshot: dict[str, Any],
    *,
    visual_context_id: str | None = None,
    user_id: str | None = None,
) -> str:
    from core.services.visual_attachments.context_builder import (
        inject_attachment_context_into_prompt,
    )

    effective_user_prompt = inject_attachment_context_into_prompt(
        user_prompt, visual_context_id, user_id
    )
    user = str(effective_user_prompt or "").strip()
    return (
        _build_snapshot_context_block(table_snapshot)
        + "\n\n【用户编辑指令（本轮）】\n"
        + user
    )

def build_edit_chat_messages(
    user_prompt: str,
    table_snapshot: dict[str, Any],
    *,
    is_metersphere_headers: bool = False,
    visual_context_id: str | None = None,
    user_id: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
) -> list[dict[str, str]]:
    history = _normalize_conversation_history(conversation_history)
    messages: list[dict[str, str]] = [
        {"role": "system", "content": _build_system_content(is_metersphere_headers)}
    ]
    for item in history:
        messages.append({"role": "user", "content": item["user_prompt"]})
        assistant = _build_history_assistant_content(item)
        if assistant:
            messages.append({"role": "assistant", "content": assistant})
    messages.append(
        {
            "role": "user",
            "content": _build_current_user_content(
                user_prompt,
                table_snapshot,
                visual_context_id=visual_context_id,
                user_id=user_id,
            ),
        }
    )
    return messages

def build_edit_prompt(
    user_prompt: str,
    table_snapshot: dict[str, Any],
    *,
    is_metersphere_headers: bool = False,
    visual_context_id: str | None = None,
    user_id: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
) -> str:
    from core.services.visual_attachments.context_builder import (
        inject_attachment_context_into_prompt,
    )

    effective_user_prompt = inject_attachment_context_into_prompt(
        user_prompt, visual_context_id, user_id
    )
    columns = list(table_snapshot.get("columns") or [])
    headers_block = _format_columns_block(columns)
    snapshot_json = json.dumps(table_snapshot, ensure_ascii=False, indent=2)
    user = str(effective_user_prompt or "").strip()
    system_prompt = SYSTEM_PROMPT
    if is_metersphere_headers:
        system_prompt += METERSPHERE_EDIT_MODE_PROMPT
    return (
        system_prompt
        + "\n\n【表格表头 columns（cells 的 key 必须且仅能使用以下列名）】\n"
        + headers_block
        + "\n\n【当前表格数据快照】\n"
        + "说明：快照 JSON 含 columns（表头）、rows（行数据）、rowCount（行数）；"
        + "rows 中每行以 cells 对象存储，key 为表头列名。\n"
        + snapshot_json
        + _format_conversation_history_block(
            _normalize_conversation_history(conversation_history)
        )
        + "\n\n【用户编辑指令（本轮）】\n"
        + user
    )


def _trim_reasoning_text(text: str, limit: int = REASONING_UI_LIMIT) -> str:
    raw = str(text or "").strip()
    if len(raw) <= limit:
        return raw
    return raw[-limit:]


def _extract_edit_stream_thinking_prefix(buf: str) -> str:
    """从 content 流中提取 JSON 输出前的分析文字（无 reasoning 字段的模型）。"""
    raw = str(buf or "")
    if not raw.strip():
        return ""
    fence = re.search(r"```(?:json)?\s*\n?\s*\{", raw, re.IGNORECASE)
    if fence and fence.start() > 0:
        prefix = raw[: fence.start()].strip()
        return prefix if len(prefix) >= 6 else ""
    idx = raw.find("{")
    if idx > 0:
        prefix = raw[:idx].strip()
        return prefix if len(prefix) >= 6 else ""
    if idx == 0:
        return ""
    if "{" in raw:
        return ""
    preview = raw.strip()
    return preview if len(preview) >= 6 else ""


def _extract_json_object(text: str) -> dict[str, Any]:
    raw = str(text or "").strip()
    if not raw:
        raise ValueError("AI 返回为空")
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw, re.IGNORECASE)
    if fence:
        raw = fence.group(1).strip()
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        try:
            data = json.loads(raw[start : end + 1])
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError as exc:
            raise ValueError(f"AI 返回不是合法 JSON: {exc}") from exc
    raise ValueError("无法从 AI 响应中解析 JSON 对象")


def validate_edit_response(data: dict[str, Any], table_snapshot: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("响应必须是 JSON 对象")
    columns = list(table_snapshot.get("columns") or [])
    if not columns:
        raise ValueError("表格列定义为空")
    col_set = set(columns)
    row_count = int(table_snapshot.get("rowCount") or len(table_snapshot.get("rows") or []))

    summary = str(data.get("summary") or "").strip() or "已完成编辑"
    ops_in = data.get("operations")
    if ops_in is None:
        ops_in = []
    if not isinstance(ops_in, list):
        raise ValueError("operations 必须是数组")

    validated: list[dict[str, Any]] = []
    for i, op in enumerate(ops_in):
        if not isinstance(op, dict):
            raise ValueError(f"operations[{i}] 必须是对象")
        op_type = str(op.get("type") or "").strip().lower()
        if op_type in ("delete", "remove", "drop"):
            raise ValueError(f"禁止删除操作: operations[{i}]")
        if op_type not in ("update", "add"):
            raise ValueError(f"不支持的操作类型: {op_type}")
        cells = op.get("cells")
        if not isinstance(cells, dict):
            raise ValueError(f"operations[{i}].cells 必须是对象")
        clean_cells: dict[str, str] = {}
        for k, v in cells.items():
            key = str(k)
            if key not in col_set:
                continue
            clean_cells[key] = str(v if v is not None else "")
        if op_type == "update":
            if "rowIndex" not in op:
                raise ValueError(f"update 操作缺少 rowIndex: operations[{i}]")
            try:
                row_index = int(op["rowIndex"])
            except (TypeError, ValueError) as exc:
                raise ValueError(f"rowIndex 必须是整数: operations[{i}]") from exc
            if row_index < 0 or row_index >= row_count:
                raise ValueError(
                    f"rowIndex 越界: {row_index}，有效范围 0..{max(0, row_count - 1)}"
                )
            if not clean_cells:
                raise ValueError(f"update 操作未包含有效列: operations[{i}]")
            validated.append({"type": "update", "rowIndex": row_index, "cells": clean_cells})
        else:
            validated.append({"type": "add", "cells": clean_cells})

    return {"summary": summary, "operations": validated}



def _build_vision_edit_messages(
    user_prompt: str,
    table_snapshot: dict[str, Any],
    *,
    is_metersphere_headers: bool = False,
    visual_context_id: str | None = None,
    user_id: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    from core.services.visual_attachments.asset_frames import load_vision_frames_for_context
    import base64

    if not visual_context_id:
        raise ValueError("缺少视觉附件上下文")
    frames, txt_inline = load_vision_frames_for_context(visual_context_id, user_id)
    if not frames and not txt_inline:
        raise ValueError("附件无有效视觉内容")

    system_text = _build_system_content(is_metersphere_headers)
    snapshot_text = _build_snapshot_context_block(table_snapshot)
    history = _normalize_conversation_history(conversation_history)
    history_text = _format_conversation_history_block(history)
    user_text = str(user_prompt or "").strip()

    text_parts = [system_text, snapshot_text]
    if history_text:
        text_parts.append(history_text)
    if txt_inline:
        text_parts.append("【文本文档附件（已内联）】\n" + "\n".join(txt_inline))
    text_parts.append("【用户编辑指令（本轮）】\n" + user_text)
    text_parts.append(
        "请结合上方附件图片/文档与表格快照，直接输出严格 JSON 编辑结果，不要 Markdown 代码块外的解释。"
    )

    content: list[dict[str, Any]] = [{"type": "text", "text": "\n\n".join(text_parts)}]
    for label, image_bytes, mime_type in frames:
        if label:
            content.append({"type": "text", "text": label})
        b64 = base64.b64encode(image_bytes).decode("ascii")
        mime = mime_type or "image/jpeg"
        content.append(
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}
        )
    return [{"role": "user", "content": content}]


def _iter_edit_model_stream(
    *,
    use_vision: bool,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float | None,
    vision_cfg: dict[str, Any] | None = None,
    should_cancel=None,
):
    if use_vision:
        from core.services.visual_attachments.vision_client import vision_stream_chat_messages

        cfg = vision_cfg or {"base_url": base_url, "api_key": api_key, "model": model}
        yield from vision_stream_chat_messages(
            cfg,
            messages,
            temperature=temperature,
            should_cancel=should_cancel,
        )
        return
    yield from stream_chat_completions_messages(
        base_url,
        api_key,
        model,
        messages,
        temperature=temperature,
        should_cancel=should_cancel,
    )


def iter_smart_edit_stream_events(
    *,
    base_url: str,
    api_key: str,
    model: str,
    user_prompt: str,
    table_snapshot: dict[str, Any],
    temperature: float | None = 0.1,
    is_metersphere_headers: bool = False,
    visual_context_id: str | None = None,
    user_id: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
    should_cancel: Callable[[], bool] | None = None,
    use_vision: bool = False,
    vision_cfg: dict[str, Any] | None = None,
) -> Generator[dict[str, Any], None, None]:
    """流式智能编辑：仅向前端推送临时思考内容，不落库、不写日志。"""
    if use_vision and visual_context_id:
        messages = _build_vision_edit_messages(
            user_prompt,
            table_snapshot,
            is_metersphere_headers=is_metersphere_headers,
            visual_context_id=visual_context_id,
            user_id=user_id,
            conversation_history=conversation_history,
        )
    else:
        messages = build_edit_chat_messages(
            user_prompt,
            table_snapshot,
            is_metersphere_headers=is_metersphere_headers,
            visual_context_id=None,
            user_id=user_id,
            conversation_history=conversation_history,
        )
    reasoning_parts: list[str] = []
    content_parts: list[str] = []
    last_reasoning_push = 0.0
    last_content_thinking_push = 0.0

    try:
        for stream_kind, delta in _iter_edit_model_stream(
            use_vision=bool(use_vision and visual_context_id),
            base_url=base_url,
            api_key=api_key,
            model=model,
            messages=messages,
            temperature=temperature,
            vision_cfg=vision_cfg,
            should_cancel=should_cancel,
        ):
            if should_cancel and should_cancel():
                yield {"type": "error", "error": "已取消编辑请求"}
                return
            if stream_kind == "reasoning":
                reasoning_parts.append(delta)
                now = time.time()
                if now - last_reasoning_push < REASONING_PUSH_INTERVAL_SEC:
                    continue
                last_reasoning_push = now
                text = _trim_reasoning_text("".join(reasoning_parts))
                if text:
                    yield {"type": "reasoning", "content": text, "replace": True}
                continue
            if stream_kind != "content":
                continue
            content_parts.append(delta)
            if reasoning_parts:
                continue
            full_content = "".join(content_parts)
            if "{" in full_content:
                continue
            now = time.time()
            if now - last_content_thinking_push < REASONING_PUSH_INTERVAL_SEC:
                continue
            thinking = _extract_edit_stream_thinking_prefix(full_content)
            if not thinking:
                continue
            last_content_thinking_push = now
            yield {
                "type": "reasoning",
                "content": _trim_reasoning_text(thinking),
                "replace": True,
            }

        raw = "".join(content_parts)
        if not raw.strip():
            yield {"type": "error", "error": "AI 返回为空"}
            return
        parsed = _extract_json_object(raw)
        validated = validate_edit_response(parsed, table_snapshot)
        yield {
            "type": "done",
            "success": True,
            "summary": validated["summary"],
            "operations": validated["operations"],
        }
    except ValueError as exc:
        yield {"type": "error", "error": str(exc)}
    except requests.exceptions.RequestException as exc:
        yield {"type": "error", "error": f"API请求失败: {str(exc)}"}
    except Exception as exc:
        yield {"type": "error", "error": str(exc)}


def run_smart_edit(
    *,
    base_url: str,
    api_key: str,
    model: str,
    user_prompt: str,
    table_snapshot: dict[str, Any],
    temperature: float | None = 0.1,
    is_metersphere_headers: bool = False,
    visual_context_id: str | None = None,
    user_id: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
    use_vision: bool = False,
    vision_cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if use_vision and visual_context_id:
        messages = _build_vision_edit_messages(
            user_prompt,
            table_snapshot,
            is_metersphere_headers=is_metersphere_headers,
            visual_context_id=visual_context_id,
            user_id=user_id,
            conversation_history=conversation_history,
        )
        parts: list[str] = []
        for stream_kind, delta in _iter_edit_model_stream(
            use_vision=True,
            base_url=base_url,
            api_key=api_key,
            model=model,
            messages=messages,
            temperature=temperature,
            vision_cfg=vision_cfg,
        ):
            if stream_kind == "content":
                parts.append(delta)
        raw = "".join(parts)
    else:
        messages = build_edit_chat_messages(
            user_prompt,
            table_snapshot,
            is_metersphere_headers=is_metersphere_headers,
            visual_context_id=None,
            user_id=user_id,
            conversation_history=conversation_history,
        )
        raw = generate_chat_completions_messages(
            base_url,
            api_key,
            model,
            messages,
            temperature=temperature,
        )
    parsed = _extract_json_object(raw)
    validated = validate_edit_response(parsed, table_snapshot)
    return {
        "success": True,
        "summary": validated["summary"],
        "operations": validated["operations"],
        "raw": raw,
    }
