# 手机实名软闸门与关闭邮箱注册

## 产品策略

- **注册**：仅手机号 + 短信验证码
- **邮箱注册**：已关闭（API + 前端）
- **资料绑邮箱**：保留
- **登录**：手机 / 已绑邮箱均可
- **存量仅邮箱用户**：登录后须绑定手机（公安实名要求说明）

## 开关

| 变量 | 默认 | 说明 |
|------|------|------|
| `PHONE_BIND_GATE_ENABLED` | `true` | 未绑手机拦截业务 API + 全站引导 |
| `EMAIL_REGISTER_DISABLED` | `true` | 拒绝邮箱注册与 `purpose=register` 邮箱发码 |

紧急关闭闸门：`PHONE_BIND_GATE_ENABLED=0`（不影响登录本身）。

## 关键路径

- 配置：`core/config/phone_bind_gate.py`
- 闸门：`core/services/auth/phone_bind_gate.py`
- 强制页：`/account/bind-phone`
- 前端：`static/js/hf_phone_bind_gate.js`

## 整改说明可用表述

本平台已落实用户真实身份核验：新用户须通过手机短信验证码注册；历史邮箱账号须在使用业务功能前完成手机号绑定。绑定与核验过程通过短信验证码完成，相关认证与登录日志按不少于 180 天留存。
