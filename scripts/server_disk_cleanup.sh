#!/usr/bin/env bash
# 低内存/磁盘紧张时：清理 Docker 悬空镜像、构建缓存、OmniFlow 旧 Allure 报告、MinIO 过期运行产物。
set -euo pipefail

KEEP_ALLURE_REPORTS="${KEEP_ALLURE_REPORTS:-3}"
OMNIFLOW_ROOT="${OMNIFLOW_ROOT:-${OMNIFLOW_ROOT}}"
MINIO_CONTAINER="${MINIO_CONTAINER:-testhub-minio}"
MINIO_USER="${MINIO_USER:-root}"
MINIO_PASS="${MINIO_PASS:-changeme-minio}"
MINIO_BUCKET="${MINIO_BUCKET:-openim}"
MINIO_PREFIX="${MINIO_PREFIX:-omniflow/runs/}"
MINIO_MAX_RUNS="${MINIO_MAX_RUNS:-5}"

echo "== Docker 悬空镜像与构建缓存 =="
docker image prune -af || true
docker builder prune -af || true

echo "== OmniFlow 旧 Allure HTML 报告（保留最近 ${KEEP_ALLURE_REPORTS} 个） =="
REPORT_DIR="${OMNIFLOW_ROOT}/reports/allure/report"
if [[ -d "${REPORT_DIR}" ]]; then
  mapfile -t OLD_REPORTS < <(ls -1dt "${REPORT_DIR}"/*/ 2>/dev/null | tail -n +"$((KEEP_ALLURE_REPORTS + 1))" || true)
  for d in "${OLD_REPORTS[@]:-}"; do
    [[ -n "${d}" ]] && rm -rf "${d}"
  done
fi

echo "== OmniFlow 本地截图/录像（7 天前） =="
find "${OMNIFLOW_ROOT}/artifacts/screenshots" -type f -mtime +7 -delete 2>/dev/null || true
find "${OMNIFLOW_ROOT}/artifacts/videos" -type f -mtime +7 -delete 2>/dev/null || true
find "${OMNIFLOW_ROOT}/log/runs" -type f -mtime +14 -delete 2>/dev/null || true

echo "== MinIO：保留 omniflow/runs 最近 ${MINIO_MAX_RUNS} 次运行目录 =="
docker exec "${MINIO_CONTAINER}" sh -c "
  mc alias set local http://127.0.0.1:9000 ${MINIO_USER} ${MINIO_PASS} >/dev/null 2>&1 || true
  if mc ls local/${MINIO_BUCKET}/${MINIO_PREFIX} >/dev/null 2>&1; then
    mc ls local/${MINIO_BUCKET}/${MINIO_PREFIX} | awk '{print \$NF}' | sed 's|/||' | sort -r | tail -n +$((MINIO_MAX_RUNS + 1)) | while read -r rid; do
      [[ -n \"\$rid\" ]] && mc rm -r --force \"local/${MINIO_BUCKET}/${MINIO_PREFIX}\${rid}/\" || true
    done
  fi
" || echo "MinIO 清理跳过（mc 不可用或无数据）"

echo "== 完成 =="
df -h / | tail -1
free -h | head -2
