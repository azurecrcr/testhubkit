"""JMeter AI · 第一轮组件计划（仅输出 targets 名单，不产出 operations）。"""
from __future__ import annotations

import json
import re
import time
from collections.abc import Generator
from typing import Any

import requests

from core.services.test_cases.generation_stream_service import stream_chat_completions_messages

REASONING_PUSH_INTERVAL_SEC = 0.25

JMETER_AI_STEP_PLAN_SYSTEM_PROMPT = """【系统约束 — JMeter 压测 AI 组件计划（第一轮）】

你是组件选型助手。用户会给出自然语言编辑意图，以及当前线程组的简要清单。

你的任务：判断为实现该意图需要新增/更新/替换哪些组件类型。
严禁输出具体字段改动、严禁 delete、严禁输出 operations。

有且仅有一个 JSON 对象，禁止 markdown 代码块。

## 输出格式示例（仅说明字段结构，禁止把示例内容当作真实接口照抄）
{
  "summary": "一句话中文说明",
  "targets": [
    {
      "action": "add",
      "alias": "HTTPSamplerProxy",
      "kind": "step",
      "category": "sampler",
      "note": "按用户描述概括方法/路径/参数，勿填写示例域名或假造站点"
    }
  ]
}

【重要】上方 JSON 只是格式样例，不是默认要创建的接口。
- 严禁把示例里的 alias/note/假想 URL 原样或改头换面写进结果
- 真实 path、域名、query、接口名必须且只能来自用户当前这句话（或线程组已有配置），用户没提到就不要发明

## 字段说明
- action: add / update / replace
- alias: JMeter 组件别名（如 HTTPSamplerProxy、HeaderManager、ResponseAssertion、IfController、JSONPostProcessor、BackendListener、StatVisualizer、ConfigTestElement 等）
- kind: step / assert / config / processor / listener / tg_variables
- category: sampler / assertion / config / controller / postprocessor / preprocessor / timer / listener / other
- note: 可选，给第二轮的中文备注（只提炼用户意图，不写死具体公网站点）

## 规则
1. targets 最多 8 条；能合并则合并
2. 用户明确要做「接口/请求/HTTP 取样」等 → 可选 HTTPSamplerProxy（kind=step）；note 只写用户提到的信息
3. 公网绝对 URL：仅当用户明确给出域名或完整 URL 时，才在 note 中写绝对地址；查询参数用独立 query，勿塞进 path
4. 用户意图不清（如仅数字、单字、乱码、与压测无关）→ targets 必须为 []，summary 说明无法识别，禁止猜测补一个「常见网站」请求
5. 不要编造页面上不存在的别名；不确定时用最接近的核心别名
"""




def _format_brief(brief: dict[str, Any]) -> str:
    text = json.dumps(brief, ensure_ascii=False, indent=2)
    if len(text) > 60000:
        text = text[:60000] + "\n…（简要清单过大，已截断）"
    return text


def build_jmeter_ai_step_plan_messages(
    user_message: str,
    thread_group_brief: dict[str, Any],
    *,
    thread_group_name: str | None = None,
) -> list[dict[str, str]]:
    if not isinstance(thread_group_brief, dict):
        raise ValueError("缺少线程组简要清单")
    tg_label = str(thread_group_name or "").strip() or "当前线程组"
    system_text = (
        JMETER_AI_STEP_PLAN_SYSTEM_PROMPT
        + f"\n\n【当前线程组：{tg_label}】\n"
        + "【线程组简要清单】\n"
        + _format_brief(thread_group_brief)
    )
    return [
        {"role": "system", "content": system_text},
        {"role": "user", "content": str(user_message or "").strip()},
    ]


def _extract_json_object(raw: str) -> dict[str, Any]:
    text = str(raw or "").strip()
    if not text:
        raise ValueError("AI 返回为空")
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.I)
    if fence:
        text = fence.group(1).strip()

    def _loads(candidate: str) -> dict[str, Any] | None:
        try:
            obj = json.loads(candidate)
        except json.JSONDecodeError:
            return None
        except Exception:
            return None
        return obj if isinstance(obj, dict) else None

    obj = _loads(text)
    if obj is not None:
        return obj
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("AI 返回格式异常，请换种说法再试")
    obj = _loads(text[start : end + 1])
    if obj is not None:
        return obj
    # 常见：summary 中未转义的英文直引号，再试一次把中文弯引号归一
    repaired = (
        text[start : end + 1]
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("「", '"')
        .replace("」", '"')
    )
    # 若仍失败，给友好错误，不把 json 库英文堆栈抛给用户
    obj = _loads(repaired)
    if obj is not None:
        return obj
    raise ValueError("AI 返回格式异常，请换种说法再试")


def parse_jmeter_ai_step_plan_response(raw: str) -> dict[str, Any]:
    obj = _extract_json_object(raw)
    summary = str(obj.get("summary") or "").strip() or "已识别组件清单"
    targets_raw = obj.get("targets")
    if targets_raw is None:
        targets_raw = obj.get("components") or obj.get("plan") or []
    if not isinstance(targets_raw, list):
        raise ValueError("targets 必须是数组")
    targets: list[dict[str, Any]] = []
    for i, item in enumerate(targets_raw[:8]):
        if not isinstance(item, dict):
            continue
        action = str(item.get("action") or "add").strip().lower()
        if action not in {"add", "update", "replace"}:
            action = "add"
        alias = str(item.get("alias") or item.get("type") or item.get("component") or "").strip()
        if not alias:
            continue
        kind = str(item.get("kind") or "step").strip().lower()
        category = str(item.get("category") or "").strip().lower()
        note = str(item.get("note") or item.get("comment") or "").strip()
        targets.append(
            {
                "action": action,
                "alias": alias,
                "kind": kind,
                "category": category,
                "note": note,
                "index": i,
            }
        )
    return {"summary": summary, "targets": targets}


def iter_jmeter_ai_step_plan_stream_events(
    *,
    base_url: str,
    api_key: str,
    model: str,
    user_message: str,
    thread_group_brief: dict[str, Any],
    thread_group_name: str | None = None,
    temperature: float | None = 0.1,
) -> Generator[dict[str, Any], None, None]:
    messages = build_jmeter_ai_step_plan_messages(
        user_message,
        thread_group_brief,
        thread_group_name=thread_group_name,
    )
    reasoning_parts: list[str] = []
    content_parts: list[str] = []
    last_reasoning_push = 0.0

    try:
        yield {"type": "status", "content": "正在识别要改动的组件…", "replace": True}
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

        raw = "".join(content_parts).strip()
        parsed = parse_jmeter_ai_step_plan_response(raw)
        yield {
            "type": "done",
            "success": True,
            "summary": parsed["summary"],
            "targets": parsed["targets"],
            "content": parsed["summary"],
        }
    except ValueError as exc:
        yield {"type": "error", "error": str(exc)}
    except requests.exceptions.RequestException as exc:
        yield {"type": "error", "error": f"API 请求失败: {exc}"}
    except Exception as exc:
        yield {"type": "error", "error": str(exc)}
