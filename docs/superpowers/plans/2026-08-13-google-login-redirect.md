# Google 登录回跳登录页 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Also valid: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking. TDD: @test-driven-development — 先写失败测试，再写最小实现。

**Goal:** Google / GitHub OAuth 授权回来后进入 `/app` 或 `/welcome`，不再被踢回 `/login`。

**Architecture:** 回调页 `useRef` 保证一组 `code`/`state` 只打一次后端；`handleOAuthCallback` / `registerWithCode` 成功后立刻 `notify()`，让 `AuthContext` 看到已登录；登录页对已登录用户 `replace` 走开；`OAuthStateDAO.consume` 改成原子 `DELETE … RETURNING`，避免并发双 True。

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Vitest + Testing Library, FastAPI, SQLAlchemy 2 async, pytest, uv。

**Spec:** `docs/superpowers/specs/2026-08-13-google-login-redirect-design.md`  
**Issue:** #109

## Global Constraints

- 在已有 worktree `.worktrees/investigate-google-login-redirect` 里做。把分支改名为 `fix/google-login-redirect`。禁止往 `main` 推 WIP。
- 先读 `CONTRIBUTING.md` 与 spec。TDD：先写失败测试，看它按预期失败，再写最小实现。
- 测试路径 1:1（源码根折叠）：
  - `frontend/src/lib/auth-store.ts` → `tests/unit/frontend/lib/auth-store.test.ts`
  - `frontend/src/app/auth/callback/[provider]/page.tsx` → `tests/unit/frontend/app/auth/callback/[provider]/page.test.tsx`
  - `frontend/src/app/(auth)/login/page.tsx` → `tests/unit/frontend/app/(auth)/login/page.test.tsx`
  - `backend/app/dao/oauth_state_dao.py` → `tests/unit/backend/dao/test_oauth_state_dao.py`
- unit / dev-integration 禁止真实 Google、禁止真实出站 HTTP。MSW / SQLite `:memory:` 允许。
- 前端命令在 `frontend/` 下：`pnpm exec vitest run <相对 frontend 的测试路径>`。不要一上来跑带 coverage 的 `pnpm test:unit`（慢）；每个 task 跑点名文件。收尾再跑 `pnpm test:unit` 与 `pnpm test:integration`。
- 后端命令在 `backend/` 下：`uv run pytest ../tests/unit/backend/... -v`。禁止 `Activate.ps1`。
- Windows PowerShell：用 `;` 不要用 `&&`。
- 不要改 `.gitignore`、不要提交 `.codegraph/`、不要改 lockfile / Docker / 环境变量。
- 不要做 spec §3.2 的非目标（PKCE、cookie session、e2e、改 OAuth 控制台）。
- commit：中文 Conventional Commit + `git commit -s`（DCO）+ AI trailer。

```text
Co-Authored-By: Grok 4.6 <noreply@x.ai>
```

---

### Task 1: 分支改名并提交已审文档

**Files:**
- Already created: `docs/superpowers/specs/2026-08-13-google-login-redirect-design.md`
- Already created: `docs/superpowers/plans/2026-08-13-google-login-redirect.md`

- [ ] **Step 1: 确认 worktree 与文档**

```powershell
git status
git branch --show-current
git rev-parse --show-toplevel
```

Expected: 当前在 `.worktrees/investigate-google-login-redirect`，分支 `investigate/google-login-redirect`。两个 markdown 未跟踪。不要把 `.codegraph/` 加进来。

- [ ] **Step 2: 改名为修复分支**

```powershell
git branch -m investigate/google-login-redirect fix/google-login-redirect
git branch --show-current
```

Expected: `fix/google-login-redirect`。

- [ ] **Step 3: 只提交 spec 与本计划**

```powershell
git add docs/superpowers/specs/2026-08-13-google-login-redirect-design.md docs/superpowers/plans/2026-08-13-google-login-redirect.md
git commit -s -m "docs: Google 登录回跳登录页设计与计划" -m "Closes nothing yet; 实现见后续 commit。" -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

Expected: 一个 commit，仅两个 markdown 文件。

---

### Task 2: `handleOAuthCallback` 成功后 notify

**Files:**
- Modify: `tests/unit/frontend/lib/auth-store.test.ts`
- Modify: `frontend/src/lib/auth-store.ts`（`handleOAuthCallback`）
- Reference: 同文件里 `login error sets error and notifies before throw`（`subscribe` 断言风格）

- [ ] **Step 1: 写失败测试**

在 `describe("register + login")` 之后、现有 `handleOAuthCallback` 用例所在的 describe 里追加（若它们包在某个 `describe` 中就放一起；否则在文件里已有 `handleOAuthCallback` 的 `it` 旁追加）：

```typescript
    it("handleOAuthCallback 成功后通知订阅者 loading=false 且带 user", async () => {
      mswServer.use(
        http.get(`${API_BASE}/api/v1/auth/oauth/google/callback`, () =>
          HttpResponse.json({
            access_token: "a",
            refresh_token: "r",
            token_type: "bearer",
            is_new_user: false,
          }),
        ),
      );
      const snapshots: Array<{ loading: boolean; hasUser: boolean }> = [];
      const unsub = subscribe((s) => {
        snapshots.push({ loading: s.loading, hasUser: s.user !== null });
      });

      await handleOAuthCallback("google", "code1", "state1");
      unsub();

      expect(snapshots.at(-1)).toEqual({ loading: false, hasUser: true });
    });
```

- [ ] **Step 2: 跑测试，确认失败**

```powershell
cd frontend
pnpm exec vitest run ../tests/unit/frontend/lib/auth-store.test.ts
```

Expected: FAIL。`handleOAuthCallback` 成功后最后一个 snapshot 仍是 `{ loading: true, hasUser: false }`（只 notify 了开始时的 loading=true），或 `snapshots.at(-1)` 不是 `{ loading: false, hasUser: true }`。

若测试立刻通过：停下来，说明 notify 已可达，不要改生产代码，改去核对 spec。

- [ ] **Step 3: 最小实现**

改 `frontend/src/lib/auth-store.ts` 的 `handleOAuthCallback`：在成功写入 `_state` 之后、`return` 之前调用 `notify()`。删掉 `try/catch` 之后那两行死代码（`notify(); return false;`）。

```typescript
    _state = {
      user: { /* 保持现有字段映射，不要改 shape */ },
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      loading: false,
      error: null,
    };
    notify();
    return tokens.is_new_user ?? false;
  } catch (e: unknown) {
    _state = { ..._state, loading: false, error: e instanceof Error ? e.message : "OAuth login failed" };
    notify();
    throw e;
  }
}
```

不要在 catch 里清空已经成功写入的 `user`（`..._state` 已保留）。不要改函数签名。

- [ ] **Step 4: 跑测试，确认通过**

```powershell
cd frontend
pnpm exec vitest run ../tests/unit/frontend/lib/auth-store.test.ts
```

Expected: PASS，原有 `handleOAuthCallback` 用例也绿。

- [ ] **Step 5: Commit**

```powershell
git add tests/unit/frontend/lib/auth-store.test.ts frontend/src/lib/auth-store.ts
git commit -s -m "fix(auth): OAuth 回调成功后通知订阅者" -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 3: `registerWithCode` 成功后 notify

**Files:**
- Modify: `tests/unit/frontend/lib/auth-store.test.ts`
- Modify: `frontend/src/lib/auth-store.ts`（`registerWithCode`）

同一死代码模式，必须一起修，否则验证码注册后 `AuthContext` 同样停在 loading。

- [ ] **Step 1: 写失败测试**

先读 `auth-store.test.ts` 里现有 `registerWithCode` / MSW `/api/v1/auth/register` handler（`frontend/src/test/msw-handlers.ts` 已有 register）。仿 Task 2 追加：

```typescript
    it("registerWithCode 成功后通知订阅者 loading=false 且带 user", async () => {
      const snapshots: Array<{ loading: boolean; hasUser: boolean }> = [];
      const unsub = subscribe((s) => {
        snapshots.push({ loading: s.loading, hasUser: s.user !== null });
      });

      await registerWithCode("t@example.com", "123456");
      unsub();

      expect(snapshots.at(-1)).toEqual({ loading: false, hasUser: true });
    });
```

若默认 MSW 的 register 不够，按文件里其它 `registerWithCode` 用例同样 `mswServer.use` 一份 200 + tokens。

- [ ] **Step 2: 跑测试，确认失败**

```powershell
cd frontend
pnpm exec vitest run ../tests/unit/frontend/lib/auth-store.test.ts
```

Expected: FAIL，原因同 Task 2（成功路径没 notify）。

- [ ] **Step 3: 最小实现**

`registerWithCode`：成功写 `_state` 后 `notify()`，再 `return`；删掉 try/catch 后的死代码。

- [ ] **Step 4: 跑测试，确认通过**

```powershell
cd frontend
pnpm exec vitest run ../tests/unit/frontend/lib/auth-store.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add tests/unit/frontend/lib/auth-store.test.ts frontend/src/lib/auth-store.ts
git commit -s -m "fix(auth): 验证码注册成功后通知订阅者" -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 4: next/navigation 测试替身支持 params 与 query

回调页测试需要可控的 `useSearchParams` / `useParams`。当前替身 `useSearchParams()` 永远返回空，且没有 `useParams`。

**Files:**
- Modify: `frontend/src/test/__mocks__/next-navigation.ts`

- [ ] **Step 1: 先写一个最小失败探测（可选）**

不必单独测试 mock。下一步回调页测试会立刻用到。本 task 直接改替身。

- [ ] **Step 2: 扩展替身**

把文件改成：

```typescript
/**
 * next/navigation 的测试替身（通过 vitest alias 注入）。
 *
 * 单元测试不挂载 Next App Router，useRouter 真实实现会抛
 * "invariant expected app router to be mounted"。此替身提供可重置的 router。
 */
import { vi } from "vitest";

export const __router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
};

export const __params: Record<string, string> = {};

let __searchParams = new URLSearchParams();

export function __setSearchParams(query: string): void {
  __searchParams = new URLSearchParams(query);
}

export function __resetNavigationMocks(): void {
  __router.push.mockReset();
  __router.replace.mockReset();
  __router.refresh.mockReset();
  for (const key of Object.keys(__params)) {
    delete __params[key];
  }
  __searchParams = new URLSearchParams();
}

export function useRouter() {
  return __router;
}

export function useSearchParams() {
  return __searchParams;
}

export function useParams() {
  return __params;
}
```

不要改 vitest alias。默认行为仍是空 query / 空 params，现有页面测试不受影响。

- [ ] **Step 3: 跑一组已有页面测试，确认没破坏**

```powershell
cd frontend
pnpm exec vitest run ../tests/unit/frontend/app/(auth)/register/page.test.tsx ../tests/unit/frontend/app/(auth)/welcome/page.test.tsx ../tests/unit/frontend/components/auth/AuthGuard.test.tsx
```

Expected: PASS。

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/test/__mocks__/next-navigation.ts
git commit -s -m "test(frontend): next/navigation 替身支持 params 与 query" -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 5: 回调页只处理一次 OAuth

**Files:**
- Create: `tests/unit/frontend/app/auth/callback/[provider]/page.test.tsx`
- Modify: `frontend/src/app/auth/callback/[provider]/page.tsx`

@test-driven-development：先写测试并看它因「StrictMode 双调用打了两次后端」而失败。

- [ ] **Step 1: 写失败测试**

创建 `tests/unit/frontend/app/auth/callback/[provider]/page.test.tsx`：

```tsx
/**
 * OAuth 回调页：同一 code/state 只打一次后端，成功后按 username 跳转。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import {
  __router,
  __params,
  __setSearchParams,
  __resetNavigationMocks,
} from "next/navigation";

const handleOAuthCallback = vi.fn();
const getAuthState = vi.fn();

vi.mock("@/lib/auth-store", () => ({
  handleOAuthCallback: (...args: unknown[]) => handleOAuthCallback(...args),
  getAuthState: () => getAuthState(),
}));

import OAuthCallbackPage from "@/app/auth/callback/[provider]/page";

describe("OAuthCallbackPage", () => {
  beforeEach(() => {
    __resetNavigationMocks();
    __params.provider = "google";
    __setSearchParams("code=abc&state=xyz");
    handleOAuthCallback.mockReset();
    getAuthState.mockReset();
    handleOAuthCallback.mockResolvedValue(false);
    getAuthState.mockReturnValue({ user: { username: "alice" } });
  });

  it("StrictMode 双调用 effect 时 handleOAuthCallback 只跑一次", async () => {
    render(
      <StrictMode>
        <OAuthCallbackPage />
      </StrictMode>,
    );

    await waitFor(() => expect(handleOAuthCallback).toHaveBeenCalled());
    expect(handleOAuthCallback).toHaveBeenCalledTimes(1);
    expect(handleOAuthCallback).toHaveBeenCalledWith("google", "abc", "xyz");
    await waitFor(() => expect(__router.push).toHaveBeenCalledWith("/app"));
  });

  it("username 为空时跳转 /welcome", async () => {
    getAuthState.mockReturnValue({ user: { username: null } });
    render(<OAuthCallbackPage />);

    await waitFor(() => expect(__router.push).toHaveBeenCalledWith("/welcome"));
  });

  it("缺少 code/state 时不打后端", async () => {
    __setSearchParams("");
    render(<OAuthCallbackPage />);

    await waitFor(() => expect(handleOAuthCallback).not.toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

```powershell
cd frontend
pnpm exec vitest run "../tests/unit/frontend/app/auth/callback/[provider]/page.test.tsx"
```

Expected: 第一个用例 FAIL，`handleOAuthCallback` 被调用 2 次（StrictMode）。后两个用例在改实现前也可能因 `provider` 仍从 `window.location.pathname` 解析而失败（jsdom pathname 不是 `/auth/callback/google`）。这是预期的，下一步用 `useParams()` 一起修。

- [ ] **Step 3: 最小实现**

改 `frontend/src/app/auth/callback/[provider]/page.tsx`：

- `useParams()` 取 `provider`，不要 `window.location.pathname.split`
- `useRef(false)`：已经开始处理后直接 return
- `useEffect` 依赖改为 `[router, searchParams]`（不要 `t`）
- 缺 `code`/`state`/`provider` 时设 error，不调用 store

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getAuthState, handleOAuthCallback } from "@/lib/auth-store";
import { Card } from "@/components/ui/card";

export default function OAuthCallbackPage() {
  const t = useTranslations("auth.callback");
  const router = useRouter();
  const params = useParams<{ provider: string }>();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }

    const provider = params.provider ?? "";
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!provider || !code || !state) {
      setError(t("missingParams"));
      setLoading(false);
      return;
    }

    started.current = true;

    const processCallback = async () => {
      try {
        await handleOAuthCallback(provider, code, state);
        const username = getAuthState().user?.username;
        router.push(username ? "/app" : "/welcome");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("failed");
        setError(message);
        setLoading(false);
      }
    };

    void processCallback();
  }, [params.provider, router, searchParams, t]);

  return (
    <Card className="p-6 space-y-4">
      {/* 保持现有 JSX，不要改文案结构 */}
    </Card>
  );
}
```

`t` 仍可留在 deps（eslint exhaustive-deps）；`started.current` 保证即便 `t` 变了也不会二次请求。不要加 Suspense（非目标）。不要改 Card 以外的视觉。

- [ ] **Step 4: 跑测试，确认通过**

```powershell
cd frontend
pnpm exec vitest run "../tests/unit/frontend/app/auth/callback/[provider]/page.test.tsx"
```

Expected: 3 个用例 PASS。

- [ ] **Step 5: Commit**

```powershell
git add "tests/unit/frontend/app/auth/callback/[provider]/page.test.tsx" "frontend/src/app/auth/callback/[provider]/page.tsx"
git commit -s -m "fix(auth): OAuth 回调页防止重复消费授权码" -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 6: 登录页已登录则离开

**Files:**
- Create: `tests/unit/frontend/app/(auth)/login/page.test.tsx`
- Modify: `frontend/src/app/(auth)/login/page.tsx`
- Reference: `tests/unit/frontend/app/(auth)/welcome/page.test.tsx`（`useAuth` mock 风格）
- Reference: `tests/unit/frontend/components/auth/AuthGuard.test.tsx`（`replace` 断言）

- [ ] **Step 1: 写失败测试**

创建 `tests/unit/frontend/app/(auth)/login/page.test.tsx`：

```tsx
/**
 * login/page.tsx：已登录访问登录页时应离开，而不是继续停在表单。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { __router } from "next/navigation";

const auth = vi.hoisted(() => ({
  value: {
    user: null as null | { username: string | null },
    loading: false,
    error: null as string | null,
    login: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth.value,
}));

vi.mock("@/lib/auth-store", () => ({
  getAuthState: () => ({ user: auth.value.user }),
}));

vi.mock("@/components/auth/OAuthButtons", () => ({
  OAuthButtons: () => null,
}));

import LoginPage from "@/app/(auth)/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    __router.push.mockReset();
    __router.replace.mockReset();
    auth.value = {
      user: null,
      loading: false,
      error: null,
      login: vi.fn(),
    };
  });

  it("未登录时渲染表单且不跳转", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText("用户名或邮箱")).toBeInTheDocument();
    expect(__router.replace).not.toHaveBeenCalled();
    expect(__router.push).not.toHaveBeenCalled();
  });

  it("已登录且有 username 时 replace 到 /app", async () => {
    auth.value.user = { username: "alice" };
    render(<LoginPage />);
    await waitFor(() => expect(__router.replace).toHaveBeenCalledWith("/app"));
  });

  it("已登录但 username 为空时 replace 到 /welcome", async () => {
    auth.value.user = { username: null };
    render(<LoginPage />);
    await waitFor(() =>
      expect(__router.replace).toHaveBeenCalledWith("/welcome"),
    );
  });

  it("loading 时不跳转", () => {
    auth.value.loading = true;
    auth.value.user = null;
    render(<LoginPage />);
    expect(__router.replace).not.toHaveBeenCalled();
  });
});
```

登录页用户名 label 以 `zh.json` 的 `auth.login.identifierLabel` 为准（next-intl mock 用真实 zh）。写测试前打开 `frontend/src/i18n/messages/zh.json` 的 `auth.login`，把 `getByLabelText` 改成与页面 `Label` 一致的字符串。不要猜英文。

- [ ] **Step 2: 跑测试，确认失败**

```powershell
cd frontend
pnpm exec vitest run "../tests/unit/frontend/app/(auth)/login/page.test.tsx"
```

Expected: 「已登录…」两个用例 FAIL，`replace` 未被调用。未登录用例应 PASS。

- [ ] **Step 3: 最小实现**

在 `LoginPage` 里增加：

```tsx
  const { login, loading, error, user } = useAuth();

  React.useEffect(() => {
    if (!loading && user) {
      router.replace(user.username ? "/app" : "/welcome");
    }
  }, [loading, user, router]);
```

用 `replace` 不要 `push`（与 `AuthGuard` / 首页一致）。不要改表单提交逻辑。不要在 loading 时隐藏表单（避免闪烁；AuthGuard 才需要挡内容）。

- [ ] **Step 4: 跑测试，确认通过**

```powershell
cd frontend
pnpm exec vitest run "../tests/unit/frontend/app/(auth)/login/page.test.tsx"
```

Expected: PASS。

- [ ] **Step 5: Commit**

```powershell
git add "tests/unit/frontend/app/(auth)/login/page.test.tsx" "frontend/src/app/(auth)/login/page.tsx"
git commit -s -m "fix(auth): 已登录访问登录页时跳转到完成页" -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 7: `consume` 改为原子 DELETE

**Files:**
- Modify: `tests/unit/backend/dao/test_oauth_state_dao.py`
- Modify: `backend/app/dao/oauth_state_dao.py`
- Reference: `backend/app/dao/orm.py` 的 `OAuthStateORM`

保留现有语义：命中即焚；provider 不匹配或过期仍删除该行并返回 False；未知 state 返回 False。

- [ ] **Step 1: 写失败测试**

在 `TestConsume` 追加。用**两个 session**（同一 engine）并发消费，锁住「只有一次 True」。顺带把 fixture 抽成共享 engine，避免单 session 并发（SQLAlchemy session 非线程/任务安全）。

把文件顶部的 `session` fixture 改成 `engine` + `session`，并追加测试：

```python
import asyncio

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


@pytest.fixture
async def engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture
async def session(engine) -> AsyncGenerator[AsyncSession, None]:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        yield s


class TestConsume:
    # —— 保留原有 5 个用例不改断言 ——

    async def test_concurrent_consume_only_one_succeeds(self, engine) -> None:
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as setup:
            await OAuthStateDAO(setup).create(
                state="s1", provider="google", expires_at=_future()
            )

        now = datetime.now(tz=UTC)

        async def consume_once() -> bool:
            async with factory() as s:
                return await OAuthStateDAO(s).consume(
                    state="s1", provider="google", now=now
                )

        results = await asyncio.gather(consume_once(), consume_once())
        assert sorted(results) == [False, True]
```

现有 5 个用例应继续工作（它们只用 `session` fixture）。

- [ ] **Step 2: 跑测试**

```powershell
cd backend
uv run pytest ../tests/unit/backend/dao/test_oauth_state_dao.py -v
```

Expected: 原有 5 个 PASS。`test_concurrent_consume_only_one_succeeds` 在旧实现上可能 FAIL（`[True, True]`）或偶发 SQLAlchemy 并发错误。若 SQLite 串行化导致它意外 PASS：不要跳过实现，仍然把 `consume` 改成单条 `DELETE … RETURNING`（这是目标实现，不是「测试绿了就不动」）。

- [ ] **Step 3: 最小实现**

`backend/app/dao/oauth_state_dao.py` 的 `consume`：

```python
    async def consume(self, *, state: str, provider: str, now: datetime) -> bool:
        """一次性消费 state：原子删除该行，再校验 provider 与过期。

        用 DELETE … RETURNING，避免 SELECT + DELETE 之间两个请求都读到同一行。
        命中即焚：只要 state 存在就删；provider 不匹配或已过期返回 False。
        """
        stmt = (
            delete(OAuthStateORM)
            .where(OAuthStateORM.state == state)
            .returning(OAuthStateORM.provider, OAuthStateORM.expires_at)
        )
        result = await self._session.execute(stmt)
        row = result.one_or_none()
        await self._session.commit()

        if row is None:
            return False
        row_provider, expires_at = row
        if row_provider != provider:
            return False
        return ensure_utc(expires_at) >= now
```

顶部 import 保留 `delete`，可删掉不再使用的 `select`。更新模块/方法 docstring，说明原子删除。不要改 `create`。不要改表结构。

- [ ] **Step 4: 跑测试，确认通过**

```powershell
cd backend
uv run pytest ../tests/unit/backend/dao/test_oauth_state_dao.py ../tests/unit/backend/service/test_oauth_service.py -v
```

Expected: PASS。service 测 mock 的是 DAO，不受 SQL 变化影响，但要确认没改方法签名。

- [ ] **Step 5: Commit**

```powershell
git add tests/unit/backend/dao/test_oauth_state_dao.py backend/app/dao/oauth_state_dao.py
git commit -s -m "fix(dao): 原子消费 OAuth state 避免并发双成功" -m "Co-Authored-By: Grok 4.6 <noreply@x.ai>"
```

---

### Task 8: 回归与收尾

**Files:** 无新文件。

- [ ] **Step 1: 后端 unit + dev-integration**

```powershell
cd backend
uv run pytest ../tests/unit/backend/ -v
uv run pytest ../tests/dev-integration/backend/ -v
```

Expected: 全部 PASS。

- [ ] **Step 2: 前端 unit + integration**

```powershell
cd frontend
pnpm test:unit
pnpm test:integration
```

Expected: 全部 PASS，覆盖率门槛不破。

- [ ] **Step 3: 在 #109 留实现说明**

```powershell
gh issue comment 109 --body "已在 ``fix/google-login-redirect`` 按计划落地：回调防重入、成功 notify、登录页已登录跳走、consume 原子删除。验证：后端 unit+dev-integration、前端 unit+integration 全绿。"
```

不要在本 task 开 PR（等用户选执行方式之后再决定）。本地不要 `git push`，除非用户明确要求。

---

## 执行顺序与依赖

```text
Task 1 文档
  → Task 2 notify(OAuth)
  → Task 3 notify(registerWithCode)    # 可与 2 同文件连续做，但分开 commit
  → Task 4 navigation mock
  → Task 5 回调页                      # 依赖 Task 4
  → Task 6 登录页                      # 与 5 无代码依赖，但 2 应先完成
  → Task 7 DAO 原子 consume            # 与前端并行无妨，计划里放在后
  → Task 8 全量回归
```

不要把 Task 2–7 揉进一个 commit。
