#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$ROOT/frontend/tc-table"
OUT="$ROOT/static/dist/tc-vxe-table"
mkdir -p "$OUT"
docker run --rm -v "$FRONTEND:/app" -w /app node:20-alpine sh -c "npm install && npm run build"
cp -a "$FRONTEND/dist/." "$OUT/"
rm -rf "$FRONTEND/node_modules" "$FRONTEND/dist"
echo "Built -> $OUT"