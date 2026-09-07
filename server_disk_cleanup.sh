#!/usr/bin/env bash
# 清理 Docker 悬空镜像/构建缓存；可选清理 MinIO。
set -euo pipefail

MINIO_CONTAINER="${MINIO_CONTAINER:-testhub-minio}"
MINIO_USER="${MINIO_USER:-root}"
MINIO_PASS="${MINIO_PASS:-}"
MINIO_BUCKET="${MINIO_BUCKET:-openim}"
MINIO_PREFIX="${MINIO_PREFIX:-testhub/media/}"

echo "== Docker 悬空镜像与构建缓存 =="
docker image prune -af || true
docker builder prune -af || true

echo "== MinIO 可选清理 =="
if [[ -z "${MINIO_PASS}" ]]; then
  echo "MinIO 清理跳过（未设置 MINIO_PASS）"
else
  docker exec "${MINIO_CONTAINER}" sh -c "
    mc alias set local http://127.0.0.1:9000 ${MINIO_USER} ${MINIO_PASS} >/dev/null 2>&1 || true
    mc ls local/${MINIO_BUCKET}/${MINIO_PREFIX} >/dev/null 2>&1 || true
  " || echo "MinIO 清理跳过（mc 不可用或无数据）"
fi

echo "== 完成 =="
df -h / | tail -1
free -h | head -2
