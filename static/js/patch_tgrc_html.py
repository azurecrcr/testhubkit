import re
from pathlib import Path

VER = "20260630tgrcfix1"

def bump_file(p: Path, insert_css: bool, insert_js_defer: bool, insert_js: bool, extra_bumps: list):
    text = p.read_text(encoding="utf-8")
    css_line = f"    <link rel=\"stylesheet\" href=\"{{{{ url_for('static', filename='css/jms_tg_result_collector_actions.css') }}}}?v={VER}\">\n"
    js_defer = f"        <script src=\"{{{{ url_for('static', filename='js/jms_tg_result_collector_actions.js') }}}}?v={VER}\" defer></script>\n"
    js_plain = f"    <script src=\"{{{{ url_for('static', filename='js/jms_tg_result_collector_actions.js') }}}}?v={VER}\"></script>\n"
    if insert_css and "jms_tg_result_collector_actions.css" not in text:
        marker = "css/jms_tg_view_results_tree_ui.css"
        idx = text.find(marker)
        if idx >= 0:
            line_end = text.find("\n", idx)
            text = text[: line_end + 1] + css_line + text[line_end + 1 :]
    if "jms_tg_result_collector_actions.js" not in text:
        marker = "js/jms_tg_view_results_tree_catalog.js"
        idx = text.find(marker)
        if idx >= 0:
            line = js_defer if insert_js_defer else js_plain
            text = text[:idx] + line + text[idx:]
    for fn in extra_bumps:
        text = re.sub(
            rf"(filename='{re.escape(fn)}'\)\s*\}}\}})\?v=[^\"']+",
            rf"\1?v={VER}",
            text,
        )
    p.write_text(text, encoding="utf-8")
    print("patched", p)

bumps = [
    "js/jms_tg_view_results_tree_catalog.js",
    "js/jms_tg_view_results_tree_jmx.js",
    "js/jms_tg_view_results_tree_ui.js",
    "css/jms_tg_view_results_tree_ui.css",
    "js/jms_tg_aggregate_report_catalog.js",
    "js/jms_tg_aggregate_report_jmx.js",
    "js/jms_tg_aggregate_report_ui.js",
    "css/jms_tg_aggregate_report_ui.css",
]
bump_file(Path("/root/TestHub/templates/load_test_hub.html"), True, True, False, bumps)
bump_file(Path("/root/TestHub/templates/api_scenario_studio_scripts.html"), False, False, True, [
    "js/jms_tg_view_results_tree_catalog.js",
    "js/jms_tg_view_results_tree_jmx.js",
    "js/jms_tg_aggregate_report_catalog.js",
    "js/jms_tg_aggregate_report_jmx.js",
])
print("ok")
