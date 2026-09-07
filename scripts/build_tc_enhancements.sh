#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/static/js/tc_workbench/features/enhancements"
OUT="$ROOT/static/dist/tc-workbench"
mkdir -p "$OUT"
: > "$OUT/tc-workbench-enhancements.js"
for f in tc_wb_enhancements_preamble.js tc_wb_gen_batch.js tc_qc_page_session.js tc_wb_validation.js tc_wb_export_report.js tc_wb_export_xmind.js tc_wb_export_fab_mindmap_review.js tc_wb_bootstrap.js; do
  echo "/* ---- $f ---- */" >> "$OUT/tc-workbench-enhancements.js"
  cat "$SRC/$f" >> "$OUT/tc-workbench-enhancements.js"
  echo "" >> "$OUT/tc-workbench-enhancements.js"
done
cp "$OUT/tc-workbench-enhancements.js" "$ROOT/static/js/tc_workbench_enhancements.js"
echo "built enhancements $(wc -c < "$OUT/tc-workbench-enhancements.js") bytes"
