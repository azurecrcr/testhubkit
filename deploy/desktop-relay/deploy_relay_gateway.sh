#!/usr/bin/env bash
# 在 TestHub 所在服务器以 root 执行：部署桌面 Agent 中继网关（替换 SSH -R/-L）。
# 用法：
#   cd /path/to/TestHub && bash deploy/desktop-relay/deploy_relay_gateway.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "==> TestHub root: $ROOT"

if [[ ! -f "$ROOT/core/blueprints/api/desktop_agent.py" ]]; then
  echo "ERROR: missing core/blueprints/api/desktop_agent.py — 请先同步最新代码到本机"
  exit 1
fi
if [[ ! -d "$ROOT/core/services/desktop_relay" ]]; then
  echo "ERROR: missing core/services/desktop_relay/"
  exit 1
fi

# 1) 宿主机独立 Relay（daemon 在 host 时必须；Flask 在 Docker 内无法替 host 监听 18770）
# API 需对 Docker 网桥可达（host.docker.internal），故默认 0.0.0.0；安全靠 DESKTOP_RELAY_TOKEN
# MCP 反代始终 127.0.0.1
API_HOST="${DESKTOP_RELAY_API_HOST:-0.0.0.0}"
API_PORT="${DESKTOP_RELAY_API_PORT:-18771}"
MCP_HOST="${DESKTOP_RELAY_MCP_HOST:-127.0.0.1}"
MCP_PORT="${DESKTOP_RELAY_MCP_PORT:-18770}"

ENV_FILE="$ROOT/.env"
touch "$ENV_FILE"

# 生成或复用内部 Token（强制；无 Token 时仅允许环回，Docker 将无法调用）
if grep -q '^DESKTOP_RELAY_TOKEN=.\+' "$ENV_FILE" 2>/dev/null; then
  RELAY_TOKEN="$(grep '^DESKTOP_RELAY_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
else
  RELAY_TOKEN="$(openssl rand -hex 24 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 64)"
  echo "DESKTOP_RELAY_TOKEN=${RELAY_TOKEN}" >> "$ENV_FILE"
fi
if [[ -z "$RELAY_TOKEN" ]]; then
  echo "ERROR: DESKTOP_RELAY_TOKEN empty"
  exit 1
fi

docker rm -f testhub-desktop-relay 2>/dev/null || true
docker run -d --name testhub-desktop-relay --restart unless-stopped \
  --network host \
  -v "$ROOT:/app" -w /app \
  -e DESKTOP_RELAY_API_HOST="$API_HOST" \
  -e DESKTOP_RELAY_API_PORT="$API_PORT" \
  -e DESKTOP_RELAY_MCP_HOST="$MCP_HOST" \
  -e DESKTOP_RELAY_MCP_PORT="$MCP_PORT" \
  -e DESKTOP_RELAY_TOKEN="$RELAY_TOKEN" \
  testhub:testhub-jwt \
  python /app/deploy/desktop-relay/relay_server.py
echo "==> relay_server container started (API ${API_HOST}:${API_PORT})"

# 2) 给 docker-compose 注入环境
grep -q '^DESKTOP_RELAY_URL=' "$ENV_FILE" 2>/dev/null || \
  echo 'DESKTOP_RELAY_URL=http://host.docker.internal:18771' >> "$ENV_FILE"
grep -q '^WORKBENCH_AGENT_API_KEY=' "$ENV_FILE" 2>/dev/null || \
  echo 'WORKBENCH_AGENT_API_KEY=' >> "$ENV_FILE"
grep -q '^WORKBENCH_AGENT_MODEL=' "$ENV_FILE" 2>/dev/null || \
  echo 'WORKBENCH_AGENT_MODEL=' >> "$ENV_FILE"

if ! grep -q 'WORKBENCH_AGENT_API_KEY=.\+' "$ENV_FILE"; then
  echo "WARN: 请编辑 $ENV_FILE 填写 WORKBENCH_AGENT_API_KEY（否则作业提交会 agent_unavailable）"
fi

# 3) 重启 testhub 容器以加载新 blueprints + Token
if command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' | grep -qx testhub; then
    docker restart testhub
    echo "==> docker restart testhub done"
  else
    echo "WARN: 未找到容器 testhub，请手动 docker compose up -d testhub"
  fi
fi

echo "==> 验收："
echo "  curl -sS http://127.0.0.1:${API_PORT}/health"
echo "  curl -sS -H \"X-Desktop-Relay-Token: \$DESKTOP_RELAY_TOKEN\" http://127.0.0.1:${API_PORT}/internal/device/x/online"
echo "  curl -sS http://127.0.0.1:${MCP_PORT}/health"
echo "  无 Token 的 register 应 401"
echo "完成。"
