"""工具注册表：首页卡片、全站顶栏分组导航、路由别名（单一数据源）。"""

from __future__ import annotations

from typing import Any

# 顶栏与首页分组的顺序与文案
TOOL_CATEGORIES: list[dict[str, str]] = [
    {
        "id": "cases",
        "label": "用例",
        "description": "用例生成、用例库与缺陷跟踪",
    },
    {
        "id": "automation",
        "label": "自动化",
        "description": "压测造数与工作流自动化",
    },
    {
        "id": "tools",
        "label": "工具",
        "description": "文档编辑与媒体、数据助手",
    },
]

# 顶栏各大类下拉内的二级分组（当前各大类已拆开，无需再套二级标题）
NAV_TOOL_GROUPS: list[dict[str, Any]] = []

TOOLS: list[dict[str, Any]] = [
    {
        "icon_image": "/static/images/home/icons/icon-test-cases.png",
        "id": "test-cases",
        "name": "用例工作台",
        "nav_name": "用例工作台",
        "description": "AI 生成测试用例与 Excel 转思维导图，Tab 切换一页完成",
        "icon": "📋",
        "category": "cases",
        "card_accent": "#4f46e5",
        "card_rgb": "79, 70, 229",
    },
    {
        "icon_image": "/static/images/home/icons/icon-test-cases.png",
        "id": "case-management",
        "name": "用例管理",
        "nav_name": "用例管理",
        "description": "项目目录、用例库、手工执行与工作台导入，独立于用例工作台",
        "icon": "📚",
        "category": "cases",
        "card_accent": "#0f766e",
        "card_rgb": "15, 118, 110",
    },
    {
        "icon_image": "/static/images/home/icons/icon-test-cases.png",
        "id": "defect-management",
        "name": "缺陷管理",
        "nav_name": "缺陷管理",
        "description": "团队项目缺陷跟踪（无附件），需先在用例管理组建团队",
        "icon": "🐞",
        "category": "cases",
        "card_accent": "#e11d48",
        "card_rgb": "225, 29, 72",
    },
    {
        "icon_image": "/static/images/home/icons/icon-doc-tools.png",
        "id": "doc-tools",
        "name": "智能编辑",
        "nav_name": "智能编辑",
        "description": "Excel 导入、表格在线编辑与 AI 辅助处理",
        "icon": "📄",
        "category": "tools",
        "card_accent": "#059669",
        "card_rgb": "5, 150, 105",
    },
    {
        "icon_image": "/static/images/home/icons/icon-api-scenario-studio.png",
        "id": "api-scenario-studio",
        "name": "压测造数工作台",
        "nav_name": "压测造数",
        "description": "JMeter 压测场景编排与 HTTP 批量造数，Tab 切换一页完成",
        "icon": "⚡",
        "category": "automation",
        "card_accent": "#0d9488",
        "card_rgb": "13, 148, 136",
    },
    {
        "icon_image": "/static/images/home/icons/icon-media-data-hub.png",
        "id": "media-data-hub",
        "name": "媒体与数据工具箱",
        "nav_name": "媒体工具箱",
        "description": "图片与音频处理，以及 JSON、编解码、文本对比、时间戳等开发助手",
        "icon": "🧰",
        "category": "tools",
        "card_accent": "#0891b2",
        "card_rgb": "8, 145, 178",
    },
]

# 兼容旧书签：路径段 → 当前 canonical tool id
TOOL_ROUTE_ALIASES: dict[str, str] = {
    "imagesizer": "media-data-hub",
    "image-format-converter": "media-data-hub",
    "audio-generator": "media-data-hub",
    "media-tool": "media-data-hub",
    "json-formatter": "media-data-hub",
    "base64-converter": "media-data-hub",
    "test-case-generator": "test-cases",
    "test-data-builder": "api-scenario-studio",
    "load-test-hub": "api-scenario-studio",
}

# 用例工作台：canonical id 与旧路由（用于 Tab 默认项）
TC_HUB_TOOL_ID = "test-cases"
TC_HUB_LEGACY_ROUTE_IDS = frozenset({"test-case-generator"})

# 压测造数工作台：canonical id 与旧路由（用于 Tab 默认项）
LOAD_TEST_HUB_TOOL_ID = "api-scenario-studio"
LOAD_TEST_HUB_LEGACY_ROUTE_IDS = frozenset({"test-data-builder", "load-test-hub"})

# 媒体与数据工具箱（原多媒体与编解码）
MEDIA_DATA_HUB_TOOL_ID = "media-data-hub"
MEDIA_DATA_HUB_LEGACY_ROUTE_IDS = frozenset(
    {"media-tool", "json-formatter", "base64-converter"}
)

STANDALONE_TOOL_IDS: frozenset[str] = frozenset({"doc-tools"})

_TOOLS_BY_ID: dict[str, dict[str, Any]] = {t["id"]: t for t in TOOLS}


def tool_nav_label(tool: dict[str, Any]) -> str:
    return str(tool.get("nav_name") or tool.get("name") or tool.get("id", ""))


def is_tc_hub_route(route_tool_id: str) -> bool:
    """URL 路径段是否属于用例工作台（含旧书签）。"""
    if route_tool_id in TC_HUB_LEGACY_ROUTE_IDS or route_tool_id == TC_HUB_TOOL_ID:
        return True
    return TOOL_ROUTE_ALIASES.get(route_tool_id) == TC_HUB_TOOL_ID



def is_load_test_hub_route(route_tool_id: str) -> bool:
    """URL 路径段是否属于压测造数工作台（含旧书签）。"""
    if route_tool_id in LOAD_TEST_HUB_LEGACY_ROUTE_IDS or route_tool_id == LOAD_TEST_HUB_TOOL_ID:
        return True
    return TOOL_ROUTE_ALIASES.get(route_tool_id) == LOAD_TEST_HUB_TOOL_ID


def load_test_hub_tab_for_route(route_tool_id: str, query_tab: str | None = None) -> str:
    """解析压测造数工作台默认 Tab：jmeter | data。"""
    if query_tab == "build":
        return "jmeter"
    if query_tab in ("jmeter", "data"):
        return query_tab
    if route_tool_id == "test-data-builder":
        return "data"
    return "jmeter"


def is_media_data_hub_route(route_tool_id: str) -> bool:
    """URL 路径段是否属于多媒体与编解码工作台（含旧书签）。"""
    if route_tool_id in MEDIA_DATA_HUB_LEGACY_ROUTE_IDS or route_tool_id == MEDIA_DATA_HUB_TOOL_ID:
        return True
    alias = TOOL_ROUTE_ALIASES.get(route_tool_id)
    if alias == MEDIA_DATA_HUB_TOOL_ID:
        return True
    if route_tool_id in ("imagesizer", "image-format-converter", "audio-generator"):
        return True
    return False


def media_data_hub_tab_for_route(route_tool_id: str, query_tab: str | None = None) -> str:
    """解析多媒体与编解码工作台顶层 Tab：media | codec。"""
    if query_tab in ("media", "codec"):
        return query_tab
    if route_tool_id in ("json-formatter", "base64-converter"):
        return "codec"
    return "media"


def filter_tools_for_viewer(tools: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """按当前登录态过滤工具列表；``admin_only`` 仅管理员可见。

    独立函数，不改动 ``TOOLS`` 常量本身，避免影响其它引用。
    """
    src = tools if tools is not None else TOOLS
    try:
        from core.services.auth.admin_guard import get_admin_user

        is_admin = get_admin_user() is not None
    except Exception:
        is_admin = False
    out: list[dict[str, Any]] = []
    for t in src:
        if t.get("admin_only") and not is_admin:
            continue
        out.append(dict(t))
    return out


def build_hf_nav_sections() -> list[dict[str, Any]]:
    """供 Jinja 使用的分组列表：含首页 tools 与顶栏 nav_items（支持子分组）。"""
    visible = filter_tools_for_viewer()
    visible_ids = {t["id"] for t in visible}
    sections: list[dict[str, Any]] = []
    for cat in TOOL_CATEGORIES:
        tid = cat["id"]
        category_tools = [dict(t) for t in visible if t.get("category") == tid]
        if not category_tools:
            continue

        grouped_ids: set[str] = set()
        nav_items: list[dict[str, Any]] = []
        for group in NAV_TOOL_GROUPS:
            if group.get("category") != tid:
                continue
            group_tools: list[dict[str, Any]] = []
            for tool_id in group.get("tool_ids") or []:
                if tool_id not in visible_ids:
                    continue
                src = _TOOLS_BY_ID.get(tool_id)
                if not src:
                    continue
                grouped_ids.add(tool_id)
                group_tools.append(dict(src))
            if group_tools:
                nav_items.append(
                    {
                        "type": "group",
                        "id": group["id"],
                        "label": group["label"],
                        "tools": group_tools,
                    }
                )

        for tool in category_tools:
            if tool["id"] in grouped_ids:
                continue
            nav_items.append({"type": "tool", "tool": tool})

        sections.append(
            {
                "id": tid,
                "label": cat["label"],
                "description": cat.get("description", ""),
                "tools": category_tools,
                "nav_items": nav_items,
            }
        )
    return sections
