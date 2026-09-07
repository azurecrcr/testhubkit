#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/static/dist/dtk-vxe-table"
mkdir -p "$OUT"
docker run --rm -v "$ROOT:/work" -w "/work/frontend/dtk-vxe-table" node:20-alpine sh -c "npm install && npm run build"
echo "Built -> $OUT"
