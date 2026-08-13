/**
 * auth-store.ts 单元测试：login/register/logout/initializeAuth + subscribe。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mswServer, resetMockState, http, HttpResponse } from "@/test/msw-server";

import {
  login,
  register,
  logout,
  initializeAuth,
  refreshTokens,
  subscribe,
  getAuthState,
  sendVerificationCode,
  registerWithCode,
  resetPassword,
  setUsername,
  setPassword,
  handleOAuthCallback,
} from "@/lib/auth-store";
import { setTokens, clearTokens } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

describe("auth-store", () => {
  beforeEach(() => {
    mswServer.listen({ onUnhandledRequest: "error" });
    localStorage.clear();
    resetMockState();
    logout();
  });
  afterEach(() => {
    mswServer.resetHandlers();
    mswServer.close();
  });

  describe("register + login", () => {
    it("registers then auto-login", async () => {
      await register("testuser", "test@example.com", "password123");
      const state = getAuthState();
      expect(state.user?.username).toBe("testuser");
      expect(state.accessToken).toBeTruthy();
      expect(state.loading).toBe(false);
    });
    it("login sets user and tokens", async () => {
      // 先注册
      await register("testuser", "test@example.com", "password123");
      logout();
      // 再登录
      await login("testuser", "password123");
      const state = getAuthState();
      expect(state.user?.username).toBe("testuser");
      expect(state.accessToken).toBeTruthy();
    });
    it("login error sets error and notifies before throw", async () => {
      const states: unknown[] = [];
      const unsub = subscribe((s) => states.push(s));
      await expect(login("nonexistent", "wrong")).rejects.toThrow();
      const state = getAuthState();
      expect(state.error).toBeTruthy();
      expect(state.loading).toBe(false);
      // 关键回归：notify() 在 throw 前调用，loading 复位
      expect(states.at(-1)).toMatchObject({ loading: false });
      unsub();
    });
  });

  describe("logout", () => {
    it("clears state and tokens", async () => {
      await register("testuser", "t@example.com", "pw");
      logout();
      const state = getAuthState();
      expect(state.user).toBeNull();
      expect(state.accessToken).toBeNull();
      expect(localStorage.getItem("access_token")).toBeNull();
    });
  });

  describe("initializeAuth", () => {
    it("resolves to no user when no stored tokens", async () => {
      await initializeAuth();
      const state = getAuthState();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
    });
    it("fetches user when stored token valid", async () => {
      // 注册一个用户让 MSW me() 返回有效
      await register("testuser", "t@example.com", "pw");
      // 模拟已有 token（initializeAuth 会调用 auth.me）
      await initializeAuth();
      const state = getAuthState();
      expect(state.user).toBeTruthy();
    });
    it("stored token 无效时清空 token 并置空用户", async () => {
      setTokens("expired-access", "expired-refresh");
      mswServer.use(
        http.get(`${API_BASE}/api/v1/auth/me`, () =>
          HttpResponse.json({ error: "invalid", code: "auth_error" }, { status: 401 }),
        ),
      );
      await initializeAuth();
      const state = getAuthState();
      expect(state.user).toBeNull();
      expect(state.loading).toBe(false);
      expect(localStorage.getItem("access_token")).toBeNull();
    });
  });

  describe("refreshTokens", () => {
    it("throws when no stored refresh token", async () => {
      await expect(refreshTokens()).rejects.toThrow("No refresh token");
    });
    it("refreshes tokens successfully", async () => {
      await register("testuser", "t@example.com", "pw");
      await refreshTokens();
      const state = getAuthState();
      expect(state.accessToken).toBeTruthy();
    });
  });

  describe("subscribe", () => {
    it("calls listener on state change", async () => {
      const calls: unknown[] = [];
      const unsub = subscribe((s) => calls.push(s.user));
      await register("testuser", "t@example.com", "pw");
      expect(calls.length).toBeGreaterThan(0);
      unsub();
    });
    it("unsubscribe stops calls", async () => {
      const calls: unknown[] = [];
      const unsub = subscribe((s) => calls.push(s));
      unsub();
      await register("testuser", "t@example.com", "pw");
      expect(calls.length).toBe(0);
    });
  });

  describe("验证码 / OAuth / 设置凭证流程", () => {
    it("sendVerificationCode 调用 send-code 且不抛错", async () => {
      mswServer.use(
        http.post(`${API_BASE}/api/v1/auth/send-code`, () =>
          HttpResponse.json({ message: "ok" }),
        ),
      );
      await expect(sendVerificationCode("e@x.com", "register")).resolves.toBeUndefined();
    });

    it("registerWithCode 注册并设置用户、返回是否新用户", async () => {
      mswServer.use(
        http.post(`${API_BASE}/api/v1/auth/register`, () =>
          HttpResponse.json({ access_token: "a", refresh_token: "r", token_type: "bearer", is_new_user: true }),
        ),
      );
      const isNew = await registerWithCode("e@x.com", "123456");
      expect(isNew).toBe(true);
      expect(getAuthState().user).toBeTruthy();
      expect(getAuthState().accessToken).toBe("a");
    });

    it("registerWithCode 响应无 is_new_user 时返回 false", async () => {
      mswServer.use(
        http.post(`${API_BASE}/api/v1/auth/register`, () =>
          HttpResponse.json({ access_token: "a", refresh_token: "r", token_type: "bearer" }),
        ),
      );
      const isNew = await registerWithCode("e@x.com", "123456");
      expect(isNew).toBe(false);
    });

    it("registerWithCode 失败时设置 error 并抛出", async () => {
      mswServer.use(
        http.post(`${API_BASE}/api/v1/auth/register`, () =>
          HttpResponse.json({ error: "验证码错误", code: "bad_code" }, { status: 400 }),
        ),
      );
      await expect(registerWithCode("e@x.com", "000")).rejects.toThrow("验证码错误");
      expect(getAuthState().error).toBe("验证码错误");
    });

    it("resetPassword 重置并自动登录", async () => {
      mswServer.use(
        http.post(`${API_BASE}/api/v1/auth/reset-password`, () =>
          HttpResponse.json({ access_token: "a", refresh_token: "r", token_type: "bearer" }),
        ),
      );
      await resetPassword("e@x.com", "123", "newpw");
      expect(getAuthState().user).toBeTruthy();
      expect(getAuthState().accessToken).toBe("a");
    });

    it("resetPassword 失败时设置 error 并抛出", async () => {
      mswServer.use(
        http.post(`${API_BASE}/api/v1/auth/reset-password`, () =>
          HttpResponse.json({ error: "验证码失效", code: "bad_code" }, { status: 400 }),
        ),
      );
      await expect(resetPassword("e@x.com", "000", "pw")).rejects.toThrow("验证码失效");
      expect(getAuthState().error).toBe("验证码失效");
    });

    it("setUsername 更新当前用户的用户名", async () => {
      // 先登录拿到已认证用户
      await register("testuser", "t@example.com", "pw");
      mswServer.use(
        http.post(`${API_BASE}/api/v1/auth/set-username`, () =>
          HttpResponse.json({ id: 1, username: "newname", email: "t@example.com", created_at: "x" }),
        ),
      );
      await setUsername("newname");
      expect(getAuthState().user?.username).toBe("newname");
    });

    it("setUsername 失败时设置 error 并抛出", async () => {
      await register("testuser", "t@example.com", "pw");
      mswServer.use(
        http.post(`${API_BASE}/api/v1/auth/set-username`, () =>
          HttpResponse.json({ error: "用户名已存在", code: "taken" }, { status: 409 }),
        ),
      );
      await expect(setUsername("dup")).rejects.toThrow("用户名已存在");
      expect(getAuthState().error).toBe("用户名已存在");
    });

    it("setPassword 成功后清空 loading", async () => {
      await register("testuser", "t@example.com", "pw");
      mswServer.use(
        http.post(`${API_BASE}/api/v1/auth/set-password`, () =>
          HttpResponse.json({ id: 1, username: "testuser", email: "t@example.com", created_at: "x" }),
        ),
      );
      await setPassword("secret");
      expect(getAuthState().loading).toBe(false);
      expect(getAuthState().error).toBeNull();
    });

    it("handleOAuthCallback 处理回调并返回是否新用户", async () => {
      mswServer.use(
        http.get(`${API_BASE}/api/v1/auth/oauth/google/callback`, () =>
          HttpResponse.json({ access_token: "a", refresh_token: "r", token_type: "bearer", is_new_user: true }),
        ),
      );
      const isNew = await handleOAuthCallback("google", "code1", "state1");
      expect(isNew).toBe(true);
      expect(getAuthState().user).toBeTruthy();
    });

    it("handleOAuthCallback 响应无 is_new_user 时返回 false", async () => {
      mswServer.use(
        http.get(`${API_BASE}/api/v1/auth/oauth/google/callback`, () =>
          HttpResponse.json({ access_token: "a", refresh_token: "r", token_type: "bearer" }),
        ),
      );
      const isNew = await handleOAuthCallback("google", "code1", "state1");
      expect(isNew).toBe(false);
    });

    it("handleOAuthCallback 失败时设置 error 并抛出", async () => {
      mswServer.use(
        http.get(`${API_BASE}/api/v1/auth/oauth/google/callback`, () =>
          HttpResponse.json({ error: "state 不匹配", code: "oauth_error" }, { status: 400 }),
        ),
      );
      await expect(handleOAuthCallback("google", "c", "bad")).rejects.toThrow("state 不匹配");
      expect(getAuthState().error).toBeTruthy();
    });

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
  });
});
