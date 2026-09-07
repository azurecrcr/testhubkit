"""Workbench session schema helpers."""
ALLOWED_PLAN_CONTEXTS = frozenset(["edit", "edit_mindmap"])


def validate_plan_context(value):
    ctx = str(value or "edit").strip() or "edit"
    if ctx not in ALLOWED_PLAN_CONTEXTS:
        return "edit"
    return ctx


def validate_turn_payload(data):
    data = dict(data or {})
    if "plan_context" in data:
        data["plan_context"] = validate_plan_context(data.get("plan_context"))
    return data
