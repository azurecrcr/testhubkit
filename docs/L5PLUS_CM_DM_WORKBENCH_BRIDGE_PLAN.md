# TestHub 产品内 L5+ 串联详细实施方案

> 版本：2026-07-28  
> 目标：在**不改用例工作台**、**缺陷无附件/截图**、**不做外部系统集成**的前提下，把「用例工作台（只读源）↔ 用例管理(CM) ↔ 缺陷管理(DM)」做成可辩护的**产品内 L5+ 闭环**。  
> 本方案供执行 AI 按 Phase 实施；**禁止跳过自测与清理**。

---

## 0. 一票否决（开干前必读）

### 0.1 绝对禁止

1. **禁止任何形式改动用例工作台**（功能、文案、逻辑、样式、API、构建产物、缓存参数均不许动），包括但不限于：
   - `static/js/tc_*`、`static/js/tc_workbench/**`、`static/css` 中工作台相关
   - `frontend/tc-table/**`、`frontend/tc-*`
   - `templates` 中工作台相关（含 `tc_workbench`、`tc_share*` 等）
   - `core/blueprints/api/test_cases/**`（工作台会话/生成/评审/分享等）
   - `core/services` 下工作台生成/评审/蓝湖页用例源逻辑（**读可以，写回/改行为禁止**）
   - 工作台构建脚本若会改工作台产物：`build_tc_workbench.sh`、`build_tc_vxe_table.sh` 等 **不要跑来“顺便优化”**
2. **禁止**缺陷附件、截图、粘贴传图、对象存储上传、附件表、附件 API、附件 UI。
3. **禁止**外部集成：Jira/禅道/飞书/企微/Webhook 出站、第三方 ALM 双向同步、CI 插件仓库对接等。  
   （允许：系统**内部**门禁查询 API，供本系统页面调用；**不要**做对外 webhook/第三方适配器。）
4. **禁止**破坏现有 CM/DM 行为：旧 API/旧方法/旧组件语义必须保持。会波及多调用方 → **新建 `*_l5` 方法/模块**。
5. **禁止** CM→工作台写回。工作台仅作 **只读导入/同步源**。

### 0.2 允许改动范围

| 允许 | 禁止 |
|------|------|
| `core/services/l5_bridge/**`（主战场，可增改） | 一切工作台路径（见 0.1） |
| `core/services/case_management/**` 仅**新增**文件或明显无调用方冲突的 `*_l5` | 改旧函数体语义 |
| `core/services/defect_management/**` 仅**新增**或 `*_l5` | 附件相关 |
| `core/blueprints/api/l5_bridge.py`（优先挂这里） | 为 L5 去大改 `case_management.py` / `defect_management.py` 旧路由行为 |
| `templates/case_management.html`、`defect_management.html`（只加 script/css 引用与必要挂点） | 工作台 templates |
| `static/js/case_management/**`、`static/js/defect_management/**`（优先新文件） | `static/js/tc_*` |
| `static/css/case_management.css`、`defect_management.css` | 工作台 CSS |
| DB：只加表/加列，不删旧列、不改旧列含义 | 破坏性迁移 |

### 0.3 命名与兼容约定

- 后端新能力：文件/函数后缀 `*_l5`，包优先 `core/services/l5_bridge/`。
- 旧方法（如 `set_case_links`、`update_defect`、`create_case`、`list_cases`）**保持不变**；增强用新函数包装调用旧函数。
- 前端：新 JS 文件（如 `gate_l5_ui.js`），在 HTML **追加** `<script>`；不要重写 `app.js` 大函数，只在明确入口增量挂接。
- API 前缀统一：`/api/l5/...`（已有 blueprint 继续扩展）。
- 响应可**追加**字段，不得删除/改义旧字段。

### 0.4 现状基线（执行前先承认，勿重复造空壳）

以下 **已有骨架**（`core/services/l5_bridge/` + `/api/l5/*` + CM/DM 部分 UI）。本方案是在其上 **补齐到产品内 L5+**，不是从零推翻。

| 已有 | 缺口（本方案要补） |
|------|-------------------|
| 深链/详情增强、links↔defect_ref 同步入口 | 血缘面板产品化、发版对象集合 |
| 执行→缺陷、回归 flag | 关单强制回归、回归清 flag 流程闸 |
| 计划/轮次/ready 入计划 | 多轮类型、轮次报告、硬门禁绑定 |
| 基线/diff、修订包装 | 发版绑定基线、ready 变更强制修订 |
| 治理看板、工作台 sync preview/apply | 同步批次审计、断链告警、产品化引导 |
| 缺陷 enrich/watch/relate/activity（部分） | 证据策略强制、活动全覆盖 |
| 审计表 + 运营页（写入极少） | **全量只追加审计** + 拒绝访问记账 + 导出 |
| 基础度量 + 14 日趋势 | MTTR/重开/待回归/版本维度、发版包 |
| 消息深链雏形 | 指派/状态/回归/门禁失败通知完备 |
| — | **硬门禁**、**发版追溯包**、**权限动作级 overrides** |

### 0.5 目标口径（写进交付说明）

- 在本约束下，交付目标表述为：**产品内 L5+ 闭环（工作台只读 · 无附件 · 无外部集成）**。
- 不宣称「含 Jira/CI 插件的业界全能 L5+」。
- 每个 Phase 结束必须能演示对应验收项。

### 0.6 自测与清理（每个大 Phase 强制）

1. **隔离数据**：项目名 `L5SELFTEST_P{N}_{YYYYMMDDHHMMSS}`；DM 场景成员 ≥2。
2. **脚本优先**：在 `scripts/l5_p{N}_selftest.py` 写可重复 API/服务层自测；UI 用手测清单勾选。
3. **回归抽测**（每 Phase 至少各 1 次）：
   - CM：项目切换、用例列表、执行记录、原「从工作台导入」、Excel 导入导出入口可点
   - DM：缺陷列表、新建、状态变更、关联用例（旧 API）
   - **工作台**：打开页面无新增报错；生成/评审入口可点（**只冒烟，不改代码**）
4. **证据**：`git diff --name-only`（或服务器文件对比）**不得**出现工作台禁止路径。
5. **清理**：删除本 Phase 全部 `L5SELFTEST_P{N}_*` 项目及相关用例/缺陷/计划/基线/审计/消息；确认无残留后再进下一 Phase。
6. **失败**：修当前 Phase，禁止带病进入下一 Phase。

### 0.7 推荐部署注意（服务器）

- 静态/模板/core 若 volume 挂载：Python 改动需 `docker restart testhub`；纯静态可只刷新缓存 `?v=`。
- `scripts/` 若未挂载进容器：自测用 `docker cp` 后 `PYTHONPATH=/app python3 /tmp/...`。
- 自测账号用现网测试用户，禁止删真实业务项目。

### 0.8 实施顺序（依赖）

```
P1  血缘面板与三页只读串联加固
 → P2  回归强制闭环（关单→待回归→清 flag）
 → P3  计划/轮次报告与范围治理
 → P4  硬门禁（可发布阻断）
 → P5  基线绑定发版 + ready 变更强制修订
 → P6  工作台→CM 同步产品化（只读源）
 → P7  缺陷证据策略与活动全覆盖（无附件）
 → P8  全量审计 + 动作级权限
 → P9  站内通知完备（无外部 webhook）
 → P10 决策度量 + 发版追溯包
 → P11 非功能、回归总检、交付声明
```

---

## 全局数据约定

### G1. 工作台映射（只读）

- CM 用例：`source='workbench'`，`source_ref="{lanhu_pid}|{lanhu_doc_id}|{lanhu_page_id}"`（与现网一致，勿臆造新格式）。
- 深链回工作台：仅使用**现有**工作台 URL 能力打开对应页；若现网无稳定深链参数，CM 侧展示 `source_ref` 文本 +「在工作台按页查找」说明，**禁止为深链去改工作台**。

### G2. 缺陷证据（无附件）

必填策略字段（L5 校验，新方法）：

- `repro_steps`、`expected_result`、`actual_result`、`environment` 文本非空（可配置长度下限，默认各 ≥5 字）
- `evidence_url`（新列，可空策略二选一，见 P7）：存纯文本 URL；**不做抓取、不做上传**
- UI 固定文案：不支持附件/截图，请用文字与外链

### G3. 审计事件（只追加）

统一写入 `cm_project_audit_l5`（已有表则扩展 action 枚举，不改表名语义）：

`actor_id, project_id, action, ref_type, ref_id, payload_json, created_at`

关键 action（P8 起强制覆盖）：见 Phase 8 列表。

### G4. 自测清理 SQL 原则

- 按 `cm_projects.name LIKE 'L5SELFTEST_%'` 找项目 ID
- 级联删 L5 表 + 项目下 cases/executions/defects/links/members
- **禁止** `DELETE` 不带自测前缀的项目

---

## Phase 1 — 血缘面板与三页串联加固

### 1.1 目标
用户在 CM/DM 能看清：工作台来源、关联缺陷/用例、最近执行、回归状态；互相跳转。不改工作台。

### 1.2 现状
已有 `nav_meta_l5.serialize_case_l5` / `serialize_defect_l5`、部分深链 UI。

### 1.3 后端（新方法）

文件：`core/services/l5_bridge/lineage_l5.py`（新建）

- `get_case_lineage_l5(user_id, case_id) -> dict`  
  聚合：case 摘要、`source/source_ref`、关联缺陷列表、regression flag、最近 N 条 execution、deep_links  
  内部可调用已有 serialize，**不要改**旧 `get_case`。
- `get_defect_lineage_l5(user_id, defect_id) -> dict`  
  聚合：缺陷摘要、cases_summary、活动摘要、deep_links
- API：
  - `GET /api/l5/cases/<id>/lineage`
  - `GET /api/l5/defects/<id>/lineage`

### 1.4 前端（新文件）

- `static/js/case_management/lineage_l5_ui.js`：用例抽屉内「血缘」区块（只读）
- `static/js/defect_management/lineage_l5_ui.js`：缺陷抽屉内「血缘」区块
- HTML 追加 script；**不改**工作台

### 1.5 验收

- [ ] CM 打开用例可见 source_ref 与关联缺陷跳转
- [ ] DM 打开缺陷可见关联用例与 last_result
- [ ] URL `project_id+case_id` / `defect_id` 仍能定位
- [ ] `git`/文件对比无工作台路径变更

### 1.6 自测与清理

- 脚本：`scripts/l5_p1_selftest.py`：建项目→用例(带假 source_ref)→缺陷关联→拉 lineage→断言字段→清理
- 手测：CM/DM 抽屉血缘；工作台冒烟打开

### 1.7 不得回归
旧 CM/DM 详情接口字段与行为。

---

## Phase 2 — 回归强制闭环

### 2.1 目标
缺陷关单/解决 → 关联用例进入 `pending` 回归；回归执行 `pass` → 清 flag；未清不得算门禁通过（为 P4 铺路）。

### 2.2 现状
`execution_defect.after_defect_status_change_l5`、`cm_case_regression_flags_l5` 已有雏形。

### 2.3 后端（新方法，勿改旧 update_defect 语义）

文件：扩展 `execution_defect.py` 或新建 `regression_flow_l5.py`

- `on_defect_resolved_or_closed_l5(defect_id, actor_id)`：对关联用例 upsert regression=`pending`
- `clear_regression_on_pass_l5(case_id, execution_id, actor_id)`：若 result=pass 且存在 pending，则 clear，并写审计
- `list_pending_regression_l5(user_id, project_id)`
- Hook 方式：在 **L5 状态变更封装** `update_defect_status_l5` 中调用；旧 `update_defect` 路径若已被 DM 使用，用**薄包装路由** `/api/l5/defects/<id>/status` 供新 UI，或在现有 status API 后**追加调用新 hook**（若追加，必须 try/except 且不影响主响应；更稳妥是新 API + 新 UI 按钮，旧按钮行为不变）

**推荐（更安全）**：  
- 旧状态变更逻辑不动  
- DM L5 面板增加「解决并标记回归」「关闭并标记回归」走新 API  
- 另提供「执行通过后清除回归」在 CM L5 执行成功回调里调用新方法（挂接新模块，不改原执行函数体核心逻辑）

### 2.4 前端

- CM：用例血缘/列表显示 `regression=pending` 徽章（新模块）
- DM：L5 操作提供「解决/关闭并通知回归」（新按钮，不替换旧状态控件也可）

### 2.5 验收

- [ ] 走新 API：关闭缺陷 → 关联用例 pending
- [ ] 用例执行 pass → pending 清除
- [ ] 旧 DM 状态变更路径行为与改前一致（若未挂 hook）

### 2.6 自测与清理
`scripts/l5_p2_selftest.py` 全链路断言 + 清理。

---

## Phase 3 — 计划 / 轮次报告与范围治理

### 3.1 目标
计划/轮次可运营：轮次类型、范围、统计报告；仅 ready 入计划（已有则加固）。

### 3.2 现状
`plan_run_l5` + `plan_run_ui.js` 已有。

### 3.3 后端（新方法）

- 表扩展（`schema_l5` 加列，兼容旧行）：
  - `cm_test_runs_l5.run_type`：`smoke|full|regression|custom`（默认 `custom`）
  - `cm_test_plans_l5.baseline_id` 可空（P5 再用）
- `build_run_report_l5(user_id, run_id) -> dict`：范围用例、各结果计数、关联缺陷、pending 回归数、未测项
- API：`GET /api/l5/runs/<run_id>/report`
- `add_run_items_l5` 保持只加 ready；错误信息明确

### 3.4 前端

- 扩展现有 `plan_run_ui.js`：**优先新增函数**渲染报告，避免改坏列表逻辑；若风险高则新文件 `plan_report_l5_ui.js`

### 3.5 验收

- [ ] 创建 smoke/regression 轮次
- [ ] 报告字段完整
- [ ] draft 用例无法加入

### 3.6 自测与清理
`scripts/l5_p3_selftest.py`

---

## Phase 4 — 硬门禁（可发布阻断）

### 4.1 目标
计划/版本维度质量门禁；不达标不能标记可发布。

### 4.2 后端（全新）

文件：`core/services/l5_bridge/gate_l5.py`

表：`cm_release_gates_l5`（示例）

```
id, project_id, plan_id NULL, name, rules_json, status(draft|active),
created_by, created_at, updated_at
```

`rules_json` 示例：

```json
{
  "min_pass_rate": 0.95,
  "max_open_p0": 0,
  "max_open_p1": 0,
  "max_pending_regression": 0,
  "require_baseline": true,
  "allow_non_ready_in_plan": false
}
```

方法：

- `evaluate_gate_l5(user_id, project_id, *, plan_id=None, run_id=None, baseline_id=None) -> {passed, failures[], metrics}`
- `set_plan_release_status_l5(user_id, plan_id, status)`：仅 `passed` 时允许 `releasable`；否则 400
- 计划表加列 `release_status`：`open|releasable|released`（默认 open）

API：

- `POST /api/l5/projects/<pid>/gates/evaluate`
- `GET /api/l5/plans/<plan_id>/gate`
- `POST /api/l5/plans/<plan_id>/release-status` body:`{status}`

**不做**对外 CI webhook；本系统页面调用即可。

### 4.3 前端

- `gate_l5_ui.js`：计划详情显示门禁结果；「标记可发布」按钮调新 API
- 失败列出 reasons

### 4.4 验收

- [ ] 故意造失败数据 → evaluate.passed=false 且不能 releasable
- [ ] 满足规则 → 可标记
- [ ] 旧计划列表仍可用

### 4.5 自测与清理
`scripts/l5_p4_selftest.py`

---

## Phase 5 — 基线绑定发版 + ready 变更强制修订

### 5.1 目标
发版/可发布要求绑定基线；修改 ready 用例走 L5 更新并强制留修订。

### 5.2 现状
`revision_baseline_l5` 已有 create/list/diff、`update_case_l5` 包装。

### 5.3 后端

- `bind_plan_baseline_l5(user_id, plan_id, baseline_id)`
- `update_ready_case_l5(user_id, case_id, data, *, change_note)`：  
  - 若原 status=ready，`change_note` 必填  
  - 调现有 `update_case` + `save_case_revision_l5`  
  - 写审计 `case_ready_edit`
- 门禁 `require_baseline=true` 时无绑定则失败（接 P4）
- **禁止**改旧 `update_case` 强制 note（避免影响现网编辑）

### 5.4 前端

- 计划 UI：选择基线绑定
- 用例编辑：仅当 ready 且走「L5 受控编辑」入口时要求变更说明（可做新入口，保留旧编辑不变）

### 5.5 验收

- [ ] 无基线时门禁失败（规则开启时）
- [ ] ready 受控编辑无 note → 400
- [ ] 旧编辑入口不强制 note

### 5.6 自测与清理
`scripts/l5_p5_selftest.py`

---

## Phase 6 — 工作台→CM 同步产品化（只读源）

### 6.1 目标
同步预览/应用可运营；批次可查；**绝不写回工作台、不改工作台代码**。

### 6.2 现状
`workbench_sync_l5` preview/apply、运营 Tab 已有。

### 6.3 后端

- 强化 `cm_workbench_sync_batches_l5` 写入：操作者、入参、counts、created/updated ids、错误
- `list_sync_batches_l5(user_id, project_id)`
- `detect_broken_source_links_l5`：CM 中 source=workbench 但源页不可读时标记 `source_broken`（只读检测；失败则记警告，不改工作台）
- API：`GET /api/l5/projects/<pid>/import/workbench/sync-batches`

### 6.4 前端

- L5运营「工作台同步」：展示历史批次；预览/应用结果结构化（不全靠 JSON dump）
- 文案明确：只读源、不改工作台

### 6.5 验收

- [ ] preview/apply 成功写批次
- [ ] 列表可查
- [ ] 工作台文件无变更；工作台冒烟 OK

### 6.6 自测与清理

- 自测尽量用**已存在的导入副本**或 mock 对比层；禁止删除用户真实蓝湖数据
- `scripts/l5_p6_selftest.py`：若无真实源，可单测「空参校验/权限/批次写入」+ 清理

---

## Phase 7 — 缺陷证据策略与活动全覆盖（无附件）

### 7.1 目标
缺陷可审计证据完整；无上传。

### 7.2 后端

- `schema_l5` 加列：`dm_defects.evidence_url VARCHAR(1000) NULL`
- `validate_defect_evidence_l5(defect_dict) -> None|raises`
- `update_defect_enrich_l5` 扩展校验：项目设置 `evidence_policy`：
  - `strict`：四文本 + evidence_url 均必填
  - `text_only`（默认）：四文本必填，url 可选
- 状态流转、指派、关联变更：一律 `record_defect_activity_l5`（通过新封装 `transition_defect_l5` / 在 L5 API 内写，不改旧 update 内部）

### 7.3 前端

- 强化 DM `l5_bridge_ui.js`：证据区、政策提示、无附件声明
- 禁止出现 file input / 粘贴上传

### 7.4 验收

- [ ] strict 下缺字段保存失败
- [ ] 无任何附件 API/UI
- [ ] 活动可查 enrich/关联等

### 7.5 自测与清理
`scripts/l5_p7_selftest.py`

---

## Phase 8 — 全量审计 + 动作级权限

### 8.1 目标
现实抽查级审计；动作级权限（overrides 可关=旧行为）。

### 8.2 权限

文件：`core/services/l5_bridge/access_l5.py`

- 表/配置：`cm_project_l5_settings` JSON：`{ "overrides_enabled": false, "reporter_can_edit": false, ... }`
- `assert_l5_action(user_id, project_id, action)`  
  action 例：`defect.create|defect.close|plan.release|baseline.create|sync.apply|gate.evaluate`
- `overrides_enabled=false` 时完全委托现有 `assert_project_*` / `assert_defect_*`

### 8.3 审计（核心）

文件：扩展 `activity_l5.py`

- `write_audit_l5` 保持；新增 `write_audit_denied_l5`（403 时由 access 层调用）
- **强制挂钩点**（均在新 L5 API/新封装内调用，避免改散落旧代码）：

| action | 何时 |
|--------|------|
| `case.create/update/delete` | L5 受控写路径；若只读审计旧路径，可用 **可选** after-hook 新中间层（默认先覆盖 L5 路径 + 计划/缺陷/同步/门禁/基线） |
| `execution.create` | L5 执行 API |
| `defect.create/update/status/link` | L5 缺陷 API |
| `plan.*` / `run.*` | plan_run |
| `baseline.*` / `sync.*` / `gate.*` | 对应模块 |
| `member.role_change` | 若做 L5 成员包装；否则文档声明「成员审计沿用现网，本 Phase 记 L5 域」 |
| `access.denied` | assert 失败 |

最低交付：**所有 `/api/l5/*` 写操作**必须写审计；读操作可不写。

- API 增强：`GET /api/l5/projects/<pid>/audit?action=&actor_id=&from=&to=&limit=`
- `GET /api/l5/projects/<pid>/audit/export.csv`

### 8.4 前端

- L5运营审计 Tab：筛选 + 导出
- 权限拒绝 toast 保持现网文案

### 8.5 验收

- [ ] 连续 10 类 L5 写操作均能在审计查到
- [ ] 故意越权出现 `access.denied`（或 403 且有记录）
- [ ] overrides 关闭时与旧权限一致
- [ ] 导出 CSV 可用

### 8.6 自测与清理
`scripts/l5_p8_selftest.py`（含越权用例，用第二用户）

---

## Phase 9 — 站内通知完备（无外部集成）

### 9.1 目标
关键事件站内消息 + 深链；**不做 webhook/第三方**。

### 9.2 后端

- 复用 `cm_user_messages`（或现网消息表）；类型：
  - `defect_assigned` / `defect_status` / `regression_pending` / `gate_failed` / `sync_done`
- `notify_l5(user_ids, msg_type, payload)` 新方法
- 在 P2/P4/P6/缺陷指派 L5 路径调用

### 9.3 前端

- 巩固 `messages_l5.js` 深链；补充新类型跳转（门禁→计划，同步→运营 Tab）

### 9.4 验收

- [ ] 各类型至少 1 条消息可点达正确页
- [ ] 无出站 webhook 代码

### 9.5 自测与清理
创建消息 → 验证 → 删自测消息与项目

---

## Phase 10 — 决策度量 + 发版追溯包

### 10.1 目标
度量可支撑发布决策；一键发版包（内部审计用）。

### 10.2 度量（新方法，不改旧 metrics 函数语义）

扩展 `project_metrics_detail_l5` 或新建 `project_metrics_decision_l5`：

- 已有：用例状态、执行通过率、缺陷状态、14 日趋势、pending 回归
- 新增：
  - `mttr_hours`（resolved/closed - created 的中位数或平均，仅已关单）
  - `reopen_rate`（若无 reopen 状态，用「closed→open 活动次数/关闭数」近似，基于 activity；无数据则返回 null 并注明）
  - `open_by_severity`
  - 按 `plan_id` 过滤的可选参数

API：`GET /api/l5/projects/<pid>/metrics?detail=1` 已存在则扩展字段；或 `?decision=1` 走新函数。

### 10.3 发版追溯包

文件：`release_pack_l5.py`

- `build_release_pack_l5(user_id, project_id, *, plan_id, baseline_id=None) -> dict`
  内容：计划信息、基线、门禁结果、用例清单与最后结果、缺陷清单、pending 回归、审计摘要（最近 N 条）、生成时间与操作者
- `export_release_pack_json_l5` / `export_release_pack_csv_bundle_l5`（可用 JSON + 多段 CSV）
- API：`GET /api/l5/plans/<plan_id>/release-pack.json`

**红项必须包含**：未执行、失败未转缺陷、pending 回归、门禁失败项。

### 10.4 前端

- 计划 UI：「导出发版包」
- 度量页展示 MTTR/重开等新字段

### 10.5 验收

- [ ] 发版包含红项字段
- [ ] 度量 decision 字段可算或显式 null
- [ ] CSV/JSON 无附件列

### 10.6 自测与清理
`scripts/l5_p10_selftest.py`

---

## Phase 11 — 非功能、总回归、交付声明

### 11.1 性能与安全

- 审计/度量/board 查询带 project_id 索引（已有则确认）
- 列表 page_size 上限保持
- 检查 L5 API IDOR：非项目成员 403
- 导出接口需 viewer 及以上

### 11.2 总回归清单

1. CM：CRUD、执行、Excel、工作台**原**导入、回收站、消息
2. DM：CRUD、评论（若有）、关联用例、成员门槛
3. L5：计划、门禁、基线、同步、审计、度量、发版包、血缘、回归
4. **工作台**：完整冒烟（打开、生成入口、评审入口）；确认无代码 diff
5. 确认无附件入口、无外部 webhook/集成模块

### 11.3 交付物（执行 AI 必须输出）

1. Phase 1–10 自测通过记录与清理声明  
2. 新增 API 列表（路径/方法/权限）  
3. 新增表/列说明  
4. `未修改用例工作台任何文件` 的路径核对结果  
5. 已知限制：无附件、无外部集成、工作台只读  

### 11.4 脚本

- `scripts/l5_p11_smoke_selftest.py`：串联只读健康检查（login 后关键 GET）+ 确认无 `L5SELFTEST_` 残留

---

## 建议新增/扩展文件清单（执行 AI 对照）

```
core/services/l5_bridge/lineage_l5.py          # P1
core/services/l5_bridge/regression_flow_l5.py  # P2
core/services/l5_bridge/gate_l5.py             # P4
core/services/l5_bridge/access_l5.py           # P8
core/services/l5_bridge/release_pack_l5.py     # P10
core/services/l5_bridge/schema_l5.py           # 各 Phase 加表加列
core/services/l5_bridge/activity_l5.py         # 审计增强
core/services/l5_bridge/metrics_l5.py          # 决策度量
core/services/l5_bridge/workbench_sync_l5.py   # P6 批次
core/services/l5_bridge/plan_run_l5.py         # P3 报告
core/services/l5_bridge/revision_baseline_l5.py# P5 绑定
core/blueprints/api/l5_bridge.py               # 只增路由

static/js/case_management/lineage_l5_ui.js
static/js/case_management/gate_l5_ui.js
static/js/case_management/plan_report_l5_ui.js
static/js/case_management/release_pack_l5_ui.js
static/js/defect_management/lineage_l5_ui.js
# 现有 cm_l5_ops_ui.js / plan_run_ui.js / l5_bridge_ui.js / messages_l5.js 上增量，慎改公共函数

scripts/l5_p1_selftest.py … scripts/l5_p10_selftest.py
scripts/l5_p11_smoke_selftest.py
```

**明确不要创建**：任何工作台文件、附件上传模块、jira/webhook 集成模块。

---

## 每 Phase 完工检查表（复制到交付说明）

```
[ ] 本 Phase 代码仅落在允许路径
[ ] 无工作台路径变更
[ ] 无附件/截图/外部集成
[ ] 旧 API/旧方法行为抽测通过
[ ] scripts/l5_pN_selftest.py 通过
[ ] L5SELFTEST_P{N}_* 已清理
[ ] 需要时已 docker restart testhub
[ ] 可以开始 Phase N+1
```

---

## 明确不做（防范围蔓延）

- 改用例工作台任何代码/文案/性能
- 缺陷附件、截图、粘贴传图
- Jira/禅道/飞书/Webhook/CI 插件等外部集成
- CM 写回工作台
- 为 L5 重构无关模块（UI 自动化、桌面端、音视频等）
- 用「改旧函数」图省事导致回归

---

## 附录 A — 缺陷无附件产品文案（UI 必须出现）

> 本系统缺陷管理不支持上传附件或截图。请填写复现步骤、期望结果、实际结果、环境信息；需要图片等证据时，请将外部文档链接以纯文本粘贴到「证据链接」。

## 附录 B — 与旧文档关系

- 旧文档 `docs/L5_CM_DM_BRIDGE_PLAN.md` 为第一轮骨架方案。  
- **执行以本文为准**；已实现部分见 §0.4，避免重复空壳，专注缺口 Phase。

---

**结束。执行 AI 必须按 Phase 顺序实施；每 Phase 自测并清理；工作台零变更是一票否决项。**
