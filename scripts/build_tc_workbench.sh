#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WB="$ROOT/static/js/tc_workbench"
OUT="$ROOT/static/dist/tc-workbench"
JS="$ROOT/static/js"
mkdir -p "$OUT"

concat() {
  local out="$1"; shift
  : > "$out"
  for f in "$@"; do
    [[ -f "$f" ]] || { echo "missing: $f" >&2; exit 1; }
    echo "/* ---- $(basename "$f") ---- */" >> "$out"
    cat "$f" >> "$out"
    echo "" >> "$out"
  done
}

bash "$ROOT/scripts/build_tc_enhancements.sh"

concat "$OUT/tc-workbench-core.js" \
  "$WB/l0_core/tc_workbench_store.js" \
  "$WB/l0_core/tc_table_bridge.js" \
  "$JS/tc_workbench_data.js" \
  "$WB/l0_core/tc_workbench_boot.js" \
  "$WB/l0_core/tc_gen_abort_stub.js" \
  "$WB/l1_foundation/tc_workbench_bus.js" \
  "$WB/l1_foundation/tc_dialog.js" \
  "$WB/l1_foundation/tc_left_panel_lock.js"

concat "$OUT/tc-workbench-services.js" \
  "$WB/l1_foundation/tc_http_media.js" \
  "$WB/l2_services/tc_context_budget.js" \
  "$WB/l2_services/tc_prompt_guard.js" \
  "$WB/l2_services/tc_workbench_session.js" \
  "$WB/l2_services/tc_requirement_case_store.js" \
  "$WB/l2_services/tc_requirement_mindmap_store.js" \
  "$WB/l2_services/tc_table_boot_loading.js" \
  "$WB/l2_services/tc_template_switch_session.js" \
  "$WB/l2_services/tc_gen_chat_pipeline.js" \
  "$WB/l2_services/tc_context_stack.js" \
  "$WB/l2_services/tc_rag_feature.js"

concat "$OUT/tc-workbench-generate.js" \
  "$WB/l3_ai/tc_ai_generate.js" \
  "$WB/l3_ai/tc_incremental_table.js" \
  "$WB/l3_ai/tc_incremental_mindmap.js" \
  "$WB/l3_ai/tc_generation_stream_ui.js" \
  "$WB/l3_ai/tc_generation_stream_client.js" \
  "$WB/l3_ai/tc_agent_orchestrator.js" \
  "$WB/l3_ai/tc_issue_matrix.js" \
  "$WB/l3_ui/tc_lanhu_drawer.js" \
  "$WB/l3_ui/tc_lanhu_doc_tree.js" \
  "$WB/l3_ui/tc_lanhu_tree_layout.js"

concat "$OUT/tc-workbench-edit.js" \
  "$WB/l4_domain/tc_state_provenance.js" \
  "$WB/l4_domain/tc_mindmap_data.js" \
  "$WB/l4_domain/tc_smm_runtime_config.js" \
  "$WB/l4_domain/tc_smm_canvas_shell.js" \
  "$WB/l4_domain/tc_smm_workbench_drag_guard.js" \
  "$WB/l4_domain/tc_simple_mindmap_editor.js" \
  "$WB/l4_domain/tc_mindmap_view.js" \
  "$WB/l4_domain/tc_table_chrome.js" \
  "$WB/l3_ui/tc_table_toolbar_ops.js" \
  "$WB/l5_app/tc_table_render.js" \
  "$WB/l5_app/tc_xmind_zen_export.js" \
  "$WB/l5_app/tc_view_convert_boot.js" \
  "$WB/l5_app/tc_ai_table_to_mindmap.js"



concat "$OUT/tc-workbench-smart-edit.js" \
  "$WB/l2_services/tc_smart_edit_prompt.js" \
  "$WB/l2_services/tc_smart_edit_schema.js" \
  "$WB/l3_ai/tc_smart_edit_apply.js" \
  "$WB/l3_ai/tc_mindmap_smart_edit_apply.js" \
  "$WB/l3_ui/tc_edit_chat.js" \
  "$WB/l3_ui/tc_edit_attachments.js" \
  "$WB/l3_ui/tc_edit_composer.js" \
  "$WB/l3_ui/tc_workbench_mode.js" \
  "$WB/l3_ai/tc_ai_smart_edit.js"

concat "$OUT/tc-workbench-stash.js" \
  "$WB/l4_domain/tc_mindmap_stash.js" \

concat "$OUT/tc-workbench-shell.js" \
  "$OUT/tc-workbench-core.js" \
  "$OUT/tc-workbench-services.js" \
  "$OUT/tc-workbench-generate.js" \
  "$OUT/tc-workbench-edit.js" \
  "$OUT/tc-workbench-stash.js" \
  "$OUT/tc-workbench-smart-edit.js"

for f in "$OUT"/*.js; do echo "built $(basename "$f") $(wc -c < "$f") bytes"; done
