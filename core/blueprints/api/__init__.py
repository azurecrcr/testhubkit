"""REST API 蓝图：按子模块注册路由，避免单文件过长。"""

from flask import Blueprint

api_bp = Blueprint("api", __name__, url_prefix="/api")


def _register_routes() -> None:
    from . import (
        admin_ai_quota_bonus,
        admin_daily_stats,
        auth,
        community,
        desktop_auth,
        desktop_agent,
        desktop_alias,
        user_ai_config,
        builtin_ai,
        case_management,
        defect_management,
        l5_bridge,
        doc_tools,
        feedback,
        jmeter_scenario,
        jmeter_scenario_catalog,
        jmeter_smoke_jtl,
        media,
        prompts,
        rag,
        test_cases,
        test_data_builder,
        text,
        toolkit_lock,
    )

    media.register_routes(api_bp)
    text.register_routes(api_bp)
    test_cases.register_routes(api_bp)
    auth.register_routes(api_bp)
    community.register_routes(api_bp)
    desktop_auth.register_routes(api_bp)
    desktop_agent.register_routes(api_bp)
    desktop_alias.register_routes(api_bp)
    user_ai_config.register_routes(api_bp)
    test_data_builder.register_routes(api_bp)
    jmeter_scenario.register_routes(api_bp)
    jmeter_scenario_catalog.register_routes(api_bp)
    jmeter_smoke_jtl.register_routes(api_bp)
    feedback.register_routes(api_bp)
    builtin_ai.register_routes(api_bp)
    toolkit_lock.register_routes(api_bp)
    prompts.register_routes(api_bp)
    rag.register_routes(api_bp)
    doc_tools.register_routes(api_bp)
    case_management.register_routes(api_bp)
    defect_management.register_routes(api_bp)
    l5_bridge.register_routes(api_bp)
    admin_daily_stats.register_routes(api_bp)
    admin_ai_quota_bonus.register_routes(api_bp)


_register_routes()

from .errors import register_error_handlers

register_error_handlers(api_bp)
