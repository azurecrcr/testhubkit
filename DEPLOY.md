# Test Hub Kit 开源部署指南

本文档面向 **GitHub 开源仓库**（不含 Web UI 自动化、接口智能等私有模块）。  
按本文操作后：`git push` → GitHub Actions 自动跑验证（见 [.github/workflows/deploy-test.yml](.github/workflows/deploy-test.yml)）。

---

## 目录

1. [开源版包含什么](#1-开源版包含什么)
2. [环境要求](#2-环境要求)
3. [最快启动（Docker Compose）](#3-最快启动docker-compose)
4. [环境变量详解](#4-环境变量详解)
5. [GitHub 自动验证（CI）](#5-github-自动验证ci)
6. [手动部署步骤](#6-手动部署步骤)
7. [生产环境建议](#7-生产环境建议)
8. [常见问题](#8-常见问题)
9. [文件清单](#9-文件清单)

---

## 1. 开源版包含什么

| 功能 | 状态 | 入口 |
|------|------|------|
| 用例工作台（AI 生成） | ✅ | `/tool/test-cases` |
| 用例管理 | ✅ | `/tool/case-management` |
| 缺陷管理 | ✅ | `/tool/defect-management` |
| 压测造数（JMeter + HTTP 造数） | ✅ | `/tool/api-scenario-studio` |
| 媒体与数据工具箱 | ✅ | `/tool/media-data-hub` |
| 智能编辑（Excel + AI） | ✅ | `/tool/doc-tools` |
| 提示词库 | ✅ | `/prompts` |
| 账号 / 消息 / 反馈 | ✅ | `/auth` |
| **Web UI 自动化** | ❌ 不开源 | 见 [opensource-exclude.txt](opensource-exclude.txt) |
| **接口智能** | ❌ 不开源 | 同上 |

私有模块列表：[opensource-exclude.txt](opensource-exclude.txt)

---

## 2. 环境要求

### 最低配置（试用 / 小团队）

| 项目 | 要求 |
|------|------|
| CPU | 2 核 |
| 内存 | 4 GB |
| 磁盘 | 20 GB |
| OS | Linux（推荐 Ubuntu 22.04+）或 Windows + WSL2 / Docker Desktop |
| Docker | 24+ |
| Docker Compose | v2（`docker compose` 命令） |

### 依赖服务（Compose 自带）

- **MySQL 8.0** — 用户、用例、缺陷、配置等
- **MinIO** — 头像、附件、媒体文件
- **Nginx** — 静态资源 + 反向代理

### 可选外部服务

- **OpenAI 兼容 API** — AI 用例生成、智能编辑等（不配则 AI 功能不可用，其余正常）
- **阿里云短信** — 手机验证码（默认关闭，可用邮箱注册）

---

## 3. 最快启动（Docker Compose）

```bash
# 1. 克隆
git clone https://github.com/azurecrcr/testhubkit.git
cd testhubkit

# 2. 准备环境变量
cp .env.opensource.example .env
# 编辑 .env：至少改 FLASK_SECRET_KEY、MYSQL_PASSWORD、MINIO_ROOT_PASSWORD

# 3. 创建运行时目录
mkdir -p uploads data/rag uploads/community

# 4. 构建并启动
docker compose -f docker-compose.opensource.yml up -d --build

# 5. 等待 MySQL 健康检查通过（约 30 秒），浏览器访问
#    http://localhost
```

### 验证是否成功

```bash
# 容器状态（mysql 应为 healthy）
docker compose -f docker-compose.opensource.yml ps

# 应用日志
docker logs testhub --tail 50

# HTTP 探测
curl -I http://localhost/app
# 期望：HTTP/1.1 200 或 302
```

### 停止 / 重启

```bash
docker compose -f docker-compose.opensource.yml down          # 停止，保留数据卷
docker compose -f docker-compose.opensource.yml down -v       # 停止并清空数据库（慎用）
docker compose -f docker-compose.opensource.yml restart testhub
```

---

## 4. 环境变量详解

完整示例：[.env.opensource.example](.env.opensource.example)

### 4.1 必填

| 变量 | 说明 | 示例 |
|------|------|------|
| `FLASK_SECRET_KEY` | Flask 会话签名密钥，**生产必改** | `openssl rand -hex 32` 输出 |
| `MYSQL_ROOT_PASSWORD` | MySQL root 密码 | 强密码 |
| `MYSQL_PASSWORD` | 应用用户 `testhub` 密码 | 强密码 |
| `MINIO_ROOT_PASSWORD` | MinIO 管理员密码 | 强密码 |

### 4.2 AI 模型（OpenAI 兼容）

| 变量 | 说明 | 默认 |
|------|------|------|
| `BUILTIN_AI_BASE_URL` | 文本模型 API 地址 | 无（需配置） |
| `BUILTIN_AI_API_KEY` | API Key | 无 |
| `BUILTIN_AI_MODEL` | 模型名 | 无 |
| `BUILTIN_AI_TEMPERATURE` | 温度 | `0.1` |
| `VISION_API_BASE_URL` | 视觉模型地址，空则复用文本 | 空 |
| `VISION_API_KEY` | 视觉 Key，空则复用文本 | 空 |
| `VISION_MODEL` | 视觉模型名 | `gpt-4o` |

配置方式二选一：

1. **环境变量**（`.env`）— 适合首次部署  
2. **管理后台** — 登录后「全站 AI 配置」（写入 MySQL `builtin_ai_config`）

### 4.3 认证

| 变量 | 说明 | 开源默认 |
|------|------|----------|
| `SMS_AUTH_ENABLED` | 短信验证码登录 | `false` |
| `EMAIL_REGISTER_DISABLED` | 禁用邮箱注册 | `false` |
| `PHONE_BIND_GATE_ENABLED` | 强制绑定手机 | `false` |

### 4.4 RAG 知识召回

| 变量 | 说明 | 默认 |
|------|------|------|
| `RAG_ENABLED` | 开启 RAG | `0`（关） |
| `RAG_EMBED_API_KEY` | Embedding API Key | 空 |
| `RAG_EMBED_BASE_URL` | Embedding API 地址 | 空 |

---

## 5. GitHub 自动验证（CI）

### 5.1 原理

仓库内有 `.github/workflows/deploy-test.yml`。  
**每次 push / PR** 到 `main` 或 `master`，GitHub Actions 自动执行：

| 步骤 | 做什么 |
|------|--------|
| 启动 MySQL 服务容器 | 模拟生产数据库 |
| `pip install -r requirements.txt` | 装 Python 依赖 |
| `python -m unittest discover -s tests` | 跑单元测试 |
| `create_app()` | 验证 Flask 能导入、连库、建表 |
| HTTP smoke | 访问 `/`、`/app`、`/auth` |
| `docker build` | 验证 Dockerfile 能构建 |
| `docker run` + curl | 验证容器内 gunicorn 能启动 |

### 5.2 你怎么用

```bash
git add .
git commit -m "your message"
git push origin main
```

然后打开 GitHub 仓库 → **Actions** 页 → 看 `Deploy Test` workflow 是否全绿。

### 5.3 只有文档、没有 workflow 会怎样？

- 只 push `DEPLOY.md` → **不会**自动验证  
- push 了 `.github/workflows/deploy-test.yml` → **会**自动验证

---

## 6. 手动部署步骤

不用 Compose、或需要改代码热更新时：

### 6.1 本地开发（Python 直跑）

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt gunicorn

export MYSQL_HOST=127.0.0.1
export MYSQL_USER=testhub
export MYSQL_PASSWORD=your-password
export MYSQL_DATABASE=testhub
export FLASK_SECRET_KEY=dev-secret

python app.py
# 访问 http://127.0.0.1:5000
```

MySQL 需先跑起来并执行 [scripts/mysql-init.sql](scripts/mysql-init.sql)。

### 6.2 仅构建 Docker 镜像

```bash
docker build -t testhub:local .
docker run --rm -p 5000:5000 \
  -e MYSQL_HOST=host.docker.internal \
  -e MYSQL_USER=testhub \
  -e MYSQL_PASSWORD=xxx \
  -e MYSQL_DATABASE=testhub \
  -e FLASK_SECRET_KEY=xxx \
  testhub:local
```

### 6.3 镜像内 JMeter

Dockerfile 多阶段构建：

1. 下载 Apache JMeter 5.6.3（本地无 `deploy/jmeter-tools/apache-jmeter-5.6.3.tgz` 时自动从 Apache 镜像站拉取）
2. 编译 `JmxLoadValidator.java` — 压测工作台 JMX 校验用

---

## 7. 生产环境建议

1. **改所有默认密码**：`FLASK_SECRET_KEY`、`MYSQL_*`、`MINIO_*`
2. **HTTPS**：在 `testhub-nginx` 前加一层反向代理（Caddy / 云 LB），或改 [deploy/nginx-testhub.conf](deploy/nginx-testhub.conf) 加证书
3. **备份**：定期备份 Docker volume `testhub_mysql_data`、`testhub_minio_data`
4. **AI Key**：用环境变量或管理后台配置，不要写进代码
5. **防火墙**：3306 / 10005 仅内网开放；对外只暴露 80/443
6. **日志**：`docker logs testhub`；Nginx 访问日志在容器内 `/var/log/nginx/access.log`

### 首次管理员

注册第一个账号后，在 MySQL 将其设为站点管理员（具体字段见 `core/services/auth/prompt_visibility_admin.py` 中 `is_site_manager` 逻辑，通常按邮箱白名单或 `hub_users` 表配置）。

---

## 8. 常见问题

### Q: push 后 Actions 红了怎么办？

1. 点进失败的 job 看日志  
2. 常见原因：单元测试失败、Docker 构建超时、MySQL 健康检查未就绪  
3. 本地复现：`pip install -r requirements.txt && python -m unittest discover -s tests`

### Q: 页面能开但 AI 报错？

检查 `.env` 里 `BUILTIN_AI_BASE_URL` / `BUILTIN_AI_API_KEY` / `BUILTIN_AI_MODEL` 是否已填，或在管理后台配置全站 AI。

### Q: MySQL 连接失败？

```bash
docker logs testhub-mysql
docker exec testhub-mysql mysqladmin ping -h 127.0.0.1 -uroot -p你的root密码
```

确认 `testhub` 容器 `MYSQL_HOST=mysql`（Compose 网络内服务名）。

### Q: MinIO 上传失败？

确认 MinIO 容器运行：`docker ps | grep minio`  
控制台：http://localhost:10006（账号密码见 `.env`）

### Q: 和 testhubkit.com 完整版差什么？

开源版不含 **Web UI 自动化**（OmniFlow + SSH 隧道 + Playwright MCP）和 **接口智能**。见 [opensource-exclude.txt](opensource-exclude.txt)。

### Q: docker-compose.example.yml 和 docker-compose.opensource.yml 区别？

- `docker-compose.example.yml` / `docker-compose.opensource.yml` — 开源公开栈示例  
- `docker-compose.opensource.yml` — **开源可用**，仅 mysql + minio + testhub + nginx

---

## 9. 文件清单

| 文件 | 用途 |
|------|------|
| [DEPLOY.md](DEPLOY.md) | 本文档 |
| [docker-compose.opensource.yml](docker-compose.opensource.yml) | 开源 Compose 栈 |
| [.env.opensource.example](.env.opensource.example) | 环境变量模板 |
| [Dockerfile](Dockerfile) | 应用镜像（Python + JMeter + ffmpeg） |
| [deploy/nginx-testhub.opensource.conf](deploy/nginx-testhub.opensource.conf) | 开源 Nginx（HTTP :80） |
| [scripts/mysql-init.sql](scripts/mysql-init.sql) | MySQL 首次初始化 |
| [.github/workflows/deploy-test.yml](.github/workflows/deploy-test.yml) | GitHub Actions 自动验证 |
| [opensource-exclude.txt](opensource-exclude.txt) | 不开源模块列表 |
| [requirements.txt](requirements.txt) | Python 依赖 |

---

## 相关链接

- 产品说明：[README.md](README.md)  
- 在线演示：https://testhubkit.com  
- 源码仓库：https://github.com/azurecrcr/testhubkit  
- 协议：[LICENSE](LICENSE)（GPLv3）
