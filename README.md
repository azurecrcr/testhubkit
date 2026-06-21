# Test Hub Kit

面向测试与开发者的在线工具箱。用例生成、压测编排、UI 自动化、提示词库、表格智能编辑与多媒体小工具，**浏览器打开即用**。

## 在线体验

https://testhubkit.com

> 无需安装客户端 · 无需手机号 · 无需强制注册 · 现代浏览器即可访问

---

## 主要功能

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| 用例工作台 | `/tool/test-cases` | 蓝湖对接、AI 生成、VXE 表格、思维导图、质量检测、协作评审 |
| 智能编辑 | `/tool/doc-tools` | Excel 导入在线改表，AI 悬浮助手批量处理 |
| 压测造数 | `/tool/api-scenario-studio` | JMeter 可视化编排、HTTP 批量造数（Tab 切换） |
| Web UI 自动化 | `/tool/ui-automation` | OmniFlow 步骤编排、截图录像、Allure 报告 |
| 提示词库 | `/prompts` | 实战提示词分类浏览、搜索、复制、投稿 |
| 媒体与数据工具 | `/tool/media-data-hub` | 图片/音频处理、JSON、编解码、Diff、时间戳 |
| 用例评审 | `/share/tc/<token>` | 分享链接只读查看，昵称评论 |

---

## 使用说明

1. 打开 https://testhubkit.com ，进入 `/app` 工具台首页
2. 点击工具卡片或顶栏导航，进入对应功能页
3. **绝大多数功能不用注册**；表格编辑、压测下载、小工具、提示词复制、UI 自动化执行等均可匿名使用
4. 仅在 **云端暂存、创建评审分享、个人 AI Key、蓝湖文档管理** 等场景，才需 **邮箱** 注册（验证码 + 密码，**无手机号**）

### 登录与权限对照

| 能力 | 免登录 | 需邮箱登录 |
| --- | :---: | :---: |
| 用例表格编辑 / Excel 导入导出 / AI 生成（内置 AI） | ✅ | ✅ |
| 思维导图、AI 转导图、XMind 导出 | ✅ | ✅ |
| 压测场景 ZIP、HTTP 批量造数 | ✅ | ✅ |
| 媒体/JSON/Base64/Diff 等小工具 | ✅ | ✅ |
| 提示词浏览复制、评审分享查看评论 | ✅ | ✅ |
| UI 自动化编排执行与报告 | ✅ | ✅ |
| 智能编辑页 AI 对话 | — | ✅ |
| 用例工作台附件上传、蓝湖文档 CRUD | — | ✅ |
| 创建评审分享、UI 自动化云端暂存 | — | ✅ |
| 个人 AI 配置、历史会话跨设备 | — | ✅ |

---

## 页面详细介绍

### 用例工作台 `/tool/test-cases`

一站式测试用例工作台，模板 `index.html` + `test_case_main.html`，前端为 **Jinja SSR + tc-workbench JS 分层 + Vue VXE 表格**。

**蓝湖需求树**
- 粘贴 Cookie 连接蓝湖，拉取站点树与页面需求正文
- 按页面节点触发 **页面级 AI 生成用例**
- 登录用户可保存/导入/编辑蓝湖文档（MySQL `user_lanhu_docs`）
- 页面内容服务端缓存，减少重复抓取

**AI 生成**
- 流式 SSE 生成（`generation-sessions` / `agent-jobs`）
- 预设/自定义 AI 模式，系统提示词模板可选
- **RAG 知识库**：ChromaDB 向量 + BM25 混合检索，增强生成上下文
- 视觉附件（PNG/PDF 等）注入 Vision 上下文（上传需登录）
- 页面生成锁，防止同页并发生成

**表格与导图**
- Vue 3 + VXE Table（`frontend/tc-table` → `dist/tc-vxe-table`）
- 增删行、列设置、Excel 导入/导出、键盘快捷键
- 表格 ↔ jsMind / SimpleMindMap 思维导图切换
- 绿色 FAB：**AI 转导图**、导出 Excel / XMind、用例评审分享

**智能编辑浮层**
- 对话式批量改表（`smart-edit/stream`）
- 附件 PNG/JPG/WebP/PDF/TXT，撤销上次编辑
- 历史会话：匿名浏览器本地 + 登录后云端 `workbench-sessions`

**质量检测**
- 独立 LLM 校验用例集，输出问题清单与覆盖率矩阵
- 一键 Agent 补充缺口用例

**协作评审**
- 登录用户创建分享快照 → `/share/tc/<token>`
- 访客只读表格 + 昵称评论，无需登录

---

### 智能编辑 `/tool/doc-tools`

独立整页 `doc_tools.html`，与用例工作台表格区解耦。

- 未导入 Excel 时表格区 **蒙层 + 居中导入按钮**
- 导入后 VXE 在线编辑（`frontend/dtk-vxe-table`）
- 列宽/行高拖拽、列填充、重新导入、清除、导出
- AI 悬浮面板：`POST /api/doc-tools/chat/stream`（**需登录** + 用户 AI 配置）
- 离开页未导出时浏览器警告

---

### 压测造数 `/tool/api-scenario-studio`

独立页 `load_test_hub.html`，两个 Tab 同页切换。

**Tab · JMeter 压测**（默认 `?tab=jmeter`）
- 可视化 HTTP 步骤链，YAML 场景编排
- 线程组、HTTP 默认值/头/Cookie、CSV、计数器、JSON 提取器、断言
- InfluxDB + Grafana 监控维度配置
- 校验通过后 **下载 JMeter ZIP**，本地 `localStorage` 暂存草稿
- 演示种子：`GET /api/jmeter-scenario/demo-seed`

**Tab · 数据构建**（`?tab=data`，旧路由 `/tool/test-data-builder`）
- cURL 导入解析为请求模板
- JSON 路径字段递增，服务端代发 HTTP（规避 CORS）
- 单批最多 500 条，大厂域名频率保护
- 导出 Python 脚本或请求日志 TXT

---

### Web UI 自动化 `/tool/ui-automation`

独立页 `omniflow_hub.html`，后端通过 **Docker exec** 调用 OmniFlow（Playwright）。

- 步骤编辑器：点击、输入、等待、断言、截图等
- 多环境 dev/test/uat，Mock、数据驱动（CSV/XLSX + `{{username}}`）
- **Locator Probe** 元素探测，Cookie 注入
- **SSH 反向隧道**：内网 Chrome CDP 联调
- 执行：`POST /api/ui-automation/runs` → 实时截图流 → 录像 → Allure 报告（MinIO 存储，Nginx 反代）
- **云端暂存**（登录，每用户最多 3 条）、稳定性统计 → `/tool/ui-automation/history`

---

### 媒体与数据工具 `/tool/media-data-hub`

`index.html` + `media_data_hub.html`，媒体 / 开发助手两个 Tab。

**媒体 Tab**
- 图片按 MB 压缩 → `POST /api/image-sizer`
- 格式转换 PNG/JPEG/WebP → `POST /api/image-format-converter`
- TTS 语音 edge-tts → `POST /api/audio-generator`

**开发助手 Tab**（`?tab=codec`）
- JSON 格式化、Base64、URL 编解码、文本 Diff、时间戳
- JSON/Base64 走服务端 API，其余主要为前端计算

---

### 提示词库 `/prompts`

- 分类卡片 + 弹窗全文 + 一键复制
- `GET /api/prompt-library` 列表，`POST` 投稿（邮件审核）
- 管理员可控制卡片可见性与蒙层锁

---

### 用例评审 `/share/tc/<token>`

- Tabulator 只读表格，加载分享快照
- 昵称 + 评论，无需登录
- API：`/api/test-cases/shares/by-token/<token>`

---

### 账号页

| 路径 | 说明 |
| --- | --- |
| `/auth` | 邮箱注册/登录（验证码或密码） |
| `/account/profile` | 头像、昵称、改密（**必须登录**） |
