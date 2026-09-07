# 认证/安全审计日志留存（≥180 天）

## 目的

落实安全评估要求中的「日志留存时长至少 180 天」：对外写明政策，对内用独立定时任务保证不低于 180 天，并对超期数据分批删除。

**本次不包含**手机号强制实名改造。

## 留存对象

| 类型 | 位置 |
|------|------|
| 登录成功/失败 | MySQL `hub_login_log` |
| 邮箱/短信发码限流记录 | MySQL `hub_auth_send_log` |
| 桌面端认证审计 | MySQL `hub_desktop_audit_log` |
| Web 访问/错误日志 | 宿主机 Nginx `access.log` / `error.log`（见 `deploy/logrotate-testhub-nginx`） |

不清理：`hub_user_activity_daily` 等运营统计表。

## 配置（环境变量）

| 变量 | 默认 | 说明 |
|------|------|------|
| `AUTH_SECURITY_LOG_RETENTION_ENABLED` | `true` | 是否启用超期清理线程 |
| `AUTH_SECURITY_LOG_RETENTION_DAYS` | `180` | 留存天数；代码强制 `≥180` |
| `AUTH_SECURITY_LOG_RETENTION_HOUR` | `4` | 每日执行小时（避开回收站 3 点） |
| `AUTH_SECURITY_LOG_RETENTION_BATCH_SIZE` | `500` | 单批 DELETE 上限 |
| `AUTH_SECURITY_LOG_RETENTION_MAX_BATCHES` | `100` | 单次任务最大批次数 |
| `AUTH_SECURITY_LOG_RETENTION_MAX_RUNTIME_SEC` | `300` | 单次任务最长运行秒数 |

关闭清理：`AUTH_SECURITY_LOG_RETENTION_ENABLED=0`（不影响登录写入；政策仍声明不少于 180 天）。

## 代码入口

- 配置：`core/config/auth_security_log_retention.py`
- 清理：`core/services/auth/auth_security_log_retention_db.py`（`purge_expired_auth_security_logs`）
- 守护线程：`core/jobs/auth_security_log_retention.py`
- 启动：`app_factory` 在既有 cleanup 启动块中追加

登录写入路径（`record_login_attempt` 等）**未修改**。

## Nginx

访问/错误日志双写到容器 stdout 与宿主机目录 `deploy/nginx-logs/`（compose 挂载为 `/var/log/nginx-testhub`）。

将 `deploy/logrotate-testhub-nginx` 安装到 `/etc/logrotate.d/testhub-nginx`，对 `/root/TestHub/deploy/nginx-logs/*.log` 按日轮转并至少保留 180 份。

## 整改回执可用表述

本平台已落实网络安全相关日志留存措施：与账号认证、登录尝试及安全风控相关的日志（含登录成功/失败记录、验证码发送相关记录、桌面端认证审计及网站访问日志）留存时间不少于 180 天；超出留存期限后由系统自动清理或依法匿名化处理。留存策略已在《隐私政策》中向用户公示，并通过服务端定时任务与 Nginx 日志轮转配置予以执行。隐私政策参见站点「隐私政策」第 4.2.1 条。
