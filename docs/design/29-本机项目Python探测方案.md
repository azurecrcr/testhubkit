# 本机项目 Python 探测方案

## 背景与目标

当前 Edge Agent 只扫 PATH / `py -0p` / Agent 自身解释器，**不看**执行台已保存的「本机项目」路径，项目内 `.venv` 等常扫不到，体验偏鸡肋。

目标：

1. **有本机项目路径时**：优先探测项目目录下的虚拟环境解释器  
2. **保留整机探测**作兜底（PATH / py launcher / Agent 解释器）  
3. **不破坏**现有运行 / 同步 / 保存 profile / 自定义 Python 选择

## 非目标（本期不做）

- Poetry / PDM / Conda 深度解析（可二期）  
- 自动把 venv 写成默认 `python_cmd`（仍尊重用户已选；仅进候选列表）  
- 上传任何项目源码

## 架构

```
执行台 ↻ / 保存路径
    → Hub enqueue job_type=discover_python（可选，加速）
    → Agent poll 拿到 jobs + run_profile_hint.project_root
    → discover_project_pythons(project_root) ⊕ discover_local_pythons()
    → register-device.capabilities.python_candidates
    → Dashboard → 下拉列表
```

## Agent（edge-1.3+）

| 方法 | 说明 |
|------|------|
| `discover_project_pythons(root)` | **新**：在项目下找 `.venv`/`venv`/`env` 的 python |
| `discover_python_candidates(root, force)` | **新**：项目结果在前，再合并整机列表 |
| `discover_local_pythons` | **不改语义**，仍作整机扫描 |
| `handle_discover_python(job)` | **新**：强制探测并 re-register，不跑用例 |

Windows：`Scripts/python.exe`；POSIX：`bin/python` / `bin/python3`。

## Hub

| 变更 | 说明 |
|------|------|
| poll 响应增加 `run_profile_hint.project_root` | 旧 Agent 忽略新字段 |
| `job_type=discover_python` → `kind=discover_python` | 避免误走 `handle_run` |
| `enqueue_python_discover` | **新**：不占用「仅一个 run」锁 |
| UI `POST .../python-discover` | 触发加速探测 |

## 前端

- ↻：先 `pythonDiscover`，再短轮询 dashboard 刷新列表  
- 无项目路径：仍可探测（仅整机），toast 提示可先填本机项目以发现 venv  
- 选择 / 自定义 / sticky 逻辑不动

## 兼容

- Agent &lt; 1.3：无项目探测，行为与现网一致  
- 用户需**重新下载启动包**后才有项目 venv 探测

## 风险与控制

- 只读探测、超时短、结果上限  
- 新方法为主，避免改 `create_run_job` / `handle_run` 主路径  
- 自测后清理临时文件
