#!/bin/bash
# 同步 TestHub 前端静态资源到 testhub 容器（templates/core 已 volume 挂载，static 需 docker cp）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="${TESTHUB_CONTAINER:-testhub}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "container not running: $CONTAINER" >&2
  exit 1
fi

echo "sync static -> $CONTAINER"

# workbench bundles
docker cp "$ROOT/static/dist/tc-workbench/." "$CONTAINER:/app/static/dist/tc-workbench/"

# legacy mirror + css actually linked from index.html
docker cp "$ROOT/static/js/tc_workbench_enhancements.js" "$CONTAINER:/app/static/js/tc_workbench_enhancements.js"
docker cp "$ROOT/static/css/tc_workbench_enhancements.css" "$CONTAINER:/app/static/css/tc_workbench_enhancements.css"

# gen-chat module (quality check UI)
if [[ -d "$ROOT/static/dist/tc-gen-chat" ]]; then
  docker cp "$ROOT/static/dist/tc-gen-chat/." "$CONTAINER:/app/static/dist/tc-gen-chat/"
fi

# vxe table if present
if [[ -d "$ROOT/static/dist/tc-vxe-table" ]]; then
  docker cp "$ROOT/static/dist/tc-vxe-table/." "$CONTAINER:/app/static/dist/tc-vxe-table/"
fi

echo "verify shell modal z:"
docker exec "$CONTAINER" grep -o 'TC_WORKBENCH_MODAL_Z_BASE = [0-9]*' /app/static/dist/tc-workbench/tc-workbench-shell.js | head -1
echo "verify css dialog z:"
docker exec "$CONTAINER" grep -A1 'tc-app-dialog.tc-app-dialog-root' /app/static/css/tc_workbench_enhancements.css | tail -1
echo "done"
