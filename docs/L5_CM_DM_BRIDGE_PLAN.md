# TestHub L5+ 串联实施方案（工作台冻结 · 缺陷无附件）

> 版本：2026-07-27  
> 目标：用例工作台 + 用例管理(CM) + 缺陷管理(DM) 串联至业界 L5+  
> **硬约束（执行 AI 必须遵守）**：
> 1. **禁止**修改用例工作台页面、模板、静态 JS/CSS、相关 API/服务逻辑（含 `static/js/tc_*`、`tc_workbench*`、`frontend/tc-table`、工作台路由与生成/评审/分享）。工作台仅可作为 **只读导入源**。
> 2. **缺陷不允许上传附件和截图**（不新增附件表、上传接口、截图组件）。
> 3. 不破坏现有 CM/DM 功能；若改旧方法会影响其他调用方 → **新建方法**，旧方法保持行为。
> 4. 每完成一个「大方案(Phase)」必须 **自测** → 确认无回归 → **清理自测数据** → 再进入下一 Phase。
> 5. 自测只用隔离项目名（建议前缀 `L5SELFTEST_`），清理时按前缀/项目 ID 删除，禁止动真实业务数据。

---

## 0. 总原则与工程规范

### 0.1 允许改动的范围

| 允许 | 禁止 |
|------|------|
| `core/services/case_management/**`（可增新文件） | 一切用例工作台代码与产物 |
| `core/services/defect_management/**`（可增新文件） | 缺陷附件/截图上传 |
| `core/blueprints/api/case_management.py` / `defect_management.py`（只增路由或薄封装） | 改工作台 import 写回源表 |
| `templates/case_management.html` / `defect_management.html` | `templates` 中工作台相关 |
| `static/js/case_management/**` / `static/js/defect_management/**` | `static/js/tc_*`、`tc_workbench*` |
| `static/css/case_management.css` / `defect_management.css` | 工作台 CSS |
| 新 DB 迁移（只加表/加列，不删旧列语义） | 破坏性改旧 API 契约 |

### 0.2 新方法命名约定

- CM 桥接/闭环：`*_l5` / `*_bridge` / `*_closed_loop` 后缀或独立模块文件  
  例：`execution_defect_bridge.py`、`create_defect_from_execution_l5`
- DM：`set_case_links` **保持不变**；新增强制双向同步用 `set_case_links_and_sync_refs_l5`
- 前端：新模块文件，如 `static/js/case_management/execution_defect.js`，由 `app.js` **新增引用**，不改原有函数体语义（仅在明确入口挂接调用）

### 0.3 自测通用规程（每个 Phase 结束必做）

1. **准备**：登录测试账号；创建项目名 `L5SELFTEST_<Phase>_<时间戳>`；拉满成员 ≥2（DM 要求 `team_ready`）。
2. **功能路径**：按该 Phase「验收清单」逐条点测/API 测。
3. **回归**：该 Phase 声明「不得回归」的旧路径至少各测 1 次。
4. **清理**：
   - 删除自测项目（若支持 force 删）或软删用例 + 删除自测缺陷；
   - 确认无残留 `L5SELFTEST_` 项目；
   - 清理自测产生的消息（若可）。
5. **记录**：在 PR/交付说明写：`Phase N 自测通过；已清理 L5SELFTEST_*`。
6. **失败则**：修当前 Phase，禁止带已知缺陷进入下一 Phase。

### 0.4 推荐实施顺序（依赖）

```
P1 三页导航与只读血缘展示
 → P2 双向追溯（links ↔ defect_ref）
 → P3 执行→缺陷闭环（含回归标记）
 → P4 测试计划/轮次
 → P5 用例版本/基线
 → P6 CM 入库门禁与库治理（消费工作台评审结论：只读字段/标记，不改工作台）
 → P7 缺陷字段与协作加深（无附件）
 → P8 工作台→CM 增量同步（只读源）
 → P9 权限/通知/审计
 → P10 度量与外部集成出口
```

可合并交付，但 **自测仍按 Phase 边界** 做。

### 0.5 现有关键事实（实现时对齐，勿臆造）

- CM API 前缀：`/api/case-management`
- DM API 前缀：`/api/defect-management`
- 页面：`/tool/case-management`、`/tool/defect-management`
- 工作台导入只读：`source=workbench`，`source_ref="{lanhu_pid}|{lanhu_doc_id}|{lanhu_page_id}"`
- 导入 API：`GET .../import/workbench/sources`，`POST .../import/workbench/preview|import`
- 执行：`POST /api/case-management/cases/<id>/executions`，result∈`pass|fail|blocked|skip`
- 缺陷关联：`PUT /api/defect-management/defects/<id>/cases` 全量替换，≤50
- `cm_test_cases.defect_ref` 已存在但未与 links 同步
- DM 需项目成员 ≥2

---

## Phase 1 — 三页主数据串联（导航与入口，零写回工作台）

### 1.1 目标
用户可在 CM↔DM 间跳转；明确「工作台设计 → CM 入库 → 执行 → 缺陷」路径。**不改工作台任何代码。**

### 1.2 后端
- **不改**工作台导入写逻辑。
- 新建（可选）`core/services/case_management/nav_meta_l5.py`：  
  `build_case_deep_link(case_id)` → `/tool/case-management?project_id=&case_id=`  
  `build_defect_deep_link(defect_id)` → `/tool/defect-management?project_id=&defect_id=`
- CM `GET .../cases/<id>` 响应 **追加**字段（向后兼容）：  
  `defect_ids: number[]`（查 `dm_defect_case_links`，新查询函数 `list_defect_ids_for_case_l5`）  
  `deep_links: { case, defects[] }`
- DM `GET .../defects/<id>` 响应 **追加**：  
  `cases_summary: [{id,title,last_result,status}]`（新函数，不改旧 serialize 则包一层 `serialize_defect_l5`）

### 1.3 前端
- **CM** `static/js/case_management/deep_link_l5.js`：解析 URL `project_id/case_id`，打开对应用例抽屉；提供「查看关联缺陷」跳转。
- **DM** `static/js/defect_management/deep_link_l5.js`：解析 `defect_id`，打开抽屉；chips 点击跳 CM。
- 空态文案：DM 无成员时继续链到 CM（已有则保持）。
- **禁止**改工作台入口逻辑。

### 1.4 验收
- [ ] 带 query 打开 CM/DM 能定位到对象  
- [ ] 用例详情能跳到关联缺陷（无关联时提示）  
- [ ] 缺陷详情能跳到关联用例  
- [ ] 工作台页面资源 hash/行为与改前一致（抽查生成/评审入口仍可用且无报错）

### 1.5 自测与清理
- 建 `L5SELFTEST_P1_*` 项目，2 成员，1 用例，1 缺陷并关联。  
- 测深链跳转。  
- 删除项目/缺陷；确认工作台未被动过（git 无工作台文件 diff）。

---

## Phase 2 — 双向追溯（links ↔ defect_ref）

### 2.1 目标
`dm_defect_case_links` 为关联真源；`cm_test_cases.defect_ref` 与之同步展示；CM/DM 双向可查。

### 2.2 数据约定
- `defect_ref` 建议存：**逗号分隔缺陷编号**（如 `D-3,D-7`）或 JSON 字符串；选定一种并写进模块注释。推荐：`D-n` 编号列表逗号分隔，长度截断策略与列宽一致。
- **单一写入口**：只通过新方法写同步，禁止散落 update。

### 2.3 后端新模块
文件：`core/services/defect_management/case_link_sync_l5.py`

| 新方法 | 职责 |
|--------|------|
| `set_case_links_and_sync_refs_l5(defect_id, case_ids, actor)` | 调用现有 `set_case_links`（不改其实现）后，重算涉及用例的 `defect_ref` |
| `rebuild_defect_ref_for_case_l5(case_id)` | 按 links 重建单用例 `defect_ref` |
| `list_defects_for_case_l5(case_id)` | 用例→缺陷列表 |
| `list_cases_for_defect_l5(defect_id)` | 缺陷→用例（可复用现查询） |
| `on_case_soft_delete_link_policy_l5(case_id)` | 软删时：保留 links 但标记或断开——**推荐保留 links + UI 显示「用例已删除」**，不物理删 link |

API：
- **保留** `PUT .../defects/<id>/cases` 行为：内部改为调用 `set_case_links_and_sync_refs_l5`（若担心影响，则 **新增** `PUT .../defects/<id>/cases-l5`，前端改调新接口；旧接口保持只改 links 不同步 ref——**推荐新接口 + 前端切新，旧接口冻结**）。
- 新增 `GET /api/case-management/cases/<id>/defects` → `list_defects_for_case_l5`
- 新增 `GET /api/defect-management/defects/<id>/cases` → 详情关联（若已有则扩展）

### 2.4 前端
- CM 用例抽屉：「关联缺陷」区块（列表、跳转、无则空态）。
- DM 抽屉：关联用例展示 `last_result`；保存关联走 `cases-l5`。
- 搜索关联用例沿用 `GET .../cases/search`。

### 2.5 验收
- [ ] 关联/取消关联后 `defect_ref` 与 links 一致  
- [ ] 多缺陷关联同一用例，`defect_ref` 含全部  
- [ ] 旧 `PUT .../cases`（若保留）行为不破；新路径同步正确  
- [ ] 软删用例后缺陷侧不 500

### 2.6 自测与清理
- 2 用例 × 2 缺陷交叉关联；校验 DB links 与 `defect_ref`。  
- 清理自测项目。

---

## Phase 3 — 执行→缺陷闭环（无附件）

### 3.1 目标
fail/blocked 可一键（或可选自动）建缺陷并关联；执行与缺陷互挂；关单触发待回归；回归结果回写。

### 3.2 数据模型（新表/新列，迁移脚本独立）

**扩展 `cm_executions`（加列，旧行默认 null）**
- `defect_id` INT NULL  
- `run_id` INT NULL（P4 再用，P3 可先加列）  

**扩展 `dm_defects`（加列）**
- `source_execution_id` INT NULL  
- `repro_steps` TEXT NULL（文本，非附件）  
- `expected_result` TEXT NULL  
- `actual_result` TEXT NULL  
- `environment` VARCHAR NULL  
- `module` VARCHAR NULL  
- `发现阶段 find_phase` VARCHAR NULL  
- `defect_type` VARCHAR NULL  
- `priority` VARCHAR NULL（与 severity 分离，P7 可先占位）  

**新表 `cm_case_regression_flags_l5`**
- `case_id` PK  
- `project_id`  
- `defect_id`  
- `status`：`pending|cleared`  
- `updated_at`  

**禁止**：任何 attachment / screenshot 表或上传 API。

### 3.3 后端新模块
`core/services/case_management/execution_defect_bridge_l5.py`

| 新方法 | 职责 |
|--------|------|
| `create_defect_from_execution_l5(execution_id, opts)` | 校验 fail/blocked；建缺陷；写 links；写 execution.defect_id；sync defect_ref；描述里拼文本步骤（无图） |
| `link_existing_defect_to_execution_l5(execution_id, defect_id)` | 关联已有缺陷 |
| `mark_cases_pending_regression_l5(defect_id)` | 缺陷→resolved/closed 时标记关联用例待回归 |
| `apply_regression_execution_l5(execution_id)` | 若用例 pending 且 result=pass → clear flag并建议关缺陷；fail→重开缺陷（新方法 `reopen_defect_l5`，不改原状态机函数则包一层） |
| `batch_create_defects_from_failures_l5(project_id, execution_ids\|case_ids)` | 批量 |

**状态流转**：复用现有 DM 状态机；仅通过新 API 触发回归副作用。

**现有** `POST .../cases/<id>/executions`：**保持只记执行**。  
新增：
- `POST .../executions/<id>/create-defect-l5`
- `POST .../executions/<id>/link-defect-l5`
- `POST .../cases/<id>/executions-with-defect-l5`（可选：一次提交执行+建缺陷）
- `GET .../cases/<id>/regression-flag-l5`
- 在 `PATCH /api/defect-management/defects/<id>` 成功后，若 status∈{resolved,closed}，**追加调用** `mark_cases_pending_regression_l5`（用 hook 函数 `after_defect_status_change_l5`，避免改原 update 核心的话：在 API 层 patch 成功后调用）。

### 3.4 前端
- 新文件 `static/js/case_management/execution_defect_l5.js`
- 执行结果为 fail/blocked 时显示：「创建缺陷」「关联已有缺陷」（无上传控件）
- 创建表单：标题默认 `[执行失败] {用例标题}`；描述/实际结果文本框；严重度；处理人；**无附件**
- 用例列表角标：「待回归」
- DM：从执行创建的缺陷展示来源执行链接

### 3.5 验收
- [ ] pass/skip 不出现强创缺陷（或仅隐藏按钮）  
- [ ] fail 建缺陷后 links、execution.defect_id、defect_ref 正确  
- [ ] 关缺陷 → 用例待回归  
- [ ] 待回归用例再执行 pass → 标记清除；fail → 缺陷重开  
- [ ] 旧执行 API 不传缺陷参数时行为与原来一致  
- [ ] 全程无附件入口

### 3.6 自测与清理
- 完整跑通 fail→建缺陷→resolved→待回归→pass。  
- 删项目级联或手动清 executions/defects/flags。

---

## Phase 4 — 测试计划 / 轮次（Plan / Run）

### 4.1 目标
CM 具备 Plan→Run→逐条执行主路径；散装执行保留兼容。

### 4.2 新表
- `cm_test_plans_l5`：`id, project_id, name, description, owner_id, status(draft|active|archived), start_at, end_at, created_at, updated_at`
- `cm_test_runs_l5`：`id, plan_id, project_id, name, build_no, environment, baseline_id NULL, status(not_started|in_progress|done), created_at, updated_at`
- `cm_test_run_items_l5`：`id, run_id, case_id, assignee_id, result, comment, execution_id NULL, updated_at` UNIQUE(run_id,case_id)

### 4.3 API（全新前缀，不影响旧执行）
- `CRUD /api/case-management/projects/<pid>/plans-l5`
- `CRUD .../plans-l5/<id>/runs`
- `POST .../runs/<id>/items`（从 suite/ids 加入）
- `POST .../run-items/<id>/execute` → 内部调用现有记执行新包装 `record_execution_for_run_l5`（写 `cm_executions` + 更新 item + last_result）
- `GET .../runs/<id>/stats`：总数/通过/失败/阻塞/跳过/进度%

### 4.4 前端
- CM 新「测试计划」子视图（Tab），**不替换**原用例列表。
- Run 执行页：逐条点结果；失败可调 P3 建缺陷。

### 4.5 验收
- [ ] 旧「批量执行」仍可用  
- [ ] Run 统计正确  
- [ ] Run 内 fail 可走闭环  

### 4.6 自测与清理
- 建 Plan/Run，执行数条，断言 stats；删项目级联新表。

---

## Phase 5 — 用例版本与基线

### 5.1 新表
- `cm_case_revisions_l5`：`id, case_id, rev_no, snapshot_json, editor_id, created_at`
- `cm_baselines_l5`：`id, project_id, name, note, created_by, created_at`
- `cm_baseline_cases_l5`：`baseline_id, case_id, rev_no` PK

### 5.2 行为
- 新方法 `save_case_revision_l5`：在 **新包装** `update_case_l5` 成功后写修订；**默认不改**原 `update_case` 行为——API PATCH 可改为调 `update_case_l5` 或加 query `?revision=1`。推荐：PATCH 成功后异步/同步追加 revision（若担心性能，仅 `update_case_l5` 被新 UI 使用）。
- `POST .../baselines-l5`：按当前 ready 用例或选中 ids 打基线。
- `GET .../baselines-l5/<id>/diff`：与当前或另一基线比。
- Run 可绑 `baseline_id`（P4 列）。

### 5.3 验收
- [ ] 修改用例产生 rev  
- [ ] 基线冻结内容不随后续编辑变  
- [ ] diff 显示增删改  

### 5.4 自测与清理
- 改标题前后打基线；diff；清理。

---

## Phase 6 — CM 库治理与入库门禁（不改工作台）

### 6.1 目标
工作台评审已在工作台完成；CM 侧 **消费只读导入结果** 做门禁，不调用、不修改工作台评审代码。

### 6.2 设计
- 导入时（仅改 `schema_import` / 新建 `import_workbench_l5` 包装）：  
  - 可写入 `fields_json` 或新列 `review_badge`：`imported_from_workbench` / 若源数据带校验元数据则映射为 `review_ok|review_unknown`（**没有则一律 `review_unknown`，禁止为了读评审去改工作台表结构或 API**）。
- 门禁新方法 `assert_case_ready_for_plan_l5(case_id)`：`status==ready` 才可进 Plan；前端禁用 + 后端 400。
- CM 筛选：按 `last_result`、待回归、priority、status（新 filter API 或扩展现有 list query，**扩展参数向后兼容**）。
- 可选：CM 只读分享（新表 token）——低优先级，可放 P6 末或砍掉。

### 6.3 验收
- [ ] draft 不能进 Plan  
- [ ] 工作台导入路径仍成功且不写回工作台  
- [ ] 工作台零文件变更  

### 6.4 自测与清理
- 用现有导入 API 入库；测门禁；清理。

---

## Phase 7 — 缺陷能力加深（明确无附件）

### 7.1 字段与 UI
- 使用 P3 已加列：复现步骤、期望/实际、环境、模块、发现阶段、类型、priority。
- 表单与详情展示上述文本字段。
- **UI 文案写明：不支持附件/截图；请用文字描述。**

### 7.2 协作
新表：
- `dm_defect_activity_l5`：`id, defect_id, actor_id, action, payload_json, created_at`
- `dm_defect_watchers_l5`：`defect_id, user_id`
- `dm_defect_relations_l5`：`from_id, to_id, rel_type(duplicate|parent|related)`

新方法（不改旧 comment add）：
- `add_defect_comment_l5`（可带 soft delete 标记列，若旧表无列则新表 `dm_defect_comments_l5` 或加 `is_deleted`）
- `record_activity_l5` 在 create/patch/link 时调用
- `merge_duplicate_defect_l5`
- `suggest_new_case_stub_l5`：在 CM **创建草稿用例** 标题预填「补测：{缺陷标题}」，**不打开工作台生成器**

### 7.3 验收
- [ ] 字段可存可展示  
- [ ] 活动日志完整  
- [ ] 无任何上传入口  
- [ ] 旧「只改 title/status」路径仍可用  

### 7.4 自测与清理
- 走字段、watch、重复合并；清理。

---

## Phase 8 — 工作台→CM 增量同步（只读源）

### 8.1 目标
同一 `source_ref` 检测工作台页数据变更并增量更新 CM；**只读** `requirement_cases`；禁止写回。

### 8.2 新模块
`core/services/case_management/workbench_sync_l5.py`

| 方法 | 职责 |
|------|------|
| `diff_workbench_against_suite_l5(pid, suite_id, lanhu_*)` | 对比标题/步骤等，产出 add/update/unchanged |
| `apply_workbench_sync_l5(..., strategy)` | upsert；写同步报告 |
| `list_sync_batches_l5` / `rollback_sync_batch_l5`（可选） | 批次回滚 |

API：
- `POST .../import/workbench/sync-preview-l5`
- `POST .../import/workbench/sync-apply-l5`

**禁止**修改 `static/js` 工作台；仅 CM `schema_ui` 旁路增加「同步」按钮模块 `workbench_sync_l5.js`。

### 8.3 验收
- [ ] 预览 diff 正确  
- [ ] apply 后 CM 更新、工作台数据不变  
- [ ] 原 preview/import API 回归通过  

### 8.4 自测与清理
- 对自测 suite 同步；清理 CM 数据（工作台测试页若用了独立页，勿删用户真实蓝湖数据——自测优先用已有导入副本对比，或 mock 层）。

---

## Phase 9 — 权限 / 通知 / 审计

### 9.1 权限
- 新配置表 `dm_role_overrides_l5` 或项目设置 JSON：  
  `reporter_can_edit: false` 等；新校验 `assert_defect_action_l5(user, defect, action)`。  
- **默认**保持现网 CM 角色映射，overrides 关闭时与现网一致。

### 9.2 通知
- 扩展 `cm_user_messages`：类型 `defect_assigned|defect_status|regression_pending`；payload 含 `defect_id`。  
- 前端消息点击 → DM deep link（P1）。  
- Webhook（可选）：`POST` 外出 URL，新模块 `webhook_l5.py`，默认关闭。

### 9.3 审计
- 复用 `dm_defect_activity_l5` + 新建 `cm_project_audit_l5`（用例改、执行、成员）。  
- 仅追加写入，不影响旧 API 响应。

### 9.4 验收
- [ ] viewer 不能建缺陷（与现网一致或按 overrides）  
- [ ] 消息可跳转  
- [ ] 审计可查  
- [ ] overrides 关闭 = 旧行为  

### 9.5 自测与清理
- 双角色账号测权限；清消息与自测项目。

---

## Phase 10 — 度量与外部集成出口

### 10.1 API
- `GET .../projects/<pid>/metrics-l5`：用例数、按状态、执行通过率（7/30 天）、缺陷按状态、重开率、MTTR（resolved-created）、待回归数  
- `GET .../defects/export-l5.csv`  
- `POST .../webhooks-l5/test`（可选）

### 10.2 前端
- CM/DM 项目级「度量」简易面板（只读图表可用纯 HTML/CSS，避免大依赖）。

### 10.3 验收
- [ ] 数字与 DB 抽样一致  
- [ ] CSV 无附件列  
- [ ] 不影响列表性能关键路径（度量接口独立）  

### 10.4 自测与清理
- 造一小批执行/缺陷对一下指标；清理。

---

## 跨 Phase 回归清单（每 Phase 结束抽测）

1. CM：项目/成员/用例 CRUD、Excel 导入导出、工作台 **原** import、执行记录、回收站  
2. DM：缺陷 CRUD、评论、关联用例（旧或新 API）、成员≥2 门槛  
3. **工作台**：打开页面无控制台新增报错；生成/评审入口可点（**不改代码前提下的冒烟**）  
4. Git：`git diff` / `git status` **不得**出现工作台路径文件被改  

---

## 明确不做（防范围蔓延）

- 用例工作台任何功能/文案/性能改动  
- 缺陷附件、截图、粘贴传图、对象存储桶  
- CM→工作台写回  
- 为 L5 去重构无关模块  

---

## 交付物检查清单（给执行 AI）

每 Phase 提交应包含：
1. 代码（新模块为主）  
2. DB 迁移说明/脚本  
3. API 列表（新/旧兼容说明）  
4. 自测步骤与结果  
5. 清理证明（无 `L5SELFTEST_` 残留）  
6. 声明：`未修改用例工作台任何文件`（附 `git diff --name-only` 证据）  

---

## 附录 A — 建议新增文件清单（便于执行）

```
core/services/case_management/nav_meta_l5.py
core/services/case_management/execution_defect_bridge_l5.py
core/services/case_management/plan_run_l5.py
core/services/case_management/revision_baseline_l5.py
core/services/case_management/workbench_sync_l5.py
core/services/case_management/metrics_l5.py
core/services/case_management/audit_l5.py
core/services/defect_management/case_link_sync_l5.py
core/services/defect_management/defect_enrich_l5.py
core/services/defect_management/activity_l5.py
core/services/defect_management/access_l5.py
static/js/case_management/deep_link_l5.js
static/js/case_management/execution_defect_l5.js
static/js/case_management/plan_run_l5.js
static/js/case_management/workbench_sync_l5.js
static/js/case_management/metrics_l5.js
static/js/defect_management/deep_link_l5.js
static/js/defect_management/enrich_l5.js
```

API 路由可集中挂在现有 blueprint，函数名带 `_l5` 后缀。

## 附录 B — 缺陷无附件的产品说明（UI 必须体现）

> 本系统缺陷管理不支持上传附件或截图。请将复现步骤、期望结果、实际结果、环境信息以文字填写；需要图片证据时请使用外部文档链接粘贴到描述中（纯文本 URL）。

---

**结束。执行 AI 必须按 Phase 顺序实现，每 Phase 自测并清理后再继续。工作台文件零变更是一票否决项。**
