# 重置密码 send-code 静默校验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /auth/send-code` 在 `purpose=reset_password` 且邮箱未注册时不生码、不发信，仍返回与成功发送相同的 200。

**Architecture:** router 前置调用已有读取用例 `UserService.exists_by_email`（薄封装 `UserDAO.exists_by_email`）。未注册则 info 日志后早返回；`register` 与已注册重置走原 `generate_code` / 发信路径。不改前端、不改 DAO、不改 `AuthService.reset_password`。

**Tech Stack:** FastAPI, SQLAlchemy async, pytest, unittest.mock, uv。

**Spec:** `docs/superpowers/specs/2026-08-13-auth-reset-code-guard-design.md`

## Global Constraints

- 先读 `CONTRIBUTING.md` 与 spec。从 `main` 切 `fix/auth-reset-code-guard`，禁止往 `main` 推 WIP。
- TDD：先写失败测试，再写最小实现。不要先改生产代码再补测试。
- 测试路径 1:1 对齐：`backend/app/service/user_service.py` → `tests/unit/backend/service/test_user_service.py`；`backend/app/api/v1/auth_router.py` 的 unit 测已在 `tests/unit/backend/api/test_auth_router.py`（折叠 `v1/` 是既有惯例，跟着改，不要新建 `api/v1/`）。
- unit / dev-integration 禁止真实 HTTP、真实远程库。SQLite 文件与 mock 允许。
- 后端命令在 `backend/` 下用 `uv run pytest`，禁止 `source .venv` / `Activate.ps1`。
- 不要改 `.gitignore`、不要提交 `.codegraph/`、不要改 lockfile / Docker / 前端。
- 不要做 spec §2.2 / §10 的 follow-up：normalize、限流、孤儿码清理、耗时对齐、前端文案。
- commit：中文 Conventional Commit + `git commit -s`（DCO）+ AI trailer。Windows 上若 `&&` 不可用，用 `;`。

```text
Co-Authored-By: Grok 4.6 <noreply@x.ai>
```

---

### Task 1: 建分支并提交已审文档

**Files:**
- Already created: `docs/superpowers/specs/2026-08-13-auth-reset-code-guard-design.md`
- Already created: `docs/superpowers/plans/2026-08-13-auth-reset-code-guard.md`

- [ ] **Step 1: 确认工作区干净到只含本次文档**

```bash
git status
git branch --show-current
```

Expected: 当前在 `main` 且与 `origin/main` 同步。工作区里应能看到上述两个未跟踪文档。`.gitignore` 的本地改动和 `.codegraph/` **不要**带进本分支。

- [ ] **Step 2: 从 main 切分支**

```bash
git checkout main
git pull
git checkout -b fix/auth-reset-code-guard
```

Expected: 当前分支为 `fix/auth-reset-code-guard`。

- [ ] **Step 3: 只提交 spec 与本计划**

```bash
git add docs/superpowers/specs/2026-08-13-auth-reset-code-guard-design.md docs/superpowers/plans/2026-08-13-auth-reset-code-guard.md
git commit -s -m "docs: reset 密码 send-code 静默校验设计与计划"
```

在 editor 里补 trailer `Co-Authored-By: Grok 4.6 <noreply@x.ai>`，或：

```bash
git commit -s -m "docs: reset 密码 send-code 静默校验设计与计划" -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

Expected: 一个 commit，仅两个 markdown 文件。

---

### Task 2: `UserService.exists_by_email`

**Files:**
- Create: `tests/unit/backend/service/test_user_service.py`
- Modify: `backend/app/service/user_service.py`
- Reference: `backend/app/dao/user_dao.py`（`exists_by_email` 已存在，不要改）
- Reference: `tests/unit/backend/service/test_auth_service.py`（mock DAO 风格）

- [ ] **Step 1: 写失败测试**

创建 `tests/unit/backend/service/test_user_service.py`：

```python
"""user_service 单元测试（DAO 全 mock）。"""

from unittest.mock import AsyncMock, MagicMock

from app.service.user_service import UserService


def _make_service(dao: AsyncMock) -> UserService:
    service = UserService(session=MagicMock())
    service._dao = dao
    return service


class TestExistsByEmail:
    async def test_returns_true_when_dao_finds_email(self) -> None:
        dao = AsyncMock()
        dao.exists_by_email.return_value = True
        service = _make_service(dao)

        result = await service.exists_by_email("alice@example.com")

        assert result is True
        dao.exists_by_email.assert_awaited_once_with("alice@example.com")

    async def test_returns_false_when_dao_misses_email(self) -> None:
        dao = AsyncMock()
        dao.exists_by_email.return_value = False
        service = _make_service(dao)

        result = await service.exists_by_email("ghost@example.com")

        assert result is False
        dao.exists_by_email.assert_awaited_once_with("ghost@example.com")
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
cd backend
uv run pytest ../tests/unit/backend/service/test_user_service.py -v
```

Expected: FAIL，`AttributeError: 'UserService' object has no attribute 'exists_by_email'`。不要在这一步改生产代码去让它通过。

- [ ] **Step 3: 最小实现**

在 `backend/app/service/user_service.py` 的 `get_by_id` 之后追加：

```python
    async def exists_by_email(self, email: str) -> bool:
        """邮箱是否已注册（reset_password 静默校验用，不抛异常）。

        Args:
            email: 待查询邮箱

        Returns:
            已注册为 True，否则 False
        """
        return await self._dao.exists_by_email(email)
```

不要改 `get_by_id`，不要在「不存在」时抛 `UserNotFoundError`。

- [ ] **Step 4: 跑测试，确认通过**

```bash
cd backend
uv run pytest ../tests/unit/backend/service/test_user_service.py -v
```

Expected: 2 passed。

- [ ] **Step 5: Commit**

```bash
git add tests/unit/backend/service/test_user_service.py backend/app/service/user_service.py
git commit -s -m "feat(service): 增加 UserService.exists_by_email" -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 3: send-code 单元测试驱动 router 守卫

**Files:**
- Modify: `tests/unit/backend/api/test_auth_router.py`
- Modify: `backend/app/api/v1/auth_router.py`
- Do not modify: `tests/unit/backend/api/test_auth_router.py` 里现有的 `TestResetPasswordEndpoint`（含 `test_reset_password_user_not_found_404`）

现有 `client` fixture（session mock + 关队列）直接复用。

- [ ] **Step 1: 先只加会失败的那条测试**

把文件顶部的模块 docstring 改成同时覆盖 send-code。在 import 区补：

```python
from unittest.mock import AsyncMock, MagicMock, patch
```

若文件已 `from unittest.mock import AsyncMock, MagicMock`，只把 `patch` 加进同一行。

在 `TestResetPasswordEndpoint` **之后**追加：

```python
def _post_send_code(
    client: TestClient, *, email: str, purpose: str
) -> object:
    return client.post(
        "/api/v1/auth/send-code",
        json={"email": email, "purpose": purpose},
    )


class TestSendCodeEndpoint:
    """POST /auth/send-code：reset_password 静默校验。"""

    def test_reset_password_unknown_email_skips_generate_and_send(
        self, client: TestClient
    ) -> None:
        """未注册邮箱：200 已发送，但不生码、不发信。"""
        mock_user = MagicMock()
        mock_user.exists_by_email = AsyncMock(return_value=False)
        mock_verification_cls = MagicMock()
        mock_email_cls = MagicMock()

        with (
            patch("app.api.v1.auth_router.UserService", return_value=mock_user),
            patch(
                "app.api.v1.auth_router.VerificationService",
                mock_verification_cls,
            ),
            patch("app.api.v1.auth_router.EmailService", mock_email_cls),
        ):
            resp = _post_send_code(
                client, email="ghost@example.com", purpose="reset_password"
            )

        assert resp.status_code == 200
        assert resp.json() == {"message": "验证码已发送"}
        mock_user.exists_by_email.assert_awaited_once_with("ghost@example.com")
        mock_verification_cls.assert_not_called()
        mock_email_cls.assert_not_called()
```

不要在这一步改 `auth_router.py`。

- [ ] **Step 2: 跑这条测试，确认失败**

```bash
cd backend
uv run pytest ../tests/unit/backend/api/test_auth_router.py::TestSendCodeEndpoint::test_reset_password_unknown_email_skips_generate_and_send -v
```

Expected: FAIL。当前实现会构造 `VerificationService` 并 `generate_code`，因此
`mock_verification_cls.assert_not_called()` 失败。也可能先因未 mock 的
`EmailService()` 在无 Resend key 时抛错。两种失败都证明守卫不存在，都可以接受。
不要改测试去迁就现状。

- [ ] **Step 3: 实现 router 守卫**

`backend/app/api/v1/auth_router.py`：

1. 在文件最上方、第三方 import 之前加：

```python
import logging
```

2. 在 `router = APIRouter(...)` 之后加：

```python
logger = logging.getLogger(__name__)
```

3. 把 `send_verification_code` 换成：

```python
@router.post("/send-code", status_code=status.HTTP_200_OK)
async def send_verification_code(
    payload: SendCodeRequest,
    session: SessionDep,
) -> dict[str, str]:
    """发送邮箱验证码。"""
    if payload.purpose == "reset_password":
        # 静默校验：不存在则不生码、不发邮件，统一回"已发送"，不泄露是否注册
        if not await UserService(session).exists_by_email(payload.email):
            logger.info("reset code skipped, email not registered")
            return {"message": "验证码已发送"}

    verification_service = VerificationService(session)
    code = await verification_service.generate_code(payload.email, payload.purpose)

    # 测试环境（TESTING=true）不连真实邮件服务，验证码经 /test/latest-code 取回
    if not settings.testing:
        email_service = EmailService()
        await email_service.send_verification_code(payload.email, code, payload.purpose)

    return {"message": "验证码已发送"}
```

`UserService` 已在本文件 import，不要再 import `UserDAO`。日志字符串必须是
`reset code skipped, email not registered`，禁止拼邮箱。

- [ ] **Step 4: 再跑失败用例，确认通过**

```bash
cd backend
uv run pytest ../tests/unit/backend/api/test_auth_router.py::TestSendCodeEndpoint::test_reset_password_unknown_email_skips_generate_and_send -v
```

Expected: 1 passed。

- [ ] **Step 5: 补两条回归用例**

仍在 `TestSendCodeEndpoint` 内追加：

```python
    def test_reset_password_registered_generates_code(
        self, client: TestClient
    ) -> None:
        """已注册邮箱：仍生码。"""
        mock_user = MagicMock()
        mock_user.exists_by_email = AsyncMock(return_value=True)
        mock_verification = MagicMock()
        mock_verification.generate_code = AsyncMock(return_value="123456")
        mock_email = MagicMock()
        mock_email.send_verification_code = AsyncMock()

        with (
            patch("app.api.v1.auth_router.UserService", return_value=mock_user),
            patch(
                "app.api.v1.auth_router.VerificationService",
                return_value=mock_verification,
            ),
            patch("app.api.v1.auth_router.EmailService", return_value=mock_email),
        ):
            resp = _post_send_code(
                client, email="alice@example.com", purpose="reset_password"
            )

        assert resp.status_code == 200
        assert resp.json() == {"message": "验证码已发送"}
        mock_user.exists_by_email.assert_awaited_once_with("alice@example.com")
        mock_verification.generate_code.assert_awaited_once_with(
            "alice@example.com", "reset_password"
        )

    def test_register_purpose_still_generates_code(
        self, client: TestClient
    ) -> None:
        """register purpose 不走存在性守卫，任意邮箱都生码。"""
        mock_user_cls = MagicMock()
        mock_verification = MagicMock()
        mock_verification.generate_code = AsyncMock(return_value="123456")
        mock_email = MagicMock()
        mock_email.send_verification_code = AsyncMock()

        with (
            patch("app.api.v1.auth_router.UserService", mock_user_cls),
            patch(
                "app.api.v1.auth_router.VerificationService",
                return_value=mock_verification,
            ),
            patch("app.api.v1.auth_router.EmailService", return_value=mock_email),
        ):
            resp = _post_send_code(
                client, email="new@example.com", purpose="register"
            )

        assert resp.status_code == 200
        assert resp.json() == {"message": "验证码已发送"}
        mock_user_cls.assert_not_called()
        mock_verification.generate_code.assert_awaited_once_with(
            "new@example.com", "register"
        )
```

- [ ] **Step 6: 跑该文件全部 unit**

```bash
cd backend
uv run pytest ../tests/unit/backend/api/test_auth_router.py -v
```

Expected: 原 3 条 reset-password + 新 3 条 send-code，全部 passed。

- [ ] **Step 7: Commit**

```bash
git add tests/unit/backend/api/test_auth_router.py backend/app/api/v1/auth_router.py
git commit -s -m "fix(api): reset 密码 send-code 静默校验用户存在" -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 4: 改写会断的 dev-integration 用例

**Files:**
- Modify: `tests/dev-integration/backend/api/v1/test_auth_router.py`（`TestResetPassword.test_reset_password_unknown_email_404`）
- Do not modify: `test_reset_password_full_flow`、`test_reset_password_wrong_code_400`、register 相关用例
- Do not extend: `tests/dev-integration/backend/conftest.py` 的 `client` / `captured_codes`

守卫落地后，旧用例 `test_reset_password_unknown_email_404` 会在
`captured_codes[-1]` 处 `IndexError`（未发信，列表不增长）。这是预期，先用旧用例证明，再改写。

- [ ] **Step 1: 跑旧用例，确认它已红**

```bash
cd backend
uv run pytest ../tests/dev-integration/backend/api/v1/test_auth_router.py::TestResetPassword::test_reset_password_unknown_email_404 -v
```

Expected: FAIL（`IndexError` 或不再是 404 / `user_not_found`）。若仍绿，说明 Task 3 的守卫没生效，停下来修 router，不要改测试迁就。

- [ ] **Step 2: 改写该用例**

删除 `test_reset_password_unknown_email_404`，在同一 `class TestResetPassword` 内换成：

```python
    def test_reset_send_code_unknown_email_is_silent(
        self,
        client: TestClient,
        captured_codes: list[str],
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(settings, "verification_code_cooldown_seconds", 0)
        email = "ghost@example.com"

        send = client.post(
            "/api/v1/auth/send-code",
            json={"email": email, "purpose": "reset_password"},
        )
        assert send.status_code == 200
        assert send.json() == {"message": "验证码已发送"}
        assert captured_codes == []

        resp = client.post(
            "/api/v1/auth/reset-password",
            json={
                "email": email,
                "code": "123456",
                "new_password": "brandnew1",
            },
        )
        assert resp.status_code == 400
        assert resp.json()["code"] == "verification_code_invalid"
```

不要走 `/auth/test/latest-code`。不要新增 fixture。

- [ ] **Step 3: 跑改写后的类**

```bash
cd backend
uv run pytest ../tests/dev-integration/backend/api/v1/test_auth_router.py::TestResetPassword -v
```

Expected: 3 passed（完整重置、错误验证码、未注册静默）。

- [ ] **Step 4: Commit**

```bash
git add tests/dev-integration/backend/api/v1/test_auth_router.py
git commit -s -m "test(api): 改写未注册邮箱 reset send-code 集成用例" -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 5: 全量后端回归

**Files:** none expected。仅当 `user_service.py` 每文件覆盖率 < 50% 时，才回 Task 2 的测试文件补 `get_by_id`（存在返回用户 / 不存在抛 `UserNotFoundError`）。不要借机扩 scope。

- [ ] **Step 1: unit + dev-integration**

```bash
cd backend
uv run pytest ../tests/unit/backend/ ../tests/dev-integration/backend/ -v
```

Expected: 全部 passed。

- [ ] **Step 2: 覆盖率（与 pre-push 同口径）**

若仓库 hook / 本地惯用带 cov 的命令，跑一次：

```bash
cd backend
uv run pytest ../tests/unit/backend/ ../tests/dev-integration/backend/ --cov=app --cov-report=term-missing
```

Expected: 总覆盖率 ≥ 80%；`user_service.py` 与 `auth_router.py` ≥ 50%。若
`user_service.py` 因未测 `get_by_id` 掉到 50% 以下，补最小单测后再 commit
`test(service): 补 UserService.get_by_id 覆盖`。

- [ ] **Step 3: 人工核对未做清单**

- 前端零 diff
- `UserDAO` / `AuthService.reset_password` / lockfile / Docker 零 diff
- 日志字符串不含邮箱
- 分支上没有 `.codegraph/` 或无关 `.gitignore` 改动

无需再 commit，除非 Step 2 补了覆盖率测试。

---

## 完成标准

- 分支 `fix/auth-reset-code-guard` 相对 `main` 有 4 个左右 commit（docs / service / router / integration test）。
- `reset_password` + 未注册：200 + 无码 + 无信。
- `reset_password` + 已注册、`register` + 任意邮箱：原行为。
- `test_reset_password_user_not_found_404` 仍在。
- 后端 unit + dev-integration 全绿。
