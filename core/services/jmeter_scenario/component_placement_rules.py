"""JMeter 组件放置规则（隔离模块，供 catalog API 与前端共用）。"""

# 各插入上下文允许的分类
CONTEXT_ALLOWED_CATEGORIES = {
    "thread_group": {
        "controller", "sampler", "config", "timer",
        "preprocessor", "postprocessor", "assertion", "listener",
    },
    "controller": {
        "controller", "sampler", "config", "timer",
        "preprocessor", "postprocessor", "assertion", "listener",
    },
    "tg_config": {"config"},
    "test_plan": {"thread_group", "listener", "config", "other"},
}

CONTAINER_CATEGORIES = {"controller"}
CONTAINER_ALIASES = {
    "TestPlan", "ThreadGroup", "SetupThreadGroup", "PostThreadGroup",
    "OpenModelThreadGroup", "TestFragmentController",
}

MOUNTABLE_CATEGORIES = {"timer", "preprocessor", "postprocessor", "assertion", "config"}


def is_container_component(comp):
    cat = comp.get("category") or ""
    alias = comp.get("alias") or ""
    if cat in CONTAINER_CATEGORIES:
        return True
    if alias in CONTAINER_ALIASES:
        return True
    return False


def is_mountable_component(comp):
    return (comp.get("category") or "") in MOUNTABLE_CATEGORIES


def allowed_categories(context):
    return set(CONTEXT_ALLOWED_CATEGORIES.get(context, CONTEXT_ALLOWED_CATEGORIES["thread_group"]))


def component_allowed_in_context(comp, context):
    cat = comp.get("category") or "other"
    if cat not in allowed_categories(context):
        return False
    alias = comp.get("alias") or ""
    # 线程组类元件只能加在线程组层级（通过专用入口），不在步骤树中直接添加
    if cat == "thread_group" and context in ("thread_group", "controller"):
        return False
    if alias in ("TestPlan", "WorkBench") and context != "test_plan":
        return False
    return True


def enrich_component(comp):
    out = dict(comp)
    out["container"] = is_container_component(comp)
    out["mountable"] = is_mountable_component(comp)
    return out


def build_placement_meta():
    return {
        "contexts": [
            {"id": "thread_group", "label_zh": "线程组", "description": "线程组直接子元件"},
            {"id": "controller", "label_zh": "逻辑控制器内", "description": "控制器 hashTree 内"},
            {"id": "tg_config", "label_zh": "线程组配置", "description": "配置元件（config_items）"},
            {"id": "test_plan", "label_zh": "测试计划", "description": "计划级元件"},
        ],
        "context_allowed_categories": {
            k: sorted(v) for k, v in CONTEXT_ALLOWED_CATEGORIES.items()
        },
    }
