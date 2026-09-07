"""JMeter 压测 AI 步骤编辑响应解析（Timeline JSON，独立模块）。"""

from __future__ import annotations

import json
import re
from typing import Any

ALLOWED_KINDS = frozenset({"step", "assert", "config", "processor", "listener", "tg_variables"})
ALLOWED_ACTIONS = frozenset({"add", "update", "replace"})


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


def _normalize_component(value: Any, *, field_name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{field_name} 必须是对象")
    return value


def collect_ref_ids_from_timeline(timeline_obj: Any) -> set[str]:
    ids: set[str] = set()
    if not isinstance(timeline_obj, dict):
        return ids
    for item in timeline_obj.get("timeline") or []:
        if isinstance(item, dict):
            ref_id = str(item.get("ref_id") or "").strip()
            if ref_id:
                ids.add(ref_id)
    return ids


def collect_ref_ids_from_yaml_text(yaml_text: str) -> set[str]:
    ids: set[str] = set()
    for m in re.finditer(r"_ref_id:\s*['\"]?([\w-]+)", str(yaml_text or "")):
        ids.add(m.group(1))
    for m in re.finditer(r"['\"]_ref_id['\"]\s*:\s*['\"]([\w-]+)['\"]", str(yaml_text or "")):
        ids.add(m.group(1))
    return ids


def normalize_ai_timeline_operations(
    raw_ops: Any,
    *,
    known_ref_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    if raw_ops is None:
        return []
    if not isinstance(raw_ops, list):
        raise ValueError("operations 必须是数组")
    known = known_ref_ids or set()
    out: list[dict[str, Any]] = []
    for i, item in enumerate(raw_ops):
        if not isinstance(item, dict):
            raise ValueError(f"operations[{i}] 必须是对象")
        action = str(item.get("action") or "").strip().lower()
        if action == "delete":
            raise ValueError(f"operations[{i}] 不支持 delete 操作")
        if action not in ALLOWED_ACTIONS:
            raise ValueError(f"operations[{i}] action 必须是 add、update 或 replace")
        kind = str(item.get("kind") or "").strip().lower()
        if action in {"add", "replace"} and kind not in ALLOWED_KINDS:
            raise ValueError(f"operations[{i}] kind 无效: {kind}")
        if action == "update" and kind and kind not in ALLOWED_KINDS:
            raise ValueError(f"operations[{i}] kind 无效: {kind}")
        component = _normalize_component(
            item.get("component") or item.get("data") or item.get("step") or {},
            field_name=f"operations[{i}].component",
        )
        for forbidden in ("ref_id", "_ref_id", "_ai_ref_id"):
            if forbidden in component:
                raise ValueError(f"operations[{i}].component 禁止包含 {forbidden}")
        op: dict[str, Any] = {"action": action, "component": component}
        if kind:
            op["kind"] = kind
        if action in {"update", "replace"}:
            ref_id = str(item.get("ref_id") or item.get("refId") or "").strip()
            if not ref_id:
                raise ValueError(f"operations[{i}] {action} 缺少 ref_id")
            if known and ref_id not in known:
                raise ValueError(f"operations[{i}] ref_id 不存在于当前时间线: {ref_id}")
            op["ref_id"] = ref_id
        if action == "add":
            listener_key = item.get("listener_key") or item.get("listenerKey")
            if listener_key:
                op["listener_key"] = str(listener_key)
            after_ref = item.get("after_ref_id") or item.get("afterRefId")
            if after_ref:
                op["after_ref_id"] = str(after_ref)
            if item.get("after_index") is not None:
                op["after_index"] = int(item["after_index"])
        out.append(op)
    return out



def collect_ref_ids_from_step_tree(timeline_obj: Any) -> set[str]:
    """Collect ref_ids from timeline + step_tree."""
    ids = collect_ref_ids_from_timeline(timeline_obj)
    if not isinstance(timeline_obj, dict):
        return ids
    for item in timeline_obj.get("step_tree") or []:
        if isinstance(item, dict):
            ref_id = str(item.get("ref_id") or "").strip()
            if ref_id:
                ids.add(ref_id)
    return ids


def normalize_ai_step_tree_operations(
    raw_ops: Any,
    *,
    known_ref_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    """StepTree 专用 operations 解析（含嵌套 parent_ref_id，不影响 timeline 解析）。"""
    if raw_ops is None:
        return []
    if not isinstance(raw_ops, list):
        raise ValueError("operations 必须是数组")
    known = known_ref_ids or set()
    out: list[dict[str, Any]] = []
    for i, item in enumerate(raw_ops):
        if not isinstance(item, dict):
            raise ValueError(f"operations[{i}] 必须是对象")
        action = str(item.get("action") or "").strip().lower()
        if action == "delete":
            raise ValueError(f"operations[{i}] 不支持 delete 操作")
        if action not in ALLOWED_ACTIONS:
            raise ValueError(f"operations[{i}] action 必须是 add、update 或 replace")
        kind = str(item.get("kind") or "").strip().lower()
        if action in {"add", "replace"} and kind not in ALLOWED_KINDS:
            raise ValueError(f"operations[{i}] kind 无效: {kind}")
        if action == "update" and kind and kind not in ALLOWED_KINDS:
            raise ValueError(f"operations[{i}] kind 无效: {kind}")
        component = _normalize_component(
            item.get("component") or item.get("data") or item.get("step") or {},
            field_name=f"operations[{i}].component",
        )
        for forbidden in ("ref_id", "_ref_id", "_ai_ref_id", "id"):
            if forbidden in component:
                raise ValueError(f"operations[{i}].component 禁止包含 {forbidden}")
        op: dict[str, Any] = {"action": action, "component": component}
        if kind:
            op["kind"] = kind
        scope = str(item.get("scope") or "").strip().lower()
        if scope in {"timeline", "step_tree"}:
            op["scope"] = scope
        target_name = str(item.get("target_name") or item.get("targetName") or "").strip()
        if target_name:
            op["target_name"] = target_name
        if action in {"update", "replace"}:
            ref_id = str(item.get("ref_id") or item.get("refId") or "").strip()
            if not ref_id:
                raise ValueError(f"operations[{i}] {action} 缺少 ref_id")
            if known and ref_id not in known:
                raise ValueError(f"operations[{i}] ref_id 不存在于当前快照: {ref_id}")
            op["ref_id"] = ref_id
        if action == "add":
            listener_key = item.get("listener_key") or item.get("listenerKey")
            if listener_key:
                op["listener_key"] = str(listener_key)
            after_ref = (
                item.get("insert_after_ref_id")
                or item.get("insertAfterRefId")
                or item.get("after_ref_id")
                or item.get("afterRefId")
            )
            if after_ref:
                op["insert_after_ref_id"] = str(after_ref)
            parent_ref = item.get("parent_ref_id") or item.get("parentRefId")
            if parent_ref is not None and str(parent_ref).strip():
                parent_s = str(parent_ref).strip()
                # AI 常编造同批逻辑 id（如 baidu_http）；未知则软丢弃，交前端挂到同批取样器
                # 硬失败会导致 SSE 只发 parsing 后 error，且旧前端会吞掉 error 卡住 UI
                if known and parent_s not in known:
                    op["parent_ref_id"] = None
                    op["_dropped_parent_ref_id"] = parent_s
                else:
                    op["parent_ref_id"] = parent_s
            elif kind == "step":
                op["parent_ref_id"] = None
            if item.get("insert_index") is not None:
                op["insert_index"] = int(item["insert_index"])
            if item.get("after_index") is not None:
                op["after_index"] = int(item["after_index"])
        out.append(op)
    return out


def parse_jmeter_ai_step_tree_response(text: str, *, known_ref_ids: set[str] | None = None) -> dict[str, Any]:
    data = _extract_json_object(text)
    summary = str(data.get("summary") or "").strip() or "已完成 AI StepTree 编辑"
    operations = normalize_ai_step_tree_operations(data.get("operations"), known_ref_ids=known_ref_ids)
    return {"summary": summary, "operations": operations}


def normalize_ai_step_operations(raw_ops: Any, *, known_ref_ids: set[str] | None = None) -> list[dict[str, Any]]:
    """Legacy YAML step operations (backward compat)."""
    if raw_ops is None:
        return []
    if not isinstance(raw_ops, list):
        raise ValueError("operations 必须是数组")
    known = known_ref_ids or set()
    out: list[dict[str, Any]] = []
    for i, item in enumerate(raw_ops):
        if not isinstance(item, dict):
            raise ValueError(f"operations[{i}] 必须是对象")
        action = str(item.get("action") or "").strip().lower()
        if action == "delete":
            raise ValueError(f"operations[{i}] 不支持 delete 操作")
        if action not in {"add", "update"}:
            raise ValueError(f"operations[{i}] action 必须是 add 或 update")
        if action == "add":
            step = _normalize_component(item.get("step"), field_name=f"operations[{i}].step")
            if "_ref_id" in step:
                raise ValueError(f"operations[{i}].step 禁止包含 _ref_id")
            op: dict[str, Any] = {
                "action": "add",
                "kind": "step",
                "parent_ref_id": item.get("parent_ref_id") or item.get("parentRefId") or None,
                "insert_after_ref_id": item.get("insert_after_ref_id") or item.get("insertAfterRefId") or None,
                "component": step,
            }
            if item.get("insert_index") is not None:
                op["insert_index"] = int(item["insert_index"])
            out.append(op)
        else:
            ref_id = str(item.get("ref_id") or item.get("refId") or "").strip()
            if not ref_id:
                raise ValueError(f"operations[{i}] update 缺少 ref_id")
            if known and ref_id not in known:
                raise ValueError(f"operations[{i}] ref_id 不存在于当前线程组: {ref_id}")
            step = _normalize_component(item.get("step") or item.get("patch"), field_name=f"operations[{i}].step")
            if "_ref_id" in step:
                raise ValueError(f"operations[{i}].step 禁止包含 _ref_id")
            out.append({"action": "update", "kind": "step", "ref_id": ref_id, "component": step})
    return out


def parse_jmeter_ai_timeline_response(text: str, *, known_ref_ids: set[str] | None = None) -> dict[str, Any]:
    data = _extract_json_object(text)
    summary = str(data.get("summary") or "").strip() or "已完成 AI 时间线编辑"
    operations = normalize_ai_timeline_operations(data.get("operations"), known_ref_ids=known_ref_ids)
    return {"summary": summary, "operations": operations}


def parse_jmeter_ai_step_response(text: str, *, known_ref_ids: set[str] | None = None) -> dict[str, Any]:
    data = _extract_json_object(text)
    summary = str(data.get("summary") or "").strip() or "已完成 AI 步骤编辑"
    operations = normalize_ai_step_operations(data.get("operations"), known_ref_ids=known_ref_ids)
    return {"summary": summary, "operations": operations}
