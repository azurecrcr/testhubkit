import json
import os
import ssl
from datetime import timedelta

from flask import Flask, request

from core import config as app_config
from core.blueprints import register_blueprints
from core.config import BASE_DIR, UPLOADS_DIR, ensure_upload_dir
from core.config.tools_registry import build_hf_nav_sections
from core.jobs import (
    start_admin_daily_stats_push_thread,
    start_auth_security_log_retention_thread,
    start_cm_trash_cleanup_thread,
    start_openim_cleanup_thread,
    start_visual_attachments_cleanup_thread,
)


def create_app():
    ssl._create_default_https_context = ssl._create_unverified_context

    app = Flask(
        __name__,
        template_folder=os.path.join(BASE_DIR, "templates"),
        static_folder=os.path.join(BASE_DIR, "static"),
        static_url_path="/static",
    )
    app.secret_key = os.environ.get("FLASK_SECRET_KEY", "testhub-dev-secret-change-in-production")
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    if os.environ.get("TEMPLATES_AUTO_RELOAD", "").strip().lower() in ("1", "true", "yes"):
        app.config["TEMPLATES_AUTO_RELOAD"] = True
    ensure_upload_dir()

    @app.context_processor
    def inject_image_tool_limits():
        return {
            "IMAGE_MAX_UPLOAD_BYTES": app_config.MAX_IMAGE_UPLOAD_BYTES,
            "IMAGE_MAX_UPLOAD_MB": app_config.MAX_IMAGE_UPLOAD_MB,
            "IMAGE_TOOL_TIMEOUT_MS": app_config.IMAGE_TOOL_REQUEST_TIMEOUT_MS,
            "IMAGE_TOOL_MAX_RETRIES": app_config.IMAGE_TOOL_REQUEST_MAX_RETRIES,
            "IMAGE_TOOL_RETRY_DELAY_MS": app_config.IMAGE_TOOL_REQUEST_RETRY_DELAY_MS,
        }

    @app.context_processor
    def inject_hf_nav_sections():
        return {"hf_nav_sections": build_hf_nav_sections()}

    @app.context_processor
    def inject_toolkit_lock():
        try:
            from core.services.toolkit_lock.toolkit_lock_db import (
                prompt_cards_are_blurred,
                toolkit_is_locked,
            )
            restricted = toolkit_is_locked()
            prompt_cards_blur = prompt_cards_are_blurred()
        except Exception:
            restricted = False
            prompt_cards_blur = True
        return {
            "hf_toolkit_restricted": restricted,
            "hf_toolkit_restricted_json": json.dumps(bool(restricted)),
            "hf_prompt_cards_blurred": prompt_cards_blur,
            "hf_prompt_cards_blurred_json": json.dumps(bool(prompt_cards_blur)),
        }

    @app.context_processor
    def inject_wb_flags():
        return {"TC_WB_BUNDLE_ENABLED": True}

    @app.context_processor
    def inject_site_brand():
        return {"hf_site_brand_title": "Test Hub Kit"}

    try:
        from flask_compress import Compress
        Compress(app)
    except ImportError:
        print("flask-compress 未安装，静态资源压缩已跳过")

    @app.after_request
    def hf_static_cache_headers(response):
        if request.path.startswith("/static/"):
            response.cache_control.public = True
            response.cache_control.max_age = 86400
            if request.args.get("v"):
                response.cache_control.max_age = 31536000
                response.cache_control.immutable = True
        return response

    register_blueprints(app)


    try:
        from core.services.auth.user_activity_tracker import register_user_activity_tracker
        register_user_activity_tracker(app)
    except Exception as exc:
        print("user_activity_tracker 注册跳过: %s" % exc)

    try:
        from core.services.auth.anon_activity_tracker import register_anon_activity_tracker
        register_anon_activity_tracker(app)
    except Exception as exc:
        print("anon_activity_tracker 注册跳过: %s" % exc)


    try:
        from core.services.feedback.feedback_db import ensure_feedback_table
        ensure_feedback_table()
    except Exception as exc:
        print("system_feedback 表初始化跳过: %s" % exc)

    try:
        from core.services.ai.builtin_ai_config_db import ensure_builtin_ai_config_table
        ensure_builtin_ai_config_table()
    except Exception as exc:
        print("builtin_ai_config 表初始化跳过: %s" % exc)

    try:
        from core.services.toolkit_lock.toolkit_lock_db import ensure_toolkit_lock_switch_table
        ensure_toolkit_lock_switch_table()
    except Exception as exc:
        print("toolkit_lock_switch 表初始化跳过: %s" % exc)

    try:
        from core.services.test_cases.case_template_service import init_case_template_storage
        init_case_template_storage()
    except Exception as exc:
        print("test_case_templates 表初始化跳过: %s" % exc)

    try:
        from core.services.test_cases.export_report_db import ensure_export_report_table
        ensure_export_report_table()
    except Exception as exc:
        print("tc_export_reports 表初始化跳过: %s" % exc)

    try:
        from core.services.test_cases.system_prompt_db import (
            ensure_tc_system_prompts_table,
            seed_tc_system_prompt_defaults,
        )
        ensure_tc_system_prompts_table()
        n = seed_tc_system_prompt_defaults()
        if n:
            print("tc_system_prompts: 已写入 %d 条默认提示词" % n)
    except Exception as exc:
        print("tc_system_prompts 表初始化跳过: %s" % exc)

    try:
        from core.services.prompts.prompt_submission_db import ensure_prompt_submissions_table
        ensure_prompt_submissions_table()
    except Exception as exc:
        print("prompt_submissions 表初始化跳过: %s" % exc)

    try:
        from core.services.jmeter_scenario.demo_seed_db import ensure_demo_seed_table
        ensure_demo_seed_table()
    except Exception as exc:
        print("jmeter_scenario_demo_seeds 表初始化跳过: %s" % exc)

    try:
        from core.services.jmeter_scenario.jmeter_user_scene_db import ensure_jmeter_user_scenes_table
        ensure_jmeter_user_scenes_table()
    except Exception as exc:
        print("jmeter_user_scenes 表初始化跳过: %s" % exc)


    try:
        from core.services.auth.auth_db import ensure_auth_tables
        ensure_auth_tables()
        from core.services.auth.user_default_avatar_service import (
            backfill_missing_default_avatars,
            backfill_stale_default_avatars_without_file,
        )
        n_avatar = backfill_missing_default_avatars()
        n_stale = backfill_stale_default_avatars_without_file()
        if n_avatar or n_stale:
            print("hub_users 默认头像: 新增 %d, 修复缺失文件 %d" % (n_avatar, n_stale))
    except Exception as exc:
        print("hub_users 等认证表初始化跳过: %s" % exc)

    try:
        from core.services.auth.desktop_db import ensure_desktop_auth_tables
        ensure_desktop_auth_tables()
    except Exception as exc:
        print("hub_desktop_* 表初始化跳过: %s" % exc)

    try:
        from core.services.auth.desktop_alias_db import ensure_desktop_alias_tables
        from core.services.auth.desktop_alias_service import ensure_builtin_seed

        ensure_desktop_alias_tables()
        ensure_builtin_seed()
    except Exception as exc:
        print("hub_desktop_alias_* 表初始化跳过: %s" % exc)


    try:
        from core.services.auth.user_activity_db import ensure_user_activity_tables
        ensure_user_activity_tables()
    except Exception as exc:
        print("hub_user_activity 表初始化跳过: %s" % exc)

    try:
        from core.services.auth.anon_activity_db import ensure_anon_activity_tables
        ensure_anon_activity_tables()
    except Exception as exc:
        print("hub_anon_uv 表初始化跳过: %s" % exc)


    try:
        from core.services.test_cases.validation_db import ensure_validation_tables
        ensure_validation_tables()
    except Exception as exc:
        print("tc_validation_runs 表初始化跳过: %s" % exc)

    try:
        from core.services.test_cases.agent_job_db import ensure_agent_job_tables
        ensure_agent_job_tables()
    except Exception as exc:
        print("tc_agent_jobs 表初始化跳过: %s" % exc)

    try:
        from core.services.test_cases.share_db import ensure_share_tables
        ensure_share_tables()
    except Exception as exc:
        print("tc_share_snapshots 表初始化跳过: %s" % exc)

    try:
        from core.services.case_management import ensure_cm_tables
        ensure_cm_tables()
    except Exception as exc:
        print("cm_* 用例管理表初始化跳过: %s" % exc)

    try:
        from core.services.ai.user_ai_daily_quota_db import ensure_user_ai_daily_usage_table
        ensure_user_ai_daily_usage_table()
    except Exception as exc:
        print("user_ai_daily_usage 表初始化跳过: %s" % exc)

    try:
        from core.services.ai.user_ai_quota_bonus_db import ensure_bonus_grant_table
        ensure_bonus_grant_table()
    except Exception as exc:
        print("user_ai_quota_bonus_grant 表初始化跳过: %s" % exc)

    werkzeug_main = os.environ.get("WERKZEUG_RUN_MAIN")
    flask_debug = os.environ.get("FLASK_DEBUG") == "1"
    should_start_cleanup = werkzeug_main == "true" or (werkzeug_main is None and not flask_debug)
    if should_start_cleanup:
        start_openim_cleanup_thread()
        start_visual_attachments_cleanup_thread()
        try:
            start_cm_trash_cleanup_thread()
        except Exception as exc:  # noqa: BLE001
            print("用例回收站清理线程启动失败: %s" % exc)
        try:
            start_admin_daily_stats_push_thread()
        except Exception as exc:  # noqa: BLE001
            print("管理员站点日报推送线程启动失败: %s" % exc)
        try:
            start_auth_security_log_retention_thread()
        except Exception as exc:  # noqa: BLE001
            print("安全日志留存清理线程启动失败: %s" % exc)

    # 嵌入式 Desktop MCP 反代（与 daemon 同机时启用；Docker 旁路请设 DESKTOP_RELAY_URL）
    if not (os.environ.get("DESKTOP_RELAY_URL") or "").strip():
        try:
            from core.services.desktop_relay.local_mcp_proxy import ensure_local_mcp_proxy_started

            if should_start_cleanup or werkzeug_main is None:
                info = ensure_local_mcp_proxy_started()
                if info.get("ok") and not info.get("already"):
                    print(
                        "desktop_relay mcp_proxy: %s:%s"
                        % (info.get("host"), info.get("port"))
                    )
                elif not info.get("ok"):
                    print("desktop_relay mcp_proxy 跳过: %s" % info.get("error"))
        except Exception as exc:
            print("desktop_relay mcp_proxy 跳过: %s" % exc)

    return app
