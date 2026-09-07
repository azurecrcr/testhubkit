"""JMeter hashTree 层级放置规则 — 对齐客户端语义（隔离模块）。"""

# 插入上下文（由前端选中节点解析）
# test_plan        → 测试计划 hashTree 直接子级（线程组、计划级监听器/配置）
# thread_group     → 线程组 hashTree 内（控制器、取样器、配置…）
# controller       → 逻辑控制器 hashTree 内
# sampler_child    → 取样器 hashTree 内（断言、定时器、前/后置处理器）

CATEGORY_BY_CONTEXT = {
    "test_plan": {"thread_group", "config", "listener", "other"},
    "thread_group": {
        "controller", "sampler", "config", "timer",
        "preprocessor", "postprocessor", "assertion", "listener",
    },
    "controller": {
        "controller", "sampler", "config", "timer",
        "preprocessor", "postprocessor", "assertion", "listener",
    },
    "sampler_child": {"timer", "preprocessor", "postprocessor", "assertion", "config"},
}

# 线程组类 alias — 仅 test_plan
THREAD_GROUP_ALIASES = {
    "ThreadGroup", "SetupThreadGroup", "PostThreadGroup", "OpenModelThreadGroup",
    "Custom Thread Groups",  # plugin
}

# 测试计划级
TEST_PLAN_ONLY_ALIASES = {"TestPlan", "WorkBench"}

CONTAINER_CATEGORIES = {"controller"}
CONTAINER_ALIASES = THREAD_GROUP_ALIASES | {
    "TestFragmentController", "TestPlan",
}


def is_container(comp):
    cat = comp.get("category") or ""
    alias = comp.get("alias") or ""
    if cat in CONTAINER_CATEGORIES:
        return True
    if alias in CONTAINER_ALIASES:
        return True
    return False


def is_mountable(comp):
    return (comp.get("category") or "") in {
        "timer", "preprocessor", "postprocessor", "assertion", "config",
    }


def resolve_allowed_categories(context):
    return set(CATEGORY_BY_CONTEXT.get(context, CATEGORY_BY_CONTEXT["thread_group"]))


# 测试计划 hashTree 下常见配置元件（catalog JSON 中部分被误标为 controller）
PLAN_LEVEL_CONFIG_ALIASES = {
    "HeaderManager", "Arguments", "CookieManager", "CacheManager", "AuthManager",
    "CSVDataSet", "CounterConfig", "RandomVariableConfig", "DNSCacheManager",
    "KeystoreConfig", "LoginConfig", "ConfigTestElement",
}


def effective_category(comp, context):
    cat = comp.get("category") or "other"
    alias = comp.get("alias") or ""
    if context == "test_plan" and alias in PLAN_LEVEL_CONFIG_ALIASES:
        return "config"
    return cat


def component_allowed(comp, context):
    if not comp:
        return False
    cat = effective_category(comp, context)
    alias = comp.get("alias") or ""
    allowed = resolve_allowed_categories(context)
    if cat not in allowed:
        return False
    if alias in TEST_PLAN_ONLY_ALIASES and context != "test_plan":
        return False
    if alias in THREAD_GROUP_ALIASES and context != "test_plan":
        return False
    if cat == "thread_group" and context != "test_plan":
        return False
    if cat == "sampler" and context in ("test_plan", "sampler_child"):
        return False
    if context == "sampler_child" and cat == "listener":
        return False
    if context == "sampler_child" and cat == "controller":
        return False
    return True


def enrich_component(comp):
    out = dict(comp)
    out["container"] = is_container(comp)
    out["mountable"] = is_mountable(comp)
    return out


def build_hierarchy_meta():
    return {
        "contexts": [
            {"id": "test_plan", "label_zh": "测试计划", "hint": "可添加线程组、计划级监听器/配置"},
            {"id": "thread_group", "label_zh": "线程组", "hint": "可添加控制器、取样器、配置元件等"},
            {"id": "controller", "label_zh": "逻辑控制器内", "hint": "可添加子控制器、取样器及辅助元件"},
            {"id": "sampler_child", "label_zh": "取样器下", "hint": "可添加断言、定时器、前/后置处理器"},
        ],
        "category_by_context": {k: sorted(v) for k, v in CATEGORY_BY_CONTEXT.items()},
    }


def filter_components(components, context, query=""):
    q = (query or "").strip().lower()
    out = []
    for c in components or []:
        if not component_allowed(c, context):
            continue
        if q:
            hay = " ".join([
                c.get("alias", ""), c.get("label_zh", ""), c.get("class", ""), c.get("category", ""),
            ]).lower()
            if q not in hay:
                continue
        out.append(c)
    return out
