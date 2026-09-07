#!/usr/bin/env python3
"""Build bundles and optimized head/body assets for load_test_hub (JMeter) only."""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"
OUT = STATIC / "dist" / "jms-load-test"
TEMPLATE = ROOT / "templates" / "load_test_hub.html"
BACKUP = TEMPLATE.with_suffix(".html.bak-pre-bundle")
SCRIPTS_PARTIAL = ROOT / "templates" / "partials" / "tools" / "api_scenario_studio_scripts.html"
BUNDLE_VERSION = "20260715ai-timer-cfg1"

LEGACY_BUNDLE_EXCLUDE_CANDIDATES = {
    "css/jms_http_beanshell_post_processor_ui.css",
    "css/jms_http_beanshell_preprocessor_ui.css",
    "css/jms_http_if_controller_ui.css",
    "css/jms_http_jdbc_post_processor_ui.css",
    "css/jms_http_json_extract_processor_ui.css",
    "css/jms_http_jsr223_post_processor_ui.css",
    "css/jms_http_loop_controller_ui.css",
    "css/jms_http_mount_enable_ui.css",
    "css/jms_http_random_controller_ui.css",
    "css/jms_http_regex_extract_processor_ui.css",
    "css/jms_http_simple_controller_ui.css",
    "css/jms_http_step_assertion_ui.css",
    "css/jms_http_step_config_ui.css",
    "css/jms_http_step_listeners_ui.css",
    "css/jms_http_step_preprocessor_ui.css",
    "css/jms_http_step_timer_ui.css",
    "css/jms_http_transaction_controller_ui.css",
    "css/jms_http_xpath_extract_processor_ui.css",
    "css/jms_tg_assertion_ui.css",
    "css/jms_tg_beanshell_post_ui.css",
    "css/jms_tg_debug_sampler_ui.css",
    "css/jms_tg_if_controller_ui.css",
    "css/jms_tg_jdbc_post_ui.css",
    "css/jms_tg_json_extract_ui.css",
    "css/jms_tg_jsr223_post_ui.css",
    "css/jms_tg_listener_menu_ui.css",
    "css/jms_tg_logic_ctrl_menu_ui.css",
    "css/jms_tg_loop_controller_ui.css",
    "css/jms_tg_post_proc_menu_ui.css",
    "css/jms_tg_random_controller_ui.css",
    "css/jms_tg_regex_extract_ui.css",
    "css/jms_tg_sampler_menu_ui.css",
    "css/jms_tg_simple_controller_ui.css",
    "css/jms_tg_toolbar_dropdown_menu_v1.css",
    "css/jms_tg_transaction_controller_ui.css",
    "css/jms_tg_xpath_extract_ui.css",
    "js/jms_assert_validation_notice.js",
    "js/jms_http_beanshell_post_processor_ui.js",
    "js/jms_http_beanshell_preprocessor_ui.js",
    "js/jms_http_card_toggle.js",
    "js/jms_http_context_ui.js",
    "js/jms_http_ctx_menu_coordinator.js",
    "js/jms_http_if_controller_ui.js",
    "js/jms_http_jdbc_post_processor_ui.js",
    "js/jms_http_json_assertion_ui.js",
    "js/jms_http_json_extract_processor_ui.js",
    "js/jms_http_jsr223_post_processor_ui.js",
    "js/jms_http_logic_mount_append.js",
    "js/jms_http_loop_controller_ui.js",
    "js/jms_http_md5hex_assertion_ui.js",
    "js/jms_http_mount_enable_ui.js",
    "js/jms_http_mount_timeline.js",
    "js/jms_http_mount_tree_rows.js",
    "js/jms_http_random_controller_ui.js",
    "js/jms_http_regex_extract_processor_ui.js",
    "js/jms_http_response_assertion_ui.js",
    "js/jms_http_simple_controller_ui.js",
    "js/jms_http_size_assertion_ui.js",
    "js/jms_http_step_agg_ui.js",
    "js/jms_http_step_assertion_ui.js",
    "js/jms_http_step_bl_ui.js",
    "js/jms_http_step_config_ui.js",
    "js/jms_http_step_listener_catalog.js",
    "js/jms_http_step_listener_jmx.js",
    "js/jms_http_step_listeners_ui.js",
    "js/jms_http_step_preprocessor_ui.js",
    "js/jms_http_step_timer_ui.js",
    "js/jms_http_step_user_params_ui.js",
    "js/jms_http_step_vrt_ui.js",
    "js/jms_http_transaction_controller_ui.js",
    "js/jms_http_xpath_extract_processor_ui.js",
    "js/jms_logic_ctrl_card_toggle.js",
    "js/jms_step_auth_manager_ui.js",
    "js/jms_step_cache_manager_ui.js",
    "js/jms_step_cookie_manager_ui.js",
    "js/jms_step_counter_ui.js",
    "js/jms_step_csv_data_set_ui.js",
    "js/jms_step_header_manager_ui.js",
    "js/jms_step_http_defaults_ui.js",
    "js/jms_tg_aggregate_report_ui.js",
    "js/jms_tg_assertion_ui.js",
    "js/jms_tg_backend_listener_ui.js",
    "js/jms_tg_beanshell_post_ui.js",
    "js/jms_tg_debug_sampler_ui.js",
    "js/jms_tg_if_controller_ui.js",
    "js/jms_tg_jdbc_post_ui.js",
    "js/jms_tg_json_extract_ui.js",
    "js/jms_tg_jsr223_post_ui.js",
    "js/jms_tg_logic_ctrl_menu_ui.js",
    "js/jms_tg_loop_controller_ui.js",
    "js/jms_tg_post_proc_menu_ui.js",
    "js/jms_tg_processor_ui.js",
    "js/jms_tg_random_controller_ui.js",
    "js/jms_tg_regex_extract_ui.js",
    "js/jms_tg_sampler_menu_ui.js",
    "js/jms_tg_simple_controller_ui.js",
    "js/jms_tg_transaction_controller_ui.js",
    "js/jms_tg_view_results_tree_ui.js",
    "js/jms_tg_xpath_extract_ui.js",
}

# 仅排除磁盘上仍存在的 legacy 资源（已物理删除的条目自动忽略）
LEGACY_BUNDLE_EXCLUDE = {
    p for p in LEGACY_BUNDLE_EXCLUDE_CANDIDATES if (STATIC / p).exists()
}


TAIL_CSS_AFTER_DATA_BUILDER = [
    "css/jms_tg_load_drawer_ui.css",
    "css/jms_scene_monitor_drawer_ui.css",
    "css/jms_tg_add_choice_ui.css",
    "css/jms_studio_workspace_glass.css",
]

POST_JS_CSS = [
    "css/jms_plan_common_delete_confirm_ui.css",
    "css/jms_tg_variables_delete_confirm_ui.css",
    "css/jms_tg_variables_editor_modal_ui.css",
    "css/jms_plan_common_config.css",
    "css/jms_studio_v2_steps_override.css",
    "css/jms_tg_tree_aux_actions_right_v2.css",
    "css/jms_studio_v2_tree_steps_compact.css",
    "css/jms_studio_v2_setup_tg_steps_gap.css",
    "css/jms_studio_v2_tree_step_row_unify.css",
    "css/jms_studio_v2_tree_step_menu_click_only.css",
    "css/jms_studio_v2_tree_aux_menu_clip_fix.css",
    "css/jms_studio_v2_tree_step_edit_modal_unify.css",
    "css/jms_tg_tree_head_actions_layout_fix.css",
    "css/jms_tg_tree_enable_menu_pin_fix.css",
    "css/jms_tg_logic_mount_toolbar_polish.css", "css/jms_catalog_native_card_mount_collapse_fix_v1.css",
    "css/jms_tg_mount_children_gap_unify.css",
    "css/jms_http_expand_mount_gap_fix.css",
    "css/jms_tg_tree_expand_top_blank_fix_v1.css",
    "css/jms_logic_ctrl_mount_toolbar_order_fix.css",
    "css/output_modal_ui.css",
    "css/jms_output_modal_jmx_tab_readability_v1.css",
    "css/jms_jmx_import_modal_green_v2.css",
    "css/jmx_import_modal_ui.css",
    "css/jms_studio_green_shell_v1.css",
    "css/jms_studio_modals_polish_v2.css",
    "css/jms_step_modals_green_unify_v3.css",
    "css/jms_debug_catalog_tree_row_fix_v1.css",
]

SHELL_CSS = [
    "css/page_shells.css",
    "css/toolkit.css",
]

KEEP_ASSETS = {
    "css/toolkit.css",
    "css/page_shells.css",
    "vendor/tailwindcss-cdn-3.4.10.js",
    "vendor/js-yaml-4.1.0.min.js",
    "js/hf_local_stash.js",
}

CSS_TAG_RE = re.compile(
    r'<link\s+rel="stylesheet"\s+href="\{\{\s*url_for\(\s*\'static\'\s*,\s*filename=\s*\'([^\']+)\'\s*\)\s*\}\}[^>]*>\s*',
    re.I,
)
JS_TAG_RE = re.compile(
    r'<script\s+src="\{\{\s*url_for\(\s*\'static\'\s*,\s*filename=\s*\'([^\']+)\'\s*\)\s*\}\}[^"]*"(?:\s+defer)?\s*></script>\s*',
    re.I,
)


def extract_assets(html: str):
    return [m.group(1).strip() for m in CSS_TAG_RE.finditer(html)], [
        m.group(1).strip() for m in JS_TAG_RE.finditer(html)
    ]


def dedupe_preserve_order(items):
    seen = set()
    out = []
    for x in items:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def read_external_from_partial(path: Path):
    text = path.read_text(encoding="utf-8")
    idx = text.find("<script>")
    head = text if idx < 0 else text[:idx]
    css, js = extract_assets(head)
    return css, js, text[idx:] if idx >= 0 else ""


def concat_files(paths, out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    parts = []
    for rel in paths:
        fp = STATIC / rel
        if not fp.is_file():
            raise FileNotFoundError(f"missing: {rel} -> {fp}")
        parts.append(f"/* ---- {rel} ---- */\n")
        parts.append(fp.read_text(encoding="utf-8"))
        parts.append("\n")
    content = "".join(parts)
    out_path.write_text(content, encoding="utf-8")
    return len(content)


def strip_bundled_assets(html: str, bundled_css, bundled_js):
    bundled_css_set = set(bundled_css)
    bundled_js_set = set(bundled_js)
    html = CSS_TAG_RE.sub(lambda m: "" if m.group(1).strip() in bundled_css_set else m.group(0), html)
    html = JS_TAG_RE.sub(lambda m: "" if m.group(1).strip() in bundled_js_set else m.group(0), html)
    return html


def write_partials(digest: str, css_tail: list):
    shell_partial = ROOT / "templates" / "partials" / "tools" / "load_test_hub_shell_css.html"
    shell_partial.write_text(
        "{# JMeter page shell CSS: page_shells + toolkit merged (single request) #}\n"
        f"{{# version: {BUNDLE_VERSION} #}}\n"
        f"    <link rel=\"stylesheet\" href=\"{{{{ url_for('static', filename='dist/jms-load-test/load-test-hub-shell.css') }}}}?v={BUNDLE_VERSION}\">\n",
        encoding="utf-8",
    )

    styles_partial = ROOT / "templates" / "partials" / "tools" / "load_test_hub_styles_bundle.html"
    styles_partial.write_text(
        "{# JMeter load_test_hub main CSS bundle #}\n"
        f"{{# version: {BUNDLE_VERSION} sha:{digest} #}}\n"
        f"    <link rel=\"stylesheet\" href=\"{{{{ url_for('static', filename='dist/jms-load-test/jms-load-test.css') }}}}?v={BUNDLE_VERSION}\">\n",
        encoding="utf-8",
    )

    tail_partial = ROOT / "templates" / "partials" / "tools" / "load_test_hub_styles_tail.html"
    if css_tail:
        tail_partial.write_text(
            "{# JMeter studio tail CSS — after test_data_builder_styles #}\n"
            f"{{# version: {BUNDLE_VERSION} #}}\n"
            f"    <link rel=\"stylesheet\" href=\"{{{{ url_for('static', filename='dist/jms-load-test/jms-load-test-tail.css') }}}}?v={BUNDLE_VERSION}\">\n",
            encoding="utf-8",
        )

    post_js_partial = ROOT / "templates" / "partials" / "tools" / "load_test_hub_styles_post_js.html"
    post_js_extras = ROOT / "templates" / "partials" / "tools" / "load_test_hub_styles_post_js.extras.html"
    extras_body = post_js_extras.read_text(encoding="utf-8") if post_js_extras.is_file() else ""
    post_js_partial.write_text(
        "{# JMeter CSS that must load after JS bundles (plan config + studio reset) #}\n"
        f"{{# version: {BUNDLE_VERSION} #}}\n"
        f"    <link rel=\"stylesheet\" href=\"{{{{ url_for('static', filename='dist/jms-load-test/jms-load-test-post-js.css') }}}}?v={BUNDLE_VERSION}\">\n"
        + extras_body,
        encoding="utf-8",
    )

    scripts_partial = ROOT / "templates" / "partials" / "tools" / "load_test_hub_scripts_bundle.html"
    scripts_partial.write_text(
        "{# JMeter load_test_hub JS bundle #}\n"
        f"{{# version: {BUNDLE_VERSION} sha:{digest} #}}\n"
        f"    <script src=\"{{{{ url_for('static', filename='dist/jms-load-test/jms-load-test-a.js') }}}}?v={BUNDLE_VERSION}\" defer></script>\n"
        f"    <script src=\"{{{{ url_for('static', filename='dist/jms-load-test/jms-load-test-b.js') }}}}?v={BUNDLE_VERSION}\" defer></script>\n"
        f"    <script src=\"{{{{ url_for('static', filename='js/jms_catalog_editor_schema_config_gui_v1.js') }}}}?v={BUNDLE_VERSION}\" defer></script>\n"
        f"    <script src=\"{{{{ url_for('static', filename='js/jms_catalog_editor_schema_official_gui_v1.js') }}}}?v={BUNDLE_VERSION}\" defer></script>\n"
        f"    <script src=\"{{{{ url_for('static', filename='js/jms_backend_listener_params_fidelity_v1.js') }}}}?v={BUNDLE_VERSION}\" defer></script>\n",
        encoding="utf-8",
    )

    vendors_partial = ROOT / "templates" / "partials" / "tools" / "load_test_hub_vendor_scripts.html"
    vendors_partial.write_text(
        "{# JMeter vendor scripts — defer to avoid blocking CSS in head #}\n"
        f"{{# version: {BUNDLE_VERSION} #}}\n"
        "    <script>(function(){var w=console.warn;console.warn=function(){var a=arguments[0];if(typeof a===\"string\"&&(a.indexOf(\"cdn.tailwindcss.com\")!==-1||a.indexOf(\"should not be used in production\")!==-1))return;return w.apply(console,arguments);};})();</script>\n"
        f"    <script src=\"{{{{ url_for('static', filename='vendor/tailwindcss-cdn-3.4.10.js') }}}}\" defer></script>\n"
        f"    <script src=\"{{{{ url_for('static', filename='vendor/js-yaml-4.1.0.min.js') }}}}\" defer></script>\n",
        encoding="utf-8",
    )

    tw_refresh = STATIC / "js" / "load_test_hub_tailwind_refresh.js"
    tw_refresh.write_text(
        "(function(){function r(){if(window.tailwind&&typeof window.tailwind.refresh==='function')window.tailwind.refresh();}"
        "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',r);else r();"
        "window.addEventListener('load',r);})();\n",
        encoding="utf-8",
    )


def build_template_html():
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>压测造数工作台 · {{{{ hf_site_brand_title }}}}</title>
    {{% include 'partials/hf_favicon.html' %}}
    {{% include 'partials/tools/load_test_hub_shell_css.html' %}}
    <script>(function(){{var w=console.warn;console.warn=function(){{var a=arguments[0];if(typeof a==="string"&&(a.indexOf("cdn.tailwindcss.com")!==-1||a.indexOf("should not be used in production")!==-1))return;return w.apply(console,arguments);}};}})();</script>
    <script src="{{{{ url_for('static', filename='vendor/tailwindcss-cdn-3.4.10.js') }}}}"></script>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }}
    </style>
    {{% include 'partials/tools/api_scenario_studio_styles.html' %}}
    {{% include 'partials/tools/load_test_hub_styles_bundle.html' %}}
    <link rel="stylesheet" href="{{{{ url_for('static', filename='css/jms_logic_ctrl_modal_shape_fix.css') }}}}?v={BUNDLE_VERSION}">
    <link rel="stylesheet" href="{{{{ url_for('static', filename='css/jms_postproc_modal_shape_fix.css') }}}}?v={BUNDLE_VERSION}">
    <link rel="stylesheet" href="{{{{ url_for('static', filename='css/jms_listener_modal_shape_fix.css') }}}}?v={BUNDLE_VERSION}">
    <link rel="stylesheet" href="{{{{ url_for('static', filename='css/jms_logic_ctrl_card_toggle.css') }}}}?v=20260702logicctrltoggle1">
    <link rel="stylesheet" href="{{{{ url_for('static', filename='css/jms_assert_modal_shape_fix.css') }}}}?v={BUNDLE_VERSION}">
    {{% include 'partials/tools/test_data_builder_styles.html' %}}
    {{% include 'partials/tools/load_test_hub_styles_tail.html' %}}
    <link rel="stylesheet" href="{{{{ url_for('static', filename='css/jms_http_step_config_modal_shape_fix.css') }}}}?v={BUNDLE_VERSION}">
    <link rel="stylesheet" href="{{{{ url_for('static', filename='css/jms_http_beanshell_preproc_modal_shape_fix.css') }}}}?v={BUNDLE_VERSION}">
    <link rel="stylesheet" href="{{{{ url_for('static', filename='css/jms_assert_modal_surface_fix.css') }}}}?v={BUNDLE_VERSION}">
    <link rel="stylesheet" href="{{{{ url_for('static', filename='css/jms_body_appended_modal_cloak.css') }}}}?v={BUNDLE_VERSION}">
    </head>
{{% set _lth_page_tab = lth_tab | default('jmeter') %}}
<body class="jms-page lth-studio-v2 min-h-screen{{% if _lth_page_tab != 'data' %}} lth-hub-jmeter-tab{{% else %}} lth-hub-data-tab{{% endif %}}">
    {{% include 'partials/hf_global_nav.html' %}}

    {{% if _lth_page_tab == 'data' %}}
    <div class="lth-data-page__bg" aria-hidden="true">
        <img src="{{{{ url_for('static', filename='images/load-test/lth-data-page-bg.png') }}}}" alt="" class="lth-data-page__bg-img" width="1920" height="1600" loading="lazy" decoding="async">
        <div class="lth-data-page__bg-scrim"></div>
    </div>
    {{% else %}}
    <div class="lth-jmeter-page__bg" aria-hidden="true">
        <img src="{{{{ url_for('static', filename='images/load-test/lth-jmeter-page-bg.png') }}}}" alt="" class="lth-jmeter-page__bg-img" width="1920" height="1600" loading="lazy" decoding="async">
        <div class="lth-jmeter-page__bg-scrim"></div>
    </div>
    {{% endif %}}

    <div class="mx-auto max-w-7xl relative z-[1] px-4 py-1 sm:py-2 lth-hub-tab-wrap">
        {{% include 'partials/tools/load_test_hub_tabs.html' %}}
    </div>

    {{% include 'partials/tools/load_test_hub_vendor_scripts.html' %}}
    <script src="{{{{ url_for('static', filename='js/hf_local_stash.js') }}}}?v=20260526" defer></script>
    <script src="{{{{ url_for('static', filename='js/hf_jmeter_stash_ui.js') }}}}?v=20260708mountadd18" defer></script>
    {{% include 'partials/tools/load_test_hub_scripts_bundle.html' %}}
    {{% include 'partials/tools/load_test_hub_styles_post_js.html' %}}
    <script src="{{{{ url_for('static', filename='js/load_test_hub_tailwind_refresh.js') }}}}?v={BUNDLE_VERSION}" defer></script>
    {{% include 'partials/tools/load_test_hub_scripts_inline.html' %}}
    {{% set hf_footer_tdb_legal = (_lth_page_tab == 'data') %}}
    {{% include 'partials/hf_site_footer.html' %}}
</body>
</html>
"""


def main():
    src = BACKUP.read_text(encoding="utf-8") if BACKUP.is_file() else TEMPLATE.read_text(encoding="utf-8")
    css_lth, js_lth = extract_assets(src)
    css_partial, js_partial, inline_tail = read_external_from_partial(SCRIPTS_PARTIAL)

    exclude_css = set(SHELL_CSS + TAIL_CSS_AFTER_DATA_BUILDER + POST_JS_CSS + list(KEEP_ASSETS))
    css_all = dedupe_preserve_order([x for x in css_lth + css_partial if x not in KEEP_ASSETS])
    js_all = dedupe_preserve_order([x for x in js_lth + js_partial if x not in KEEP_ASSETS])



    _jmx_modal_ui = 'js/jmx_import_modal_ui.js'
    _jmx_csv_passthrough = 'js/jms_jmx_import_csv_passthrough_v1.js'
    _jmx_import_fidelity = 'js/jms_jmx_import_fidelity_v1.js'
    _config_gui = 'js/jms_catalog_editor_schema_config_gui_v1.js'
    _jmx_import_listener = 'js/jms_jmx_import_listener_step_v1.js'
    _jmx_import_ctrl_cfg = 'js/jms_jmx_import_controller_config_step_v1.js'
    _jmx_import_sampler_hash = 'js/jms_jmx_import_sampler_hash_timeline_v1.js'
    _jmx_import_header_norm = 'js/jms_jmx_import_header_props_normalize_v1.js'
    _jmx_parser = 'js/jmx_import_parser.js'
    if _jmx_import_listener not in js_all and (STATIC / _jmx_import_listener).is_file():
        if _jmx_parser in js_all:
            js_all.insert(js_all.index(_jmx_parser), _jmx_import_listener)
        if _jmx_import_ctrl_cfg not in js_all:
            js_all.insert(js_all.index(_jmx_parser), _jmx_import_ctrl_cfg)
        if _jmx_import_sampler_hash not in js_all:
            js_all.insert(js_all.index(_jmx_parser), _jmx_import_sampler_hash)
        if _jmx_import_header_norm not in js_all:
            js_all.insert(js_all.index(_jmx_parser), _jmx_import_header_norm)
        else:
            js_all.append(_jmx_import_listener)

    if _jmx_modal_ui not in js_all and (STATIC / _jmx_modal_ui).is_file():
        if _jmx_parser in js_all:
            js_all.insert(js_all.index(_jmx_parser) + 1, _jmx_modal_ui)
        else:
            js_all.append(_jmx_modal_ui)
    if _jmx_csv_passthrough not in js_all and (STATIC / _jmx_csv_passthrough).is_file():
        if _jmx_modal_ui in js_all:
            js_all.insert(js_all.index(_jmx_modal_ui) + 1, _jmx_csv_passthrough)
        elif _jmx_parser in js_all:
            js_all.insert(js_all.index(_jmx_parser) + 1, _jmx_csv_passthrough)
        else:
            js_all.append(_jmx_csv_passthrough)

    _summary_stats = 'js/jms_output_summary_stats_v1.js'
    _adv = 'js/jmx_scenario_advanced.js'
    if _summary_stats not in js_all and (STATIC / _summary_stats).is_file():
        if _adv in js_all:
            js_all.insert(js_all.index(_adv) + 1, _summary_stats)
        else:
            js_all.append(_summary_stats)

    _step_edit_fix = 'js/jms_studio_v2_tree_step_edit_fix.js'
    if _step_edit_fix not in js_all and (STATIC / _step_edit_fix).is_file():
        js_all.insert(0, _step_edit_fix)

    # ????????????? catalog/ui ???????????? bundle?
    _export_sync = 'js/jms_tg_config_export_sync.js'
    _catalog = 'js/jms_tg_config_catalog.js'
    if _catalog not in js_all and (STATIC / _catalog).is_file():
        _tree_renderer_js = 'js/jms_tg_tree_renderer.js'
        if _tree_renderer_js in js_all:
            js_all.insert(js_all.index(_tree_renderer_js), _catalog)
        else:
            js_all.insert(0, _catalog)
    _jmx_filter = 'js/jms_tg_jmx_export_filter.js'
    if _jmx_filter not in js_all and (STATIC / _jmx_filter).is_file():
        js_all.insert(0, _jmx_filter)

    _tg_scope = 'js/jms_tg_jmx_export_tg_scope.js'
    _config_jmx = 'js/jms_tg_config_jmx.js'
    if _tg_scope not in js_all and (STATIC / _tg_scope).is_file():
        if _config_jmx in js_all:
            js_all.insert(js_all.index(_config_jmx), _tg_scope)
        else:
            js_all.insert(0, _tg_scope)

    _logic_append = 'js/jms_tg_logic_ctrl_append_order.js'
    _http_logic_append = 'js/jms_http_logic_mount_append.js'
    _top_append = 'js/jms_tg_top_level_append.js'
    if _logic_append not in js_all and (STATIC / _logic_append).is_file():
        if _top_append in js_all:
            js_all.insert(js_all.index(_top_append), _logic_append)
        else:
            js_all.insert(0, _logic_append)
    if _http_logic_append not in js_all and (STATIC / _http_logic_append).is_file():
        _mount_tl = 'js/jms_http_mount_timeline.js'
        if _mount_tl in js_all:
            js_all.insert(js_all.index(_mount_tl) + 1, _http_logic_append)
        else:
            js_all.append(_http_logic_append)

    # catalog-tree-css-bundle-v3
    _tree_css = ['css/jms_tg_nav_viewport.css', 'css/jms_tg_nav_collapse.css', 'css/jms_tg_tree_layout.css',
        'css/jms_tg_if_scroll_chain_fix.css', 'css/jms_tg_tree_row_layout_fit.css',
        'css/jms_tg_tree_steps_single_column_v2.css', 'css/jms_tg_tree_drag_gutter_fix.css', 'css/jms_tg_tree_density_compact.css', 'css/jms_tg_tree_aux_compact.css', 'css/jms_tg_tree_head_polish.css', 'css/jms_tg_tree_head_toolbar.css', 'css/jms_tg_nav_head_center_v1.css', 'css/jms_tg_tree_http_fullwidth.css', 'css/jms_tg_tree_inline_actions.css', 'css/jms_tg_tree_listener_btn_polish.css', 'css/jms_tg_tree_more_btn_fix.css', 'css/jms_tg_tree_steps_bottom_spacer.css', 'css/jms_tg_tree_steps_top_pad_compact.css', 'css/jms_logic_ctrl_card_if_unify.css', 'css/jms_catalog_element_tree_layout_fit.css', 'css/jms_catalog_element_plan_v2.css', 'css/jms_studio_v2_grid_restore.css', 'css/jms_studio_v2_ctrl_cards.css', 'css/jms_catalog_sampler_ctrl_compact.css']
    for _tc in _tree_css:
        if _tc not in css_all and (STATIC / _tc).is_file():
            css_all.append(_tc)


    # tree-view-shell-bundle-v1 (left nav + right steps)
    _tree_js = [
        'js/jms_tg_nav_viewport.js',
        'js/jms_tg_nav_collapse.js',
        'js/jms_tg_tree_step_actions.js',
        'js/jms_tg_tree_renderer.js',
        'js/jms_tg_tree_scroll_preserve.js',
        'js/jms_tg_tree_shell.js',
        'js/jms_tg_tree_card_click_guard.js',
        'js/jms_tg_tree_studio_v2_enable.js',
    ]
    _vb = 'js/jmeter_visual_builder.js'
    for _tj in reversed(_tree_js):
        if _tj not in js_all and (STATIC / _tj).is_file():
            if _vb in js_all:
                js_all.insert(js_all.index(_vb) + 1, _tj)
            else:
                js_all.append(_tj)



    # catalog-only: skip http-step-preproc bundle

    # catalog-only: skip http-mount-full bundle

    # catalog-palette-bundle-v7
    _catalog_js = ['js/jms_hierarchy_rules.js', 'js/jms_insert_context_v2.js', 'js/jms_catalog_alias_map.js', 'js/jms_catalog_jmx_prepare.js', 'js/jms_export_validate_steps_v1.js', 'js/jms_catalog_props_mount_migrate_v1.js', 'js/jms_catalog_jmx_props_normalize_v1.js', 'js/jms_jmx_variable_collect_v1.js', 'js/jms_catalog_http_sampler_prepare_v1.js', 'js/jms_catalog_extract_export_v1.js', 'js/jms_catalog_sampler_children_order_v1.js', 'js/jms_jmx_script_sanitize_v1.js', 'js/jms_jmx_arguments_dedupe_v1.js', 'js/jmeter_jmx_extra_export_v2.js', 'js/jms_catalog_user_parameters_export_v1.js', 'js/jms_catalog_xpath_export_alias_v1.js', 'js/jms_catalog_empty_config_suppress_v1.js', 'js/jms_assertion_export_include_disabled_v1.js', 'js/jms_jmx_export_self_check_v1.js', 'js/jms_catalog_mount_jmx.js', 'js/jms_catalog_http_sampler_jmx.js', 'js/jms_catalog_controller_jmx.js', 'js/jms_step_csv_data_set_jmx.js', 'js/jms_step_cookie_manager_jmx.js', 'js/jms_step_cache_manager_jmx.js', 'js/jms_step_auth_manager_jmx.js', 'js/jms_catalog_config_jmx.js', 'js/jms_catalog_aux_jmx.js', 'js/jms_catalog_jmx_registry.js', 'js/jmx_catalog_element.js', 'js/jms_scenario_normalize.js', 'js/jms_catalog_legacy_purge.js', 'js/jms_catalog_tg_yaml_serializer.js', 'js/jms_catalog_yaml_export_guard.js', 'js/jms_catalog_steps_yaml.js', 'js/jms_jmx_import_catalog_bridge.js', 'js/jms_catalog_steps_yaml_export.js', 'js/jms_jmx_export_catalog_guard.js', 'js/jms_catalog_step_compat.js', 'js/jms_tg_listener_catalog_bridge.js', 'js/jms_mount_catalog_bridge.js', 'js/jms_if_mount_save_helper.js', 'js/jms_jmx_import_config_attach_v1.js', 'js/jms_jmx_import_sampler_hash_timeline_v1.js', 'js/jms_jmx_import_header_props_normalize_v1.js', 'js/jms_catalog_unify_migrate.js', 'js/jms_jmx_import_timeline_merge_v1.js', 'js/jms_if_mount_model.js', 'js/jms_if_mount_timeline.js', 'js/jms_tg_if_mount_tree_rows.js', 'js/jms_tg_catalog_element_tree.js', 'js/jms_studio_catalog_bridge_v2.js', 'js/jms_catalog_sampler_children.js', 'js/jms_catalog_sampler_children_jmx.js', 'js/jms_studio_catalog_bridge.js', 'js/jms_catalog_refresh.js', 'js/jms_catalog_refresh_scroll_sticky_v1.js', 'js/jms_catalog_context_append.js', 'js/jms_catalog_controller_mount_post_add_v1.js', 'js/jms_catalog_nested_depth_guard_v1.js', 'js/jms_catalog_controller_tree_child_append_v1.js', 'js/jms_catalog_schema_extend.js', 'js/jms_catalog_element_editor_schema.js', 'js/jms_catalog_editor_schema_jmeter_gui_v1.js', 'js/jms_catalog_post_add.js', 'js/jms_catalog_card_toggle.js', 'js/jms_catalog_element_editor_ui.js', 'js/jms_catalog_extract_apply_to_ux_v1.js', 'js/jms_catalog_element_delete_ui.js', 'js/jms_jmeter_dropdown_scroll_guard.js',
        'js/jms_jmeter_catalog_popup_anchor_fix.js',
        'js/jms_catalog_menu_v2.js', 'js/jms_studio_v2_step_edit_bridge.js', 'js/jms_studio_v2_tree_step_edit_unify.js', 'js/jms_catalog_sampler_ctrl_expand_ui.js', 'js/jms_catalog_mount_menu_bridge.js', 'js/jms_catalog_sampler_mount_refresh.js', 'js/jms_catalog_sampler_mount_post_add_fix_v1.js', 'js/jms_sampler_listener_mount_v1.js', 'js/jms_catalog_mount_context_ui.js', 'js/jms_tg_config_menu_ui.js', 'js/jms_tg_catalog_element_plan.js', 'js/jms_tg_catalog_element_native_view.js', 'js/jms_tg_catalog_element_plan_v2.js', 'js/jms_tg_tree_studio_v2_enable.js',
        'js/jms_jmeter_steps_scroll_chain_v1.js']
    _catalog_css = ['css/jms_catalog_menu_v2.css', 'css/jms_catalog_element_tree.css', 'css/jms_catalog_element_editor.css', 'css/jms_catalog_element_tree_unify.css', 'css/jms_catalog_element_plan.css', 'css/jms_tg_config_menu_ui.css']
    for _cj in _catalog_js:
        if _cj not in js_all and (STATIC / _cj).is_file():
            js_all.append(_cj)
    for _cc in _catalog_css:
        if _cc not in css_all and (STATIC / _cc).is_file():
            css_all.append(_cc)

    # tree step enable/disable (JMeter enabled) — JS + CSS
    _enable_ui_js = [
        'js/jms_tg_enable_dirty_sync.js',
        'js/jms_mgr_config_enable_ui.js',
        'js/jms_counter_config_enable_ui.js',
        'js/jms_logic_ctrl_enable_ui.js',
        'js/jms_tg_postproc_enable_ui.js',
        'js/jms_tg_sampler_enable_ui.js',
        'js/jms_assert_enable_ui.js',
        'js/jms_listener_enable_ui.js',
        'js/jms_tg_tree_step_enable_unify.js',
        'js/jms_tg_tree_head_badge_slots.js',
    ]
    _enable_ui_css = [
        'css/jms_counter_config_enable_ui.css',
        'css/jms_logic_ctrl_enable_ui.css',
        'css/jms_tg_postproc_enable_ui.css',
        'css/jms_tg_sampler_enable_ui.css',
        'css/jms_assert_enable_ui.css',
        'css/jms_listener_enable_ui.css',
        'css/jms_tg_tree_step_enable_unify.css',
    ]
    _tree_renderer_js = 'js/jms_tg_tree_renderer.js'
    for _ej in _enable_ui_js:
        if _ej not in js_all and (STATIC / _ej).is_file():
            if _tree_renderer_js in js_all:
                js_all.insert(js_all.index(_tree_renderer_js), _ej)
            else:
                js_all.append(_ej)
    for _ec in _enable_ui_css:
        if _ec not in css_all and (STATIC / _ec).is_file():
            css_all.append(_ec)

    # catalog-only: skip legacy component UI bundle

    if _export_sync not in js_all and (STATIC / _export_sync).is_file():
        if _catalog in js_all:
            js_all.insert(js_all.index(_catalog), _export_sync)
        else:
            js_all.insert(0, _export_sync)


    _path_query_jmx = 'js/jms_http_path_query_jmx_v1.js'
    _path_query = 'js/jms_http_path_query.js'
    if _path_query_jmx not in js_all and (STATIC / _path_query_jmx).is_file():
        if _path_query in js_all:
            js_all.insert(js_all.index(_path_query) + 1, _path_query_jmx)
        else:
            js_all.append(_path_query_jmx)

    _prepare_export = 'js/jms_catalog_jmx_prepare_export_v1.js'
    _var_collect_export = 'js/jms_jmx_variable_collect_export_v1.js'
    _plan_dedupe_v2 = 'js/jms_jmx_plan_variables_dedupe_v2.js'
    _http_def_dedupe = 'js/jms_catalog_http_defaults_dedupe_v1.js'
    _self_check_v2 = 'js/jms_jmx_export_self_check_v2.js'
    _jmx_prepare = 'js/jms_catalog_jmx_prepare.js'
    for _mod, _anchor in [
        (_var_collect_export, 'js/jms_jmx_variable_collect_v1.js'),
        (_plan_dedupe_v2, 'js/jms_jmx_arguments_dedupe_v1.js'),
        (_http_def_dedupe, 'js/jms_catalog_empty_config_suppress_v1.js'),
        (_prepare_export, _jmx_prepare),
        (_self_check_v2, 'js/jms_jmx_export_self_check_v1.js'),
    ]:
        if _mod not in js_all and (STATIC / _mod).is_file():
            if _anchor in js_all:
                js_all.insert(js_all.index(_anchor) + 1, _mod)
            else:
                js_all.append(_mod)

    _plan_dedupe_v3 = 'js/jms_jmx_plan_variables_dedupe_v3.js'
    _http_def_dedupe_v2 = 'js/jms_catalog_http_defaults_dedupe_v2.js'
    _event_tags_v1 = 'js/jms_backend_listener_event_tags_v1.js'
    _event_hook_v1 = 'js/jms_backend_listener_export_hook_v1.js'
    _path_strategy_v1 = 'js/jms_http_path_export_strategy_v1.js'
    _self_check_v3 = 'js/jms_jmx_export_self_check_v3.js'

    _var_snapshot_v1 = 'js/jms_jmx_variable_snapshot_v1.js'
    _var_merge_v2 = 'js/jms_jmx_variable_merge_export_v2.js'
    _var_materialize_v1 = 'js/jms_jmx_variable_materialize_v1.js'
    _plan_catalog_sanitize_v1 = 'js/jms_jmx_plan_catalog_sanitize_v1.js'
    _post_resolve_sanitize_v1 = 'js/jms_jmx_post_resolve_sanitize_v1.js'
    _http_def_dedupe_v3 = 'js/jms_catalog_http_defaults_dedupe_v3.js'
    _event_tags_v2 = 'js/jms_backend_listener_event_tags_v2.js'
    _event_hook_v2 = 'js/jms_backend_listener_export_hook_v2.js'
    _self_check_v4 = 'js/jms_jmx_export_self_check_v4.js'


    _pipeline_v1 = 'js/jms_jmx_export_pipeline_v1.js'
    _var_snapshot_v2 = 'js/jms_jmx_variable_snapshot_v2.js'
    _var_merge_v3 = 'js/jms_jmx_variable_merge_export_v3.js'
    _var_materialize_v2 = 'js/jms_jmx_variable_materialize_v2.js'
    _plan_catalog_sanitize_v2 = 'js/jms_jmx_plan_catalog_sanitize_v2.js'
    _post_resolve_sanitize_v2 = 'js/jms_jmx_post_resolve_sanitize_v2.js'
    _http_def_dedupe_v4 = 'js/jms_catalog_http_defaults_dedupe_v4.js'
    _plan_vars_writer = 'js/jms_jmx_plan_variables_writer_v1.js'
    _plan_catalog_writer = 'js/jms_jmx_plan_catalog_writer_v1.js'
    _event_tags_v3 = 'js/jms_backend_listener_event_tags_v3.js'
    _event_hook_v3 = 'js/jms_backend_listener_export_hook_v3.js'
    _finalize_v1 = 'js/jms_jmx_export_finalize_v1.js'
    _self_check_v5 = 'js/jms_jmx_export_self_check_v5.js'
    _diff_gate_v1 = 'js/jms_jmx_export_diff_gate_v1.js'




    if _jmx_import_fidelity in js_all:
        js_all = [x for x in js_all if x != _jmx_import_fidelity]

    if _config_gui in js_all:
        js_all = [x for x in js_all if x != _config_gui]
    if (STATIC / _config_gui).is_file():
        _cfg_anchor = 'js/jms_catalog_extract_apply_to_ux_v1.js'
        if _cfg_anchor not in js_all:
            _cfg_anchor = 'js/jms_catalog_editor_schema_jmeter_gui_v1.js'
        if _cfg_anchor in js_all:
            js_all.insert(js_all.index(_cfg_anchor) + 1, _config_gui)
        elif 'js/jms_catalog_element_editor_schema.js' in js_all:
            js_all.insert(js_all.index('js/jms_catalog_element_editor_schema.js') + 1, _config_gui)
        else:
            js_all.append(_config_gui)

    js_all = [x for x in js_all if x not in LEGACY_BUNDLE_EXCLUDE]

    _http_step_cfg_early = ['js/jms_http_step_config_catalog.js', 'js/jms_http_step_config_jmx.js']
    for _hsc in reversed(_http_step_cfg_early):
        if (STATIC / _hsc).is_file():
            if _hsc in js_all:
                js_all.remove(_hsc)
            js_all.insert(0, _hsc)


    css_all = [x for x in css_all if x not in LEGACY_BUNDLE_EXCLUDE]

    css_main = [x for x in css_all if x not in exclude_css]
    css_tail = [x for x in TAIL_CSS_AFTER_DATA_BUILDER if x in css_all or (STATIC / x).is_file()]
    post_js = [x for x in POST_JS_CSS if (STATIC / x).is_file()]

    shell_bytes = concat_files(SHELL_CSS, OUT / "load-test-hub-shell.css")
    css_main_bytes = concat_files(css_main, OUT / "jms-load-test.css")
    css_tail_bytes = concat_files(css_tail, OUT / "jms-load-test-tail.css") if css_tail else 0
    post_js_bytes = concat_files(post_js, OUT / "jms-load-test-post-js.css") if post_js else 0


    # http-step-config-order-fix: catalog/jmx before config_ui (defer load order)
    _cfg_ui = 'js/jms_http_step_config_ui.js'
    _cfg_deps = ['js/jms_http_step_config_catalog.js', 'js/jms_http_step_config_jmx.js']
    if _cfg_ui in js_all:
        _ui_idx = js_all.index(_cfg_ui)
        for _dep in reversed(_cfg_deps):
            if _dep in js_all:
                js_all.remove(_dep)
                js_all.insert(_ui_idx, _dep)

    js_mid = max(1, len(js_all) // 2)
    js_a_bytes = concat_files(js_all[:js_mid], OUT / "jms-load-test-a.js")
    js_b_bytes = concat_files(js_all[js_mid:], OUT / "jms-load-test-b.js")

    digest_src = b"".join(
        p.read_bytes()
        for p in [
            OUT / "load-test-hub-shell.css",
            OUT / "jms-load-test.css",
            OUT / "jms-load-test-tail.css",
            OUT / "jms-load-test-post-js.css",
            OUT / "jms-load-test-a.js",
            OUT / "jms-load-test-b.js",
        ]
        if p.is_file()
    )
    digest = hashlib.sha256(digest_src).hexdigest()[:12]

    write_partials(digest, css_tail)

    inline_partial = ROOT / "templates" / "partials" / "tools" / "load_test_hub_scripts_inline.html"
    body = inline_tail.strip()
    if body.startswith("<script>") and body.endswith("</script>"):
        body = body[len("<script>") : -len("</script>")].strip()
    inline_partial.write_text(
        "<script>\n"
        "window.addEventListener('load', function () {\n"
        + body
        + "\n});\n"
        "</script>\n",
        encoding="utf-8",
    )

    TEMPLATE.write_text(build_template_html(), encoding="utf-8")

    preload = ROOT / "templates" / "partials" / "tools" / "load_test_hub_preload.html"
    if preload.is_file():
        preload.unlink()

    manifest = OUT / "manifest.txt"
    manifest.write_text(
        "\n".join(
            [f"shell:{n}" for n in SHELL_CSS]
            + [f"css-main:{n}" for n in css_main]
            + [f"css-tail:{n}" for n in css_tail]
            + [f"css-post-js:{n}" for n in post_js]
            + [f"js-a:{n}" for n in js_all[:js_mid]]
            + [f"js-b:{n}" for n in js_all[js_mid:]]
        ),
        encoding="utf-8",
    )

    print(f"shell.css: {shell_bytes} bytes")
    print(f"css-main: {len(css_main)} -> {css_main_bytes} bytes")
    print(f"css-tail: {len(css_tail)} -> {css_tail_bytes} bytes")
    print(f"css-post-js: {len(post_js)} -> {post_js_bytes} bytes")
    print(f"js-a: {js_mid} -> {js_a_bytes} bytes")
    print(f"js-b: {len(js_all) - js_mid} -> {js_b_bytes} bytes")
    print(f"sha:{digest}")


if __name__ == "__main__":
    main()
