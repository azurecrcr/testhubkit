"""Agent job request schema."""
ALLOWED_AGENT_MODES = frozenset(["fill_gaps_only", "module_gen_only"])


def validate_agent_job_payload(data):
    data = dict(data or {})
    mode = str(data.get("mode") or "").strip()
    if mode not in ALLOWED_AGENT_MODES:
        raise ValueError("不支持的生成模式")
    user_intent = str(data.get("user_intent") or data.get("prompt") or "").strip()
    if not user_intent:
        raise ValueError("请填写 Agent 指令或提示词")
    columns = data.get("columns") or []
    if not isinstance(columns, list) or not columns:
        raise ValueError("请先应用表头模板")
    return data
