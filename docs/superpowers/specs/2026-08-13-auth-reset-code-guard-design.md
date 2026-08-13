# 重置密码 send-code 静默校验用户存在

日期：2026-08-13

## 1. 背景

`POST /api/v1/auth/send-code` 目前对任意邮箱一律调用
`VerificationService.generate_code`，并在非 `TESTING` 环境调用
`EmailService.send_verification_code`。响应恒为
`200 {"message":"验证码已发送"}`。

用户因此把「能收到验证码」当成「账号存在」。实测：对未入库的
`2457013396@qq.com` 连续两周走忘记密码，库里实际只有对应 Gmail
账号。随后 `POST /auth/reset-password` 才抛 `UserNotFoundError`，前端看到
`user_not_found`。

这同时是：

- 产品误导：收件箱有码，重置却说用户不存在；
- 账号枚举：未注册邮箱也能触发写库与发信；
- 邮件骚扰面：任意邮箱可被用来消耗 Resend 额度并投递重置邮件。

`POST /auth/reset-password` 的 `user_not_found` 映射本身是正确的（邮箱未注册时
`AuthService.reset_password` 必须拒绝改密）。根因在 send-code 过早对不存在的
邮箱生码、发信。

## 2. 目标与非目标

### 2.1 目标

当 `purpose == "reset_password"` 且邮箱未注册时：

- 不调用 `generate_code`（不写 `verification_codes`）；
- 不调用 `EmailService.send_verification_code`；
- 仍返回与成功发送完全相同的 `200 {"message":"验证码已发送"}`；
- 记一条不含邮箱明文的 info 日志。

`purpose == "register"` 行为不变。已注册邮箱的 `reset_password` 行为不变。
`AuthService.reset_password` 的异常契约不变。

### 2.2 非目标

- 不改前端忘记密码页。该页已把 200 当成成功并进入填码步骤；未注册用户之后
  会在 reset 拿到 `verification_code_invalid`。这是防枚举的预期体验，不在本
  次改为「账号不存在」文案。
- 不做邮箱大小写 normalize。本次根因不是大小写；`UserDAO.get_by_email` /
  `exists_by_email` 仍是精确匹配。列为 follow-up。
- 不做 IP / 邮箱限流。未注册路径每次仍会打 1 次 SELECT，可被高频枚举，但无
  发信、无写库副作用。列为独立安全特性。
- 不清理历史上对未注册邮箱写出的 `verification_codes` 孤儿行。它们会由现有
  `delete_expired` 过期后删除；`users` 表不动。
- 不引入虚假延迟来抹平「存在 / 不存在」的耗时差。存在时仍走生码 + 可能发信，
  耗时必然更长。本次只保证响应体与状态码一致。
- 不把存在性检查放进 `VerificationService`。验证码模块不应依赖用户表。
- 不在 router 里直接 import / 调用 `UserDAO`。

## 3. 方案选择

采用 **router 前置 + `UserService.exists_by_email`**。

| 方案 | 做法 | 不采用原因 |
| --- | --- | --- |
| A（采用） | `send_verification_code` 在 `purpose == reset_password` 时先问 UserService；不存在则早返回同一 200 | 改动面小，分层与现有「router 只走 service」一致 |
| B | router 直连 `UserDAO.exists_by_email` | DAO 已存在，但会打破本仓库 router → service → DAO 惯例 |
| C | 把检查放进 `VerificationService.generate_code` | 验证码服务会依赖用户表，职责混杂；register 路径还得绕过 |
| D | 未注册时返回 404 / `user_not_found` | 直接泄露邮箱是否注册，比现状更糟 |
| E | 只改 `reset_password`、不动 send-code | 解决不了误导、发信和写库 |

`UserService` 已是用户读取用例，且 `auth_router` 已经 import 它（`/me`）。
存在性查询归它，不新开 service。

## 4. 数据流

```text
POST /auth/send-code
        │
        ▼
SendCodeRequest（email + purpose ∈ {register, reset_password}）
        │
        ├─ purpose == reset_password
        │         │
        │         ▼
        │   UserService.exists_by_email(email)
        │         │
        │         ├─ False ──► logger.info("reset code skipped, email not registered")
        │         │            return {"message": "验证码已发送"}
        │         │
        │         └─ True ──┐
        │                   │
        └─ purpose == register
                            │
                            ▼
              VerificationService.generate_code(...)
                            │
                            ▼
              非 TESTING 则 EmailService.send_verification_code(...)
                            │
                            ▼
              return {"message": "验证码已发送"}
```

| 场景 | 生码 | 发信 | HTTP |
| --- | --- | --- | --- |
| reset_password + 邮箱已注册 | 是 | 非 TESTING 时是 | 200 验证码已发送 |
| reset_password + 邮箱未注册 | 否 | 否 | 200 验证码已发送 |
| register + 任意邮箱 | 是（不变） | 非 TESTING 时是 | 200 验证码已发送 |

`POST /auth/reset-password` 保持现有顺序：先校验重置验证码，再 `get_by_email`。
守卫生效后，未注册邮箱走公开 API 时不再能拿到可用码，因此该路径上的
`user_not_found` 实际上只会在存量孤儿码上出现。服务层契约仍保留。

## 5. 改动点

只改两个源文件。

### 5.1 `backend/app/service/user_service.py`

新增薄封装，不抛「不存在」异常（与 `get_by_id` 相反：这里「空」不是业务失败，
只是布尔答案）：

```python
async def exists_by_email(self, email: str) -> bool:
    """邮箱是否已注册（reset_password 静默校验用，不抛异常）。"""
    return await self._dao.exists_by_email(email)
```

`UserDAO.exists_by_email` 已存在且有单测，不改 DAO。

### 5.2 `backend/app/api/v1/auth_router.py`

`UserService` 已在本模块 import。`send_verification_code` 在生码之前增加：

```python
if payload.purpose == "reset_password":
    if not await UserService(session).exists_by_email(payload.email):
        logger.info("reset code skipped, email not registered")
        return {"message": "验证码已发送"}
```

本模块目前无 logger，新增：

```python
import logging

logger = logging.getLogger(__name__)
```

`generate_code` / 发信 / 返回值的其余逻辑不动。

## 6. 错误处理、日志、安全

- 不引入新异常。`exists_by_email` 的数据库异常向上传播，由现有 500 通道处理，
  与其他查询一致。禁止 `except Exception: pass`（§12.6）。
- 日志不写邮箱。未注册邮箱可能是他人的 PII。只记事件
  `"reset code skipped, email not registered"`，使用 f-string 风格的
  `logger.info(...)`（§12.8）。
- 防枚举：存在与不存在的 HTTP 状态码、响应体完全相同。前端无法从 send-code
  响应区分。
- 不在本设计里补偿耗时侧信道。
- 不把检查结果通过不同错误码、不同文案或不同 header 泄露出去。

## 7. 测试

按 AGENTS.md 三层；本次不写 testenv e2e（前端无改动，公开契约仍是 200）。

### 7.1 `tests/unit/backend/service/test_user_service.py`（新建）

`UserService` 目前 0 测试。只覆盖新方法，mock `UserDAO`：

- 存在 → `True`，并断言 DAO 以同一 email 被调用一次；
- 不存在 → `False`。

不在本文件扩写 `get_by_id`，除非落地时为过覆盖率门槛所必需。

### 7.2 `tests/unit/backend/api/test_auth_router.py`（已有）

现文件只有 `reset-password` 契约，没有 send-code 用例。新增
`TestSendCodeEndpoint`，session 继续用现有 `client` fixture 的 mock 覆盖：

1. `reset_password` + 已注册 → 200，`generate_code` 被调用一次；
2. `reset_password` + 未注册 → 200 且 `message == "验证码已发送"`，断言
   `generate_code` 与 `EmailService.send_verification_code` 都未被调用；
3. `register` + 任意邮箱 → 行为与现在相同（`generate_code` 仍被调用）。

`test_reset_password_user_not_found_404` 保留：它测的是 reset-password 接口
对 `UserNotFoundError` 的 HTTP 映射，与 send-code 守卫正交。

### 7.3 `tests/dev-integration/backend/api/v1/test_auth_router.py`（已有）

`test_reset_password_full_flow`（已注册用户完整重置）保持。

**必须改写** `test_reset_password_unknown_email_404`。它现在依赖「未注册邮箱
也能 send-code 拿到码」，守卫落地后该前提消失：`captured_codes` 不会增长，
`reset-password` 会先因无码变成 `400 verification_code_invalid`，到不了
`user_not_found`。

改写为一条 send-code 守卫用例（建议改名
`test_reset_send_code_unknown_email_is_silent`）：

1. `POST /auth/send-code`，`purpose=reset_password`，邮箱未注册；
2. 断言 200 且 `message == "验证码已发送"`；
3. 断言 `captured_codes` 未增长（邮件 mock 未被调用）；
4. 再 `POST /auth/reset-password` 任意 6 位码，断言
   `400` + `verification_code_invalid`，而不是 `404 user_not_found`。

第 4 步同时证明没有写出可用的 `reset_password` 验证码。不为此扩展
`client` fixture、不走 `/auth/test/latest-code`（该端点仅 `TESTING=true`）。

`test_duplicate_email_conflicts` 等 register 链路不改。

覆盖率：后端 ≥ 80%、每文件 ≥ 50%。新分支均有测试，不预期被门槛卡住。

## 8. 前端影响

`frontend/src/app/(auth)/forgot-password/page.tsx` 在 send-code 200 后进入
填码步骤。未注册用户会看到「已发送」，提交重置时得到验证码无效。

本次不改文案、倒计时或错误映射。若以后要在不泄露存在性的前提下改善提示，
应统一成中性句（例如「若该邮箱已注册，你将收到验证码」），另开 PR。

## 9. 交付

- 分支：从 `main` 切 `fix/auth-reset-code-guard`。
- 提交前：`cd backend && uv run pytest ../tests/unit/backend/ ../tests/dev-integration/backend/ -v`。
- commit：`fix(api,service): reset 密码 send-code 静默校验用户存在`，
  `-s` DCO + `Co-Authored-By`。
- 不改 lockfile、不改 Docker、不改前端。

## 10. Follow-up（明确不做）

1. 邮箱大小写 / Unicode normalize，避免 `Foo@x.com` 与 `foo@x.com` 被当成
   两个身份。
2. send-code 的 IP 或邮箱速率限制。
3. 存量未注册邮箱的 `verification_codes` 主动清理。
4. 忘记密码页的中性文案（「若已注册则发送」）。
