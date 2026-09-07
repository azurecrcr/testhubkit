"""思维导图智能编辑服务（与表格 smart_edit_service 完全隔离）。"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Callable, Generator
from typing import Any

import requests

from core.services.test_cases.generation_stream_service import stream_chat_completions_messages
from core.services.test_cases.smart_edit_service import (
    REASONING_PUSH_INTERVAL_SEC,
    _extract_edit_stream_thinking_prefix,
    _extract_json_object,
    _trim_reasoning_text,
)
from core.services.test_cases.test_case_generator_service import generate_chat_completions_messages

MINDMAP_EDIT_SYSTEM_PROMPT = """【系统约束 — 思维导图智能编辑助手】
你是测试用例思维导图编辑助手。你将收到当前思维导图全部用例（JSON 快照）和用户编辑指令。

## 表头与数据格式（必读）
- columns 是导图用例表头，定义每一列的列名与字段含义；所有 cells 的 key 必须与 columns 中的列名完全一致（区分大小写，不得自造列名）
- cases 中每行含 rowIndex 与 cells，代表导图中的一条用例叶子节点
- 「所属模块」列表示要素分类路径，多级用 " / " 分隔（如「登录 / 账号」），对应导图分支层级

## 允许的操作
- update：修改已有用例行（必须提供 rowIndex 和 cells，cells 只包含需要修改的列）
- add：在导图用例列表末尾追加新用例行（一个 cells 代表一行；新增 N 行则输出 N 条 add）

## 禁止的操作
- 禁止 delete、禁止清空已有用例、禁止修改 columns 表头定义
- 禁止输出完整思维导图层级文本、Markdown、Python 列表或解释性段落
- 禁止返回 type 为 delete 或 remove 的操作
- 禁止要求用户重新输出全部已有用例；仅输出本轮需要执行的变更

## 输出格式（严格 JSON，无其他文字）
{
  "summary": "一句话描述做了什么",
  "operations": [
    { "type": "update", "rowIndex": 0, "cells": { "用例名称": "新名称" } },
    { "type": "add", "cells": { "用例名称": "用例标题", "所属模块": "功能 / 场景" } }
  ]
}

## 数据规范
- rowIndex 从 0 开始，不得超过 rowCount - 1
- add 时 cells 必须包含「用例名称」且非空；建议补全「所属模块」及其他列，暂无内容填 ""
- update 时 cells 只写需要修改的列
- 用户要求「新增/生成一条」时，只输出 add 操作，不要 update 或重写其他行
- 若用户指令不明确或无法执行，返回空 operations 并在 summary 中说明原因
"""


def _normalize_user_message_history(history: list[Any] | None, *, max_turns: int = 20) -> list[str]:
    if not history:
        return []
    out: list[str] = []
    for item in history:
        if isinstance(item, str):
            text = item.strip()
        elif isinstance(item, dict):
            text = str(item.get("user_prompt") or item.get("user") or "").strip()
        else:
            text = str(item or "").strip()
        if not text:
            continue
        out.append(text)
        if len(out) >= max_turns:
            break
    return out


def _format_user_message_history_block(history: list[str]) -> str:
    if not history:
        return ""
    lines = [f"第{idx}轮：{msg}" for idx, msg in enumerate(history, 1)]
    return (
        "【本次会话中用户先前的编辑指令（仅供理解当前指令；实际编辑必须以当前导图用例 JSON 为准）】\n"
        + "\n".join(lines)
    )


def _resolve_case_name_column(columns: list[str]) -> str:
    if "用例名称" in columns:
        return "用例名称"
    return columns[0] if columns else ""


def _build_mindmap_snapshot_block(mindmap_snapshot: dict[str, Any]) -> str:
    snapshot_json = json.dumps(mindmap_snapshot, ensure_ascii=False, indent=2)
    return (
        "【当前思维导图用例（JSON）】\n"
        "说明：JSON 含 columns（表头列名）、cases（用例行，每行含 rowIndex 与 cells）、rowCount（用例条数）。\n"
        + snapshot_json
    )


def _build_mindmap_edit_user_content(
    user_prompt: str,
    mindmap_snapshot: dict[str, Any],
    *,
    user_message_history: list[Any] | None = None,
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
    parts: list[str] = []
    history_block = _format_user_message_history_block(
        _normalize_user_message_history(user_message_history)
    )
    if history_block:
        parts.append(history_block)
    parts.append(_build_mindmap_snapshot_block(mindmap_snapshot))
    parts.append("【用户编辑指令（本轮）】\n" + user)
    return "\n\n".join(parts)


def build_mindmap_edit_chat_messages(
    user_prompt: str,
    mindmap_snapshot: dict[str, Any],
    *,
    visual_context_id: str | None = None,
    user_id: str | None = None,
    user_message_history: list[Any] | None = None,
) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": MINDMAP_EDIT_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": _build_mindmap_edit_user_content(
                user_prompt,
                mindmap_snapshot,
                user_message_history=user_message_history,
                visual_context_id=visual_context_id,
                user_id=user_id,
            ),
        },
    ]


def validate_mindmap_edit_response(
    data: dict[str, Any], mindmap_snapshot: dict[str, Any]
) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError("响应必须是 JSON 对象")
    columns = list(mindmap_snapshot.get("columns") or [])
    if not columns:
        raise ValueError("导图列定义为空")
    col_set = set(columns)
    row_count = int(mindmap_snapshot.get("rowCount") or len(mindmap_snapshot.get("cases") or []))
    name_col = _resolve_case_name_column(columns)

    summary = str(data.get("summary") or "").strip() or "已完成导图编辑"
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
            if name_col and not clean_cells.get(name_col, "").strip():
                raise ValueError(f"add 操作必须包含非空的「{name_col}」: operations[{i}]")
            validated.append({"type": "add", "cells": clean_cells})

    return {"summary": summary, "operations": validated}



def _build_vision_mindmap_edit_messages(
    user_prompt: str,
    mindmap_snapshot: dict[str, Any],
    *,
    visual_context_id: str | None = None,
    user_id: str | None = None,
    user_message_history: list[Any] | None = None,
) -> list[dict[str, Any]]:
    from core.services.visual_attachments.asset_frames import load_vision_frames_for_context
    import base64

    if not visual_context_id:
        raise ValueError("缺少视觉附件上下文")
    frames, txt_inline = load_vision_frames_for_context(visual_context_id, user_id)
    if not frames and not txt_inline:
        raise ValueError("附件无有效视觉内容")

    snapshot_text = _build_mindmap_snapshot_block(mindmap_snapshot)
    history_text = _format_user_message_history_block(
        _normalize_user_message_history(user_message_history)
    )
    user_text = str(user_prompt or "").strip()
    text_parts = [MINDMAP_EDIT_SYSTEM_PROMPT, snapshot_text]
    if history_text:
        text_parts.append(history_text)
    if txt_inline:
        text_parts.append("【文本文档附件（已内联）】\n" + "\n".join(txt_inline))
    text_parts.append("【用户编辑指令（本轮）】\n" + user_text)
    text_parts.append(
        "请结合上方附件图片/文档与导图用例 JSON，直接输出严格 JSON 编辑结果，不要 Markdown 代码块外的解释。"
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


def iter_mindmap_smart_edit_stream_events(
    *,
    base_url: str,
    api_key: str,
    model: str,
    user_prompt: str,
    mindmap_snapshot: dict[str, Any],
    temperature: float | None = 0.1,
    visual_context_id: str | None = None,
    user_id: str | None = None,
    user_message_history: list[Any] | None = None,
    should_cancel: Callable[[], bool] | None = None,
    use_vision: bool = False,
    vision_cfg: dict[str, Any] | None = None,
) -> Generator[dict[str, Any], None, None]:
    if use_vision and visual_context_id:
        messages = _build_vision_mindmap_edit_messages(
            user_prompt,
            mindmap_snapshot,
            visual_context_id=visual_context_id,
            user_id=user_id,
            user_message_history=user_message_history,
        )
    else:
        messages = build_mindmap_edit_chat_messages(
            user_prompt,
            mindmap_snapshot,
            visual_context_id=None,
            user_id=user_id,
            user_message_history=user_message_history,
        )
    reasoning_parts: list[str] = []
    content_parts: list[str] = []
    last_reasoning_push = 0.0
    last_content_thinking_push = 0.0

    try:
        from core.services.test_cases.smart_edit_service import _iter_edit_model_stream
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
        validated = validate_mindmap_edit_response(parsed, mindmap_snapshot)
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


def run_mindmap_smart_edit(
    *,
    base_url: str,
    api_key: str,
    model: str,
    user_prompt: str,
    mindmap_snapshot: dict[str, Any],
    temperature: float | None = 0.1,
    visual_context_id: str | None = None,
    user_id: str | None = None,
    user_message_history: list[Any] | None = None,
    use_vision: bool = False,
    vision_cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if use_vision and visual_context_id:
        messages = _build_vision_mindmap_edit_messages(
            user_prompt,
            mindmap_snapshot,
            visual_context_id=visual_context_id,
            user_id=user_id,
            user_message_history=user_message_history,
        )
        from core.services.test_cases.smart_edit_service import _iter_edit_model_stream
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
        messages = build_mindmap_edit_chat_messages(
            user_prompt,
            mindmap_snapshot,
            visual_context_id=None,
            user_id=user_id,
            user_message_history=user_message_history,
        )
        raw = generate_chat_completions_messages(
            base_url,
            api_key,
            model,
            messages,
            temperature=temperature,
        )
    parsed = _extract_json_object(raw)
    validated = validate_mindmap_edit_response(parsed, mindmap_snapshot)
    return {
        "success": True,
        "summary": validated["summary"],
        "operations": validated["operations"],
        "raw": raw,
    }
