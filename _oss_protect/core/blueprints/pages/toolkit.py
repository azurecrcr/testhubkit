from __future__ import annotations

from flask import Blueprint, redirect, render_template, request, url_for

from core.config.tools_registry import (
    LOAD_TEST_HUB_TOOL_ID,
    MEDIA_DATA_HUB_TOOL_ID,
    TC_HUB_TOOL_ID,
    TOOL_ROUTE_ALIASES,
    TOOLS,
    is_load_test_hub_route,
    is_media_data_hub_route,
    is_tc_hub_route,
    load_test_hub_tab_for_route,
    media_data_hub_tab_for_route,
)
from core.services.auth.admin_guard import get_admin_user


def _context_test_data_builder() -> dict:
    from core.blueprints.api.test_data_builder import (
        MAX_BATCH,
        PROTECTED_PLATFORM_MAX_REPEAT,
        get_protected_platform_domains,
    )

    return {
        "tdb_protected_domains": get_protected_platform_domains(),
        "tdb_protected_max_repeat": PROTECTED_PLATFORM_MAX_REPEAT,
        "tdb_max_batch": MAX_BATCH,
    }


# canonical tool_id → (template, extra_context)
_STANDALONE_PAGES: dict[str, tuple[str, object]] = {
    "doc-tools": ("doc_tools.html", lambda: {}),
    "case-management": ("case_management.html", lambda: {}),
    "defect-management": ("defect_management.html", lambda: {}),
}


def register_routes(bp: Blueprint) -> None:

    @bp.route("/tools/load-test-hub")
    @bp.route("/tools/api-scenario-studio")
    @bp.route("/tools/test-data-builder")
    def legacy_load_test_hub_tools_redirect():
        tab = request.args.get("tab")
        return redirect(url_for("pages.tool", tool_id=LOAD_TEST_HUB_TOOL_ID, tab=tab or "jmeter"))

    @bp.route("/tool/<tool_id>")
    def tool(tool_id: str):
        route_tool_id = tool_id
        normalized = TOOL_ROUTE_ALIASES.get(tool_id, tool_id)

        if is_tc_hub_route(route_tool_id):
            active_tool = next((item for item in TOOLS if item["id"] == TC_HUB_TOOL_ID), None)
            return render_template(
                "index.html",
                tools=TOOLS,
                active_tool=active_tool,
                active_page="tool",
            )

        if is_load_test_hub_route(route_tool_id):
            active_tool = next(
                (item for item in TOOLS if item["id"] == LOAD_TEST_HUB_TOOL_ID),
                None,
            )
            lth_tab = load_test_hub_tab_for_route(route_tool_id, request.args.get("tab"))
            lth_is_site_manager = get_admin_user() is not None
            extra = _context_test_data_builder()
            return render_template(
                "load_test_hub.html",
                tools=TOOLS,
                active_tool=active_tool,
                active_page="tool",
                lth_tab=lth_tab,
                lth_is_site_manager=lth_is_site_manager,
                **extra,
            )

        if is_media_data_hub_route(route_tool_id):
            active_tool = next(
                (item for item in TOOLS if item["id"] == MEDIA_DATA_HUB_TOOL_ID),
                None,
            )
            media_data_hub_tab = media_data_hub_tab_for_route(
                route_tool_id, request.args.get("tab")
            )
            data_tool_tab = "base64" if route_tool_id == "base64-converter" else "json"
            if route_tool_id == "audio-generator":
                media_tool_tab = "audio"
            elif route_tool_id == "image-format-converter":
                media_tool_tab = "format"
            else:
                media_tool_tab = "sizer"
            return render_template(
                "index.html",
                tools=TOOLS,
                active_tool=active_tool,
                active_page="tool",
                media_data_hub_tab=media_data_hub_tab,
                data_tool_tab=data_tool_tab,
                media_tool_tab=media_tool_tab,
            )

        if normalized in _STANDALONE_PAGES:
            template_name, ctx_fn = _STANDALONE_PAGES[normalized]
            extra = ctx_fn()
            active_tool = next((item for item in TOOLS if item["id"] == normalized), None)
            return render_template(
                template_name,
                tools=TOOLS,
                active_tool=active_tool,
                active_page=normalized,
                **extra,
            )

        active_tool = next((item for item in TOOLS if item["id"] == normalized), None)
        return render_template(
            "index.html",
            tools=TOOLS,
            active_tool=active_tool,
            active_page="tool",
        )
