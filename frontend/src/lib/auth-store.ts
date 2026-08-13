/**
 * 认证状态管理：内存 + localStorage 持久化。
 *
 * 提供 login / register / logout / refreshTokens / oauthLogin 方法，
 * 并在启动时检查存量 token 是否有效。
 */
import { auth, setTokens, clearTokens, getAccessToken, getRefreshToken } from "./api-client";

export interface User {
  id: number;
  username: string | null;
  email: string;
  isVerified: boolean;
  isAdmin: boolean;
  isActive: boolean;
  displayName: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

type AuthState = {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  loading: boolean;
  error: string | null;
};

let _state: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  loading: true,
  error: null,
};

type Listener = (state: AuthState) => void;
const _listeners: Set<Listener> = new Set();

function notify() {
  _listeners.forEach((l) => l(_state));
}

export function getAuthState(): AuthState {
  return _state;
}

export function subscribe(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

/** 启动时检查 localStorage token 有效性。 */
export async function initializeAuth(): Promise<void> {
  const storedAccess = getAccessToken();
  const storedRefresh = getRefreshToken();

  if (!storedAccess && !storedRefresh) {
    _state = { ..._state, loading: false };
    notify();
    return;
  }

  try {
    const user = await auth.me();
    _state = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isVerified: user.is_verified,
        isAdmin: user.is_admin,
        isActive: user.is_active,
        displayName: user.display_name,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
      },
      accessToken: storedAccess,
      refreshToken: storedRefresh,
      loading: false,
      error: null,
    };
  } catch {
    // stored token 无效，清空
    clearTokens();
    _state = { user: null, accessToken: null, refreshToken: null, loading: false, error: null };
  }
  notify();
}

/** 登录并更新状态（支持用户名或邮箱）。 */
export async function login(identifier: string, password: string): Promise<void> {
  _state = { ..._state, loading: true, error: null };
  notify();
  try {
    const tokens = await auth.login(identifier, password);
    setTokens(tokens.access_token, tokens.refresh_token);
    const user = await auth.me();
    _state = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isVerified: user.is_verified,
        isAdmin: user.is_admin,
        isActive: user.is_active,
        displayName: user.display_name,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
      },
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      loading: false,
      error: null,
    };
  } catch (e: unknown) {
    _state = { ..._state, loading: false, error: e instanceof Error ? e.message : "Login failed" };
    notify();
    throw e;
  }
  notify();
}

/** 发送验证码。 */
export async function sendVerificationCode(email: string, purpose: string = "register"): Promise<void> {
  await auth.sendCode(email, purpose);
}

/** 验证码注册并自动登录。 */
export async function registerWithCode(email: string, code: string): Promise<boolean> {
  _state = { ..._state, loading: true, error: null };
  notify();
  try {
    const tokens = await auth.register(email, code);
    setTokens(tokens.access_token, tokens.refresh_token);
    const user = await auth.me();
    _state = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isVerified: user.is_verified,
        isAdmin: user.is_admin,
        isActive: user.is_active,
        displayName: user.display_name,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
      },
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      loading: false,
      error: null,
    };
    // 返回是否是新用户
    return tokens.is_new_user ?? false;
  } catch (e: unknown) {
    _state = { ..._state, loading: false, error: e instanceof Error ? e.message : "Registration failed" };
    notify();
    throw e;
  }
  notify();
  return false;
}

/** OAuth 登录：发起授权流程。 */
export async function startOAuthLogin(provider: string): Promise<void> {
  const { auth_url } = await auth.oauthStart(provider);
  // 跳转到 OAuth 授权页面
  window.location.href = auth_url;
}

/** OAuth 登录：处理回调。 */
export async function handleOAuthCallback(
  provider: string,
  code: string,
  state: string,
): Promise<boolean> {
  _state = { ..._state, loading: true, error: null };
  notify();
  try {
    const tokens = await auth.oauthCallback(provider, code, state);
    setTokens(tokens.access_token, tokens.refresh_token);
    const user = await auth.me();
    _state = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isVerified: user.is_verified,
        isAdmin: user.is_admin,
        isActive: user.is_active,
        displayName: user.display_name,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
      },
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

/** 设置用户名（OAuth 用户首次登录后设置）。 */
export async function setUsername(username: string): Promise<void> {
  _state = { ..._state, loading: true, error: null };
  notify();
  try {
    const user = await auth.setUsername(username);
    _state = {
      ..._state,
      user: {
        ..._state.user!,
        username: user.username,
      },
      loading: false,
      error: null,
    };
  } catch (e: unknown) {
    _state = { ..._state, loading: false, error: e instanceof Error ? e.message : "Failed to set username" };
    notify();
    throw e;
  }
  notify();
}

/** 设置密码（OAuth 用户后续设置密码）。 */
export async function setPassword(password: string): Promise<void> {
  _state = { ..._state, loading: true, error: null };
  notify();
  try {
    await auth.setPassword(password);
    _state = { ..._state, loading: false, error: null };
  } catch (e: unknown) {
    _state = { ..._state, loading: false, error: e instanceof Error ? e.message : "Failed to set password" };
    notify();
    throw e;
  }
  notify();
}

/**
 * 用户名密码注册（已废弃，保留用于兼容）。
 *
 * @deprecated 统一 onboarding 后注册走验证码两步流程（registerWithCode），
 *   新代码勿调用；仅旧测试与兼容链路依赖。后续随测试迁移后移除。
 */
export async function register(username: string, email: string, password: string): Promise<void> {
  _state = { ..._state, loading: true, error: null };
  notify();
  try {
    const user = await auth.registerWithPassword(username, email, password);
    // 注册后自动登录
    const tokens = await auth.login(username, password);
    setTokens(tokens.access_token, tokens.refresh_token);
    _state = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isVerified: false,
        isAdmin: false,
        isActive: true,
        displayName: null,
        lastLoginAt: null,
        createdAt: user.created_at,
      },
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      loading: false,
      error: null,
    };
  } catch (e: unknown) {
    _state = { ..._state, loading: false, error: e instanceof Error ? e.message : "Registration failed" };
    notify();
    throw e;
  }
  notify();
}

/** 验证码重置密码并自动登录（解决邮箱注册用户中断死锁）。 */
export async function resetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  _state = { ..._state, loading: true, error: null };
  notify();
  try {
    const tokens = await auth.resetPassword(email, code, newPassword);
    setTokens(tokens.access_token, tokens.refresh_token);
    const user = await auth.me();
    _state = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isVerified: user.is_verified,
        isAdmin: user.is_admin,
        isActive: user.is_active,
        displayName: user.display_name,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
      },
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      loading: false,
      error: null,
    };
  } catch (e: unknown) {
    _state = { ..._state, loading: false, error: e instanceof Error ? e.message : "Failed to reset password" };
    notify();
    throw e;
  }
  notify();
}

/** 登出并清除状态。 */
export async function logout(): Promise<void> {
  clearTokens();
  _state = { user: null, accessToken: null, refreshToken: null, loading: false, error: null };
  notify();
}

/** 手动刷新 token。 */
export async function refreshTokens(): Promise<void> {
  const storedRefresh = getRefreshToken();
  if (!storedRefresh) {
    throw new Error("No refresh token");
  }
  const tokens = await auth.refresh(storedRefresh);
  setTokens(tokens.access_token, tokens.refresh_token);
  _state = { ..._state, accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
  notify();
}
