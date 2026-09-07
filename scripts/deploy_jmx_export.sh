#!/bin/bash
set -euo pipefail
cd /root/TestHub
echo "[1/3] build bundle..."
python3 scripts/build_jms_load_test_bundle.py
echo "[2/3] sync static to container..."
docker cp static/dist/jms-load-test/. testhub:/app/static/dist/jms-load-test/
for f in static/js/jms_jmx_export_self_check_v2.js static/js/jms_jmx_plan_variables_dedupe_v2.js \
  static/js/jms_jmx_variable_collect_export_v1.js static/js/jms_catalog_jmx_prepare_export_v1.js \
  static/js/jms_catalog_http_defaults_dedupe_v1.js static/js/jms_http_path_query_jmx_v1.js \
  static/js/jms_catalog_aux_jmx.js \
  static/js/jms_jmx_export_self_check_v1.js static/js/jms_catalog_empty_config_suppress_v1.js \
  static/js/jms_catalog_jmx_props_normalize_v1.js static/js/jms_step_cookie_manager_jmx.js \
  static/js/jms_tg_cookie_manager_jmx.js static/js/jms_backend_listener_catalog.js; do
  [ -f "$f" ] && docker cp "$f" "testhub:/app/$f"
done
echo "[3/3] golden check (optional)..."
if [ -f tests/jmx_export_golden/run_golden_check.js ]; then
  node tests/jmx_export_golden/run_golden_check.js || echo "WARN: golden check failed"
fi
VER=$(grep 'BUNDLE_VERSION' scripts/build_jms_load_test_bundle.py | head -1)
echo "Done. $VER"
