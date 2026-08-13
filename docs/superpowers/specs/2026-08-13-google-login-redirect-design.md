# Google 登录回跳登录页

日期：2026-08-13  
Issue：[#109](https://github.com/LeeShunEE/Radar-Renderer/issues/109)

## 1. 背景

Google 授权成功后，浏览器回到应用却停在 `/login`，而不是 `/app` 或 `/welcome`。

线上已核对（`https://radar.xn--30q18ry71c.com/`）：

- `/login`、`/auth/callback/google` 均 200
- `GET /api/v1/auth/oauth/providers` 返回 `google: true`
- 授权 URL 的 `redirect_uri` 为 `https://radar.xn--30q18ry71c.com/auth/callback/google`

因此不是 `redirect_uri` 配成登录页，也不是 Google 未开启。

## 2. 根因

正常链路：登录页 → Google → 前端 `/auth/callback/google?code&state` →
`GET /api/v1/auth/oauth/{provider}/callback` → 后端命中即焚消费 state、换
token、签发 JWT → 前端写入 localStorage → 按 `username` 跳 `/app` 或 `/welcome`。

三处实现叠加后，成功登录会被第二次失败覆盖，并被 `AuthGuard` 踢回 `/login`：

1. **回调 `useEffect` 无防重入**（`frontend/src/app/auth/callback/[provider]/page.tsx`）  
   依赖 `[router, searchParams, t]`。Strict Mode、`t` / `searchParams` 引用变化、
   Next.js 16 hydration 补齐 query，都会再跑一遍。`code` 与 `state` 都是一次性的。

2. **成功路径 `notify()` 是死代码**（`handleOAuthCallback` / `registerWithCode`）  
   `try` 内 `return is_new_user`，后面的 `notify()` 走不到。`auth-store._state`
   已有 user，`AuthContext` 仍停在 `loading=true, user=null`，或被第二次失败的
   `notify()` 打成 `loading=false, user=null`。

3. **登录页没有「已登录则离开」**  
   `AuthGuard`：`!loading && !isAuthenticated` → `replace("/login")`。登录页
   不检查 `useAuth().user`，人就停在登录表单。token 可能已经在 localStorage。

`OAuthStateDAO.consume` 是先 SELECT 再 DELETE，两个并发请求可能都读到同一行。
第二次通常在 Google `fetch_token` 处失败。原子 DELETE 是防御，不是主因。

## 3. 目标与非目标

### 3.1 目标

- 同一组 `code`/`state` 在回调页生命周期内只向后端打一次
- `handleOAuthCallback` / `registerWithCode` 成功后订阅者立刻看到
  `loading=false` 且带 `user`
- 已登录访问 `/login` 时自动去 `/app` 或 `/welcome`
- `consume()` 同一 state 并发只有一次返回 True
- 单测锁住上述行为；关联 #109

### 3.2 非目标

- 不改 Google / GitHub 控制台，不改 `OAUTH_*` 环境变量
- 不改 JWT 存 localStorage 的方案，不上 cookie session
- 不把 OAuth 改成后端 302 回前端带 token 的隐式流
- 不做 PKCE、不做 i18n 路由
- 不在本次写 Playwright e2e（Google 真实授权不进 unit / dev-integration）
- 不修无关的 `notify()` 风格（`login` / `resetPassword` 已可达，不动）

## 4. 方案

四层补丁，缺一仍可能被踢回登录页：

| 层 | 改动 | 作用 |
|---|---|---|
| 回调页 | `useRef` 单次锁；deps 去掉 `t`；`provider` 改 `useParams()` | 阻止双打后端 |
| auth-store | 成功写入 `_state` 后立刻 `notify()`，删掉 `return` 后的死代码 | AuthContext / AuthGuard 看到已登录 |
| 登录页 | `!loading && user` → `replace(username ? "/app" : "/welcome")` | 最后兜底 |
| DAO | `DELETE … RETURNING` 一次完成消费 | 并发只成功一次 |

## 5. 测试

- 路径 1:1：`page.tsx` → `page.test.tsx`；`auth-store.ts` / `oauth_state_dao.py` 跟已有测试文件
- unit / dev-integration 禁止真实 Google / 真实出站 HTTP
- 回调页用 `React.StrictMode` 证明 effect 双调用时 `handleOAuthCallback` 只跑一次
- 不在 coverage `include` 里加 `src/app/**`（页面测用于锁行为，不改覆盖率门槛）
