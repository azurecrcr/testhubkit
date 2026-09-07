"""JMeter 压测 AI 时间线编辑服务（Timeline JSON，与 doc_tools / smart_edit 完全隔离）。"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Generator
from typing import Any

import requests

from core.services.jmeter_scenario.ai_step_edit_response import (
    collect_ref_ids_from_step_tree,
    collect_ref_ids_from_timeline,
    collect_ref_ids_from_yaml_text,
    parse_jmeter_ai_timeline_response,
)
from core.services.test_cases.generation_stream_service import stream_chat_completions_messages

REASONING_PUSH_INTERVAL_SEC = 0.25

JMETER_AI_TIMELINE_SYSTEM_PROMPT = """【系统约束 — JMeter 压测线程组 AI 时间线助手】

你是 JMeter 压测场景编辑助手。用户会提供：
1. 当前选中线程组的 **Timeline JSON** 快照（含 timeline 列表与 details 详情）
2. 用户的自然语言编辑指令

timeline 数组按 UI 显示顺序排列（index 从 1 开始）。每个条目含 ref_id、kind、subtype、name、summary。
details 以 ref_id 为键，含完整组件数据。**ref_id 仅用于 update/replace 定位，禁止写入 component。**

你必须根据指令生成时间线组件的新增(add)、更新(update)或替换(replace)操作。**严禁 delete 删除操作。**

## 输出格式（强制 — 违反任一条均视为失败）

有且仅有一个 JSON 对象。
禁止 JSON 外的任何文字、解释、标题、注释或 markdown 代码块标记（禁止 ```json）。

{
  "summary": "一句话中文说明本次变更",
  "operations": [
    {
      "action": "add",
      "kind": "step",
      "after_ref_id": null,
      "after_index": null,
      "component": { }
    },
    {
      "action": "update",
      "kind": "assert",
      "ref_id": "匹配 timeline 中某条目的 ref_id",
      "component": { }
    },
    {
      "action": "replace",
      "kind": "step",
      "ref_id": "匹配 timeline 中某条目的 ref_id",
      "component": { }
    }
  ]
}

## kind 类型

| kind | 说明 |
|------|------|
| assert | 线程组级断言（response_assert / json_assert / size_assert / md5hex_assert） |
| config | 配置元件（http_defaults / header_manager / auth_manager 等） |
| step | HTTP 或逻辑控制器步骤 |
| processor | 后置处理器（beanshell_post 等） |
| listener | 监听器（add 时需 listener_key: view_results_tree / aggregate_report / backend_listener） |
| tg_variables | 用户定义的变量 |

## action 说明

### add — 新增组件
| 字段 | 说明 |
|------|------|
| kind | 必填 |
| after_ref_id | 插入到某 ref_id 之后；null 表示追加到末尾 |
| after_index | 可选，1 基 timeline index，与 after_ref_id 二选一 |
| listener_key | kind=listener 时必填 |
| component | 完整组件对象，**禁止**含 ref_id |

### update — 部分更新
| 字段 | 说明 |
|------|------|
| ref_id | **必须**匹配 timeline 中某 ref_id |
| kind | 建议填写，须与目标一致 |
| component | 仅需包含要修改的字段（partial merge） |

### replace — 替换组件类型或整体替换
| 字段 | 说明 |
|------|------|
| ref_id | **必须**匹配 timeline 中某 ref_id |
| kind | 新组件类型 |
| component | 新组件完整对象 |

## 组件格式参考

### HTTP 步骤（step，无 type 时默认为 HTTP）
```json
{
  "name": "01-登录",
  "method": "POST",
  "path": "/api/login",
  "headers": {"Content-Type": "application/json"},
  "body": "{\\"user\\":\\"demo\\"}",
  "body_type": "json",
  "assert_status": 200
}
```

### 断言 assert（response_assert 示例）
```json
{
  "type": "response_assert",
  "name": "响应状态码",
  "enabled": true,
  "test_field": "response_code",
  "match_mode": "equals",
  "patterns": ["200"]
}
```

### 配置 config
```json
{
  "type": "header_manager",
  "data": {"enabled": true, "headers": [{"name": "Authorization", "value": "Bearer ${token}"}]}
}
```

### 逻辑控制器 step（必须有 type）
- if_controller: condition, evaluate_all, children[]
- loop_controller: loops, children[]
- transaction_controller: children[]

## 执行规则
1. **按 timeline index 理解「第一个/第二个组件」** — index 1 即 UI 第一个组件，可能是断言而非 HTTP
2. 仅修改与用户指令相关的组件
3. 若用户要把断言改为 HTTP 请求，使用 replace（ref_id 指向原断言，kind=step）
4. update 只改用户要求的字段
5. 变量引用格式 ${var_name}
6. 若无法执行，operations 可为 []，在 summary 说明原因
7. 禁止 action: delete
8. 保持与已有组件风格一致
"""



JMETER_AI_STEP_TREE_ADDENDUM = """
## step_tree 嵌套步骤（重要）

除 timeline 外，快照含 **step_tree** 数组：列出所有步骤（含逻辑控制器内嵌套），字段：
ref_id、parent_ref_id、depth、kind、subtype、name、summary。

**details** 以 ref_id 为键；步骤 detail **不含 children**（子步骤仅在 step_tree 中索引）。

### 嵌套步骤 add
| 字段 | 说明 |
|------|------|
| parent_ref_id | 父逻辑控制器步骤的 ref_id；顶层步骤填 null |
| insert_after_ref_id | 在同一 parent 下插入到某步骤之后 |
| insert_index | 可选，0 基 sibling 索引 |

### 嵌套步骤 update / replace
- ref_id 必须来自 timeline 或 step_tree
- 修改 Loop/Txn/If 内 HTTP 步骤时，用 step_tree 中的 ref_id

### 规则补充
9. 「Txn 下的 HTTP」「Loop 里第二个步骤」→ 查 step_tree 的 parent_ref_id + 顺序
10. 逻辑控制器挂载区（processors/assertions 等）在 details 对应步骤对象内，update 时 partial merge
"""

JMETER_AI_STEP_TREE_SYSTEM_PROMPT_V2 = """【系统约束 — JMeter 压测 StepTree AI 助手】

你是 JMeter 压测场景编辑助手。用户会提供 **StepTree JSON** 快照，包含：
1. **timeline** — 线程组顶层组件顺序（index 从 1 开始）
2. **step_tree** — 所有步骤的扁平索引（含逻辑控制器内任意深度嵌套）
3. **details** — 以 ref_id 为键的完整组件数据（步骤 detail **不含 children**）

嵌套组件**会**出现在 step_tree 中（通过 parent_ref_id + depth 表示层级）。
## step_tree 挂载区（重要）

逻辑控制器（Txn/Loop/If/Simple/Random）与 HTTP 步骤除 **children 子步骤** 外，还有 **挂载区** 组件（后置处理器、前置、断言、定时器、配置、监听器等）。

- 挂载区组件在 step_tree 中 **kind=mount**，ref_id 形如 `{宿主步骤ref_id}@{mount_key}`（例：`abc@ifproc:0`）
- **UI 顺序**：控制器 body 内，挂载区组件与子步骤按 mount_timeline_keys **交错排列**；挂载项通常排在子步骤之前
- 「Txn 下第一个组件」= 该 Txn ref_id 下、同 parent_ref_id 且 UI 顺序第一的条目（常为 kind=mount 的 JSON 提取，而非 Loop 内 HTTP）
- 修改挂载组件：update/replace 其 mount ref_id；将挂载项替换为 HTTP 步骤时用 replace + kind=step



你必须输出 operations（add / update / replace），**严禁 delete**。

## 输出格式（强制）

有且仅有一个 JSON 对象。禁止 JSON 外文字或 ``` 代码块。

{
  "summary": "一句话中文说明",
  "operations": [ ... ]
}

## operation 通用字段

| 字段 | 说明 |
|------|------|
| action | add / update / replace |
| scope | timeline（顶层 TG 组件）或 step_tree（嵌套/顶层步骤）；建议始终填写 |
| kind | assert / config / step / processor / listener / tg_variables |
| ref_id | update/replace 必填，必须来自 timeline 或 step_tree |
| target_name | 可选，人类可读目标名 |
| component | 变更内容；**禁止**含 ref_id/id/children |

## add — 新增

**顶层 TG 组件**（断言/配置/监听器等）：
```json
{
  "action": "add",
  "scope": "timeline",
  "kind": "assert",
  "after_ref_id": "可选，timeline 中某 ref_id 之后",
  "component": { "type": "response_assert", "name": "...", "patterns": ["200"] }
}
```

**顶层步骤**（tg.steps 下）：
```json
{
  "action": "add",
  "scope": "step_tree",
  "kind": "step",
  "parent_ref_id": null,
  "insert_after_ref_id": "可选 sibling ref_id",
  "component": { "name": "11-新步骤", "method": "GET", "path": "/x" }
}
```

**嵌套步骤**（Txn/Loop/If/Simple 的 children 内）：
```json
{
  "action": "add",
  "scope": "step_tree",
  "kind": "step",
  "parent_ref_id": "Loop控制器的 ref_id",
  "insert_after_ref_id": "02-浏览商品 的 ref_id",
  "component": { "name": "02c-检查库存", "method": "GET", "path": "/stock" }
}
```

## update — 部分更新

```json
{
  "action": "update",
  "scope": "step_tree",
  "kind": "step",
  "ref_id": "step_tree 中目标 ref_id",
  "target_name": "02-浏览商品",
  "component": { "path": "/api/sku" }
}
```

修改控制器挂载区（processors/assertions/pre_processors 等）：update 该控制器或 HTTP 步骤的 ref_id，component 内 partial merge 对应字段。

## replace — 类型替换或整体替换

```json
{
  "action": "replace",
  "scope": "timeline",
  "kind": "step",
  "ref_id": "原 TG 级断言 ref_id",
  "component": { "name": "新HTTP", "method": "POST", "path": "/login" }
}
```

## 定位规则

1. 「timeline 第 N 个组件」→ 用 timeline[index=N]
2. 「Txn 下 / Loop 里 / 第 2 层」→ 查 step_tree 的 parent_ref_id + 同 parent 下顺序
3. 优先用 **ref_id**，target_name 仅辅助说明
4. 仅改用户要求的组件；update 的 component 不要包含未提及字段
5. 变量格式 ${var_name}
6. 无法执行时 operations=[] 并在 summary 说明

## 组件格式参考

HTTP step: name, method, path, headers, body, body_type, assertions, extract
逻辑控制器 step: type(if_controller/loop_controller/transaction_controller/simple_controller/random_controller), name, children 禁止出现在 component 中
assert: type, name, patterns/json_path 等
"""

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


def _format_timeline_for_prompt(timeline_obj: dict[str, Any]) -> str:
    text = json.dumps(timeline_obj, ensure_ascii=False, indent=2)
    if len(text) > 120000:
        text = text[:120000] + "\n…（Timeline JSON 过大，已截断）"
    return text


def build_jmeter_ai_timeline_messages(
    user_message: str,
    thread_group_timeline: dict[str, Any],
    *,
    thread_group_name: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
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
    system_text = (
        prompt
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


def iter_jmeter_ai_timeline_stream_events(
    *,
    base_url: str,
    api_key: str,
    model: str,
    user_message: str,
    thread_group_timeline: dict[str, Any],
    thread_group_name: str | None = None,
    temperature: float | None = 0.1,
    conversation_history: list[dict[str, Any]] | None = None,
) -> Generator[dict[str, Any], None, None]:
    messages = build_jmeter_ai_timeline_messages(
        user_message,
        thread_group_timeline,
        thread_group_name=thread_group_name,
        conversation_history=conversation_history,
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
            from core.services.jmeter_scenario.ai_step_edit_response import parse_jmeter_ai_step_tree_response
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


# Legacy YAML API kept for backward compatibility
def build_jmeter_ai_messages(
    user_message: str,
    thread_group_yaml: str,
    *,
    thread_group_name: str | None = None,
    conversation_history: list[dict[str, Any]] | None = None,
) -> list[dict[str, str]]:
    from core.services.jmeter_scenario.ai_step_edit_response import parse_jmeter_ai_step_response  # noqa: F401

    yaml_text = str(thread_group_yaml or "").strip()
    if not yaml_text:
        raise ValueError("缺少线程组 YAML")
    if len(yaml_text) > 120000:
        yaml_text = yaml_text[:120000] + "\n…（YAML 过大，已截断）"
    tg_label = str(thread_group_name or "").strip() or "当前线程组"
    legacy_prompt = (
        "你是 JMeter 步骤编辑助手。输出 JSON：summary + operations(add/update step only)。"
        f"\n\n【当前线程组：{tg_label}】\n【YAML】\n{yaml_text}"
    )
    messages: list[dict[str, str]] = [{"role": "system", "content": legacy_prompt}]
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


def iter_jmeter_ai_step_stream_events(
    *,
    base_url: str,
    api_key: str,
    model: str,
    user_message: str,
    thread_group_yaml: str,
    thread_group_name: str | None = None,
    temperature: float | None = 0.1,
    conversation_history: list[dict[str, Any]] | None = None,
) -> Generator[dict[str, Any], None, None]:
    from core.services.jmeter_scenario.ai_step_edit_response import (
        collect_ref_ids_from_yaml_text,
        parse_jmeter_ai_step_response,
    )

    messages = build_jmeter_ai_messages(
        user_message,
        thread_group_yaml,
        thread_group_name=thread_group_name,
        conversation_history=conversation_history,
    )
    known_ref_ids = collect_ref_ids_from_yaml_text(thread_group_yaml)
    content_parts: list[str] = []

    try:
        for stream_kind, delta in stream_chat_completions_messages(
            base_url, api_key, model, messages, temperature=temperature,
        ):
            if stream_kind == "content":
                content_parts.append(delta)
        raw = "".join(content_parts).strip()
        if not raw:
            yield {"type": "error", "error": "AI 返回为空"}
            return
        parsed = parse_jmeter_ai_step_response(raw, known_ref_ids=known_ref_ids)
        yield {
            "type": "done",
            "success": True,
            "summary": parsed["summary"],
            "operations": parsed["operations"],
            "content": parsed["summary"],
        }
    except ValueError as exc:
        yield {"type": "error", "error": str(exc)}
    except Exception as exc:
        yield {"type": "error", "error": str(exc)}
