"""JMeter AI · 第二轮：在原有 StepTree 逻辑上追加组件清单 + 字段格式包（独立模块）。"""
from __future__ import annotations

import json
import time
from collections.abc import Generator
from typing import Any

import requests

from core.services.jmeter_scenario.ai_step_edit_response import (
    collect_ref_ids_from_step_tree,
    collect_ref_ids_from_timeline,
    parse_jmeter_ai_timeline_response,
)
from core.services.jmeter_scenario.ai_step_edit_service import (
    JMETER_AI_STEP_TREE_SYSTEM_PROMPT_V2,
    JMETER_AI_TIMELINE_SYSTEM_PROMPT,
    REASONING_PUSH_INTERVAL_SEC,
    _extract_stream_status_prefix,
    _format_timeline_for_prompt,
)
from core.services.test_cases.generation_stream_service import stream_chat_completions_messages


def build_jmeter_ai_timeline_messages_two_pass(
    user_message: str,
    thread_group_timeline: dict[str, Any],
    *,
    thread_group_name: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
    component_plan: list[dict[str, Any]] | None = None,
    schema_pack: list[dict[str, Any]] | dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    if not isinstance(thread_group_timeline, dict) or not thread_group_timeline.get("timeline"):
        raise ValueError("缺少线程组 Timeline JSON")
    tg_label = str(thread_group_name or "").strip() or "当前线程组"
    timeline_text = _format_timeline_for_prompt(thread_group_timeline)
    has_step_tree = bool(thread_group_timeline.get("step_tree"))
    prompt = (
        JMETER_AI_STEP_TREE_SYSTEM_PROMPT_V2
        if has_step_tree
        else JMETER_AI_TIMELINE_SYSTEM_PROMPT
    )
    label = "StepTree JSON" if has_step_tree else "Timeline JSON"

    plan_text = json.dumps(component_plan or [], ensure_ascii=False, indent=2)
    pack_text = json.dumps(schema_pack or [], ensure_ascii=False, indent=2)
    if len(pack_text) > 80000:
        pack_text = pack_text[:80000] + "\n…（字段格式包过大，已截断）"

    extra = (
        "\n\n【第二轮补充约束】\n"
        "1. 必须优先参考下方「第一轮组件清单」与「字段格式包」填写 component。\n"
        "2. component 字段名与类型尽量与格式包一致；查询参数用独立对象/字段 query，勿把 ?a=1 塞进 path。\n"
        "3. 公网/互联网 URL：仅当用户或第一轮清单明确给出域名/完整 URL 时，path 才用绝对地址"
        "（形如 https://host.example/path）；禁止只写站点相对路径；禁止编造用户未提到的公网站点。\n"
        "4. 站内相对路径（如 /api/login）仅在已有 HTTP 默认值或 BASE_URL 语境下使用。\n"
        "5. kind=config 时，HTTP 请求默认值 component 格式示例（字段结构示意，域名必须来自用户意图，禁止照抄示例域名）："
        '{"type":"http_defaults","name":"...","data":{"protocol":"https","domain":"<用户给出的域名>","port":"443"}}；'
        "禁止只用 alias=ConfigTestElement。\n"
        "6. 提示中的格式示例不得当作默认接口写入；用户意图不清时不要新增具体 HTTP 取样器。\n"
        "7. 仍输出唯一 JSON：summary + operations；严禁 delete。\n"
        f"\n【第一轮组件清单】\n{plan_text}\n"
        f"\n【清单对应字段格式包】\n{pack_text}\n"
    )

    system_text = (
        prompt
        + extra
        + f"\n\n【当前线程组：{tg_label}】\n"
        + f"【{label} 快照（update/replace 时必须引用 ref_id）】\n"
        + timeline_text
    )
    messages: list[dict[str, str]] = [{"role": "system", "content": system_text}]
    if conversation_history:
        for item in conversation_history[-10:]:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "").strip().lower()
            text = str(item.get("text") or item.get("content") or "").strip()
            if role in {"user", "assistant"} and text:
                messages.append({"role": role, "content": text})
    messages.append({"role": "user", "content": str(user_message or "").strip()})
    return messages


def iter_jmeter_ai_timeline_stream_events_two_pass(
    *,
    base_url: str,
    api_key: str,
    model: str,
    user_message: str,
    thread_group_timeline: dict[str, Any],
    thread_group_name: str | None = None,
    temperature: float | None = 0.1,
    conversation_history: list[dict[str, Any]] | None = None,
    component_plan: list[dict[str, Any]] | None = None,
    schema_pack: list[dict[str, Any]] | dict[str, Any] | None = None,
) -> Generator[dict[str, Any], None, None]:
    messages = build_jmeter_ai_timeline_messages_two_pass(
        user_message,
        thread_group_timeline,
        thread_group_name=thread_group_name,
        conversation_history=conversation_history,
        component_plan=component_plan,
        schema_pack=schema_pack,
    )
    known_ref_ids = (
        collect_ref_ids_from_step_tree(thread_group_timeline)
        if thread_group_timeline.get("step_tree")
        else collect_ref_ids_from_timeline(thread_group_timeline)
    )
    reasoning_parts: list[str] = []
    content_parts: list[str] = []
    last_reasoning_push = 0.0
    last_status_push = 0.0

    try:
        yield {"type": "status", "content": "正在按组件格式生成修改…", "replace": True}
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
                yield {"type": "parsing", "content": "正在解析 AI 返回的 StepTree 操作…", "replace": True}
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
        if thread_group_timeline.get("step_tree"):
            from core.services.jmeter_scenario.ai_step_edit_response import (
                parse_jmeter_ai_step_tree_response,
            )

            parsed = parse_jmeter_ai_step_tree_response(raw, known_ref_ids=known_ref_ids)
        else:
            parsed = parse_jmeter_ai_timeline_response(raw, known_ref_ids=known_ref_ids)
        yield {
            "type": "done",
            "success": True,
            "summary": parsed["summary"],
            "operations": parsed["operations"],
            "content": parsed["summary"],
        }
    except ValueError as exc:
        yield {"type": "error", "error": str(exc)}
    except requests.exceptions.RequestException as exc:
        yield {"type": "error", "error": f"API 请求失败: {exc}"}
    except Exception as exc:
        yield {"type": "error", "error": str(exc)}
