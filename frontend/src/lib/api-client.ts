/**
 * 集中 API 客户端：自动注入 Bearer token、401 刷新重试、分组方法。
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** API 错误：携带后端业务错误码与 HTTP 状态，供调用方按需区分处理。 */
export class ApiError extends Error {
  readonly code: string | undefined;
  readonly status: number;

  constructor(message: string, opts: { code?: string; status: number }) {
    super(message);
    this.name = "ApiError";
    this.code = opts.code;
    this.status = opts.status;
  }
}

// 单飞锁：防止并发刷新 token 竞态
let _refreshPromise: Promise<string> | null = null;

/** 从 localStorage 获取当前 access token。 */
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

/** 从 localStorage 获取当前 refresh token。 */
export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refresh_token");
}

/** 存储 token 到 localStorage。 */
export function setTokens(access: string, refresh: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}

/** 清除 localStorage 中的 token。 */
export function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

/** 使用 refresh token 刷新 access token（单飞锁）。 */
async function refreshAccessToken(): Promise<string> {
  const existingRefresh = getRefreshToken();
  if (!existingRefresh) {
    throw new Error("No refresh token");
  }
  // 单飞：已有刷新进行中，等待其完成
  if (_refreshPromise) {
    return _refreshPromise;
  }
  _refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: existingRefresh }),
      });
      if (!res.ok) {
        clearTokens();
        throw new Error("Token refresh failed");
      }
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token);
      return data.access_token;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

/** 带认证的 fetch：自动注入 Authorization、401 自动刷新重试。 */
async function authFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const accessToken = getAccessToken();

  const headers = new Headers(options.headers);
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  let res = await fetch(url, { ...options, headers });

  // 401 且有 refresh token → 刷新后重试一次
  if (res.status === 401 && getRefreshToken()) {
    try {
      const newToken = await refreshAccessToken();
      headers.set("Authorization", `Bearer ${newToken}`);
      res = await fetch(url, { ...options, headers });
    } catch {
      // 刷新失败，清除 token，抛出原始错误
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(body.error ?? `HTTP ${res.status}`, {
      code: body.code,
      status: res.status,
    });
  }

  // 空响应（204）
  if (res.status === 204) {
    return null as T;
  }

  return res.json();
}

// ── Auth ──────────────────────────────────────────────
export const auth = {
  /** 发送邮箱验证码 */
  sendCode: (email: string, purpose: string = "register") =>
    authFetch<{ message: string }>(
      "/api/v1/auth/send-code",
      { method: "POST", body: JSON.stringify({ email, purpose }) },
    ),
  /** 验证码注册 */
  register: (email: string, code: string) =>
    authFetch<{ access_token: string; refresh_token: string; token_type: string; is_new_user: boolean }>(
      "/api/v1/auth/register",
      { method: "POST", body: JSON.stringify({ email, code }) },
    ),
  /** 验证码重置密码（校验后设新密码并自动登录） */
  resetPassword: (email: string, code: string, newPassword: string) =>
    authFetch<{ access_token: string; refresh_token: string; token_type: string }>(
      "/api/v1/auth/reset-password",
      { method: "POST", body: JSON.stringify({ email, code, new_password: newPassword }) },
    ),
  /** 用户名密码注册（已废弃） */
  registerWithPassword: (username: string, email: string, password: string) =>
    authFetch<{ id: number; username: string; email: string; created_at: string }>(
      "/api/v1/auth/register-with-password",
      { method: "POST", body: JSON.stringify({ username, email, password }) },
    ),
  /** 登录（支持用户名或邮箱） */
  login: (usernameOrEmail: string, password: string) =>
    authFetch<{ access_token: string; refresh_token: string; token_type: string }>(
      "/api/v1/auth/login",
      {
        method: "POST",
        body: JSON.stringify(
          usernameOrEmail.includes("@")
            ? { email: usernameOrEmail, password }
            : { username: usernameOrEmail, password },
        ),
      },
    ),
  refresh: (refreshToken: string) =>
    authFetch<{ access_token: string; refresh_token: string }>(
      "/api/v1/auth/refresh",
      { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) },
    ),
  me: () =>
    authFetch<{ id: number; username: string | null; email: string; is_verified: boolean; is_admin: boolean; is_active: boolean; display_name: string | null; last_login_at: string | null; created_at: string }>(
      "/api/v1/auth/me",
    ),
  /** 设置用户名 */
  setUsername: (username: string) =>
    authFetch<{ id: number; username: string; email: string; created_at: string }>(
      "/api/v1/auth/set-username",
      { method: "POST", body: JSON.stringify({ username }) },
    ),
  /** 设置密码 */
  setPassword: (password: string) =>
    authFetch<{ id: number; username: string; email: string; created_at: string }>(
      "/api/v1/auth/set-password",
      { method: "POST", body: JSON.stringify({ password }) },
    ),
  /** 探测已启用的 OAuth provider（决定是否渲染登录按钮） */
  oauthProviders: () =>
    authFetch<{ google: boolean; github: boolean }>(
      "/api/v1/auth/oauth/providers",
    ),
  /** 发起 OAuth 登录 */
  oauthStart: (provider: string) =>
    authFetch<{ auth_url: string }>(
      `/api/v1/auth/oauth/${provider}/start`,
    ),
  /** 处理 OAuth 回调 */
  oauthCallback: (provider: string, code: string, state: string) =>
    authFetch<{ access_token: string; refresh_token: string; token_type: string; is_new_user: boolean }>(
      `/api/v1/auth/oauth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    ),
  /** 获取已绑定的 OAuth 账户列表 */
  listOAuthAccounts: () =>
    authFetch<Array<{ id: number; provider: string; provider_email: string | null; provider_display_name: string | null; created_at: string }>>(
      "/api/v1/auth/oauth/accounts",
    ),
  /** 绑定 OAuth 账户 */
  bindOAuth: (provider: string, code: string, state: string) =>
    authFetch<{ id: number; username: string; email: string; created_at: string }>(
      `/api/v1/auth/oauth/${provider}/bind?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      { method: "POST" },
    ),
  /** 解绑 OAuth 账户 */
  unbindOAuth: (provider: string) =>
    authFetch<{ success: boolean }>(
      `/api/v1/auth/oauth/${provider}/unbind`,
      { method: "DELETE" },
    ),
};

/**
 * 带认证拉取二进制资源为 Blob（401 自动刷新重试一次）。
 *
 * 需鉴权的下载端点不能用裸 `fetch(url)` 或 `<a href>` 直链（都不带 token，必 401）；
 * 下载入口统一走此方法换 Blob 再触发保存。
 */
async function authFetchBlob(url: string, errLabel: string): Promise<Blob> {
  const doFetch = (token: string | null) =>
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  let res = await doFetch(getAccessToken());
  if (res.status === 401 && getRefreshToken()) {
    try {
      const newToken = await refreshAccessToken();
      res = await doFetch(newToken);
    } catch {
      // 刷新失败，落到下方错误分支统一抛出
    }
  }
  if (!res.ok) {
    throw new Error(`${errLabel} (HTTP ${res.status})`);
  }
  return res.blob();
}

// ── Files ─────────────────────────────────────────────
export const files = {
  list: () =>
    authFetch<{ files: Array<{ name: string; size_bytes: number; modified_at: string }>; quota: { used_bytes: number; limit_bytes: number; available_bytes: number } }>(
      "/api/v1/files",
    ),
  /** 上传文件。用 XHR 而非 fetch：fetch 无法获取上传进度。 */
  upload: (
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<{ file: { name: string; size_bytes: number; modified_at: string }; quota: { used_bytes: number; limit_bytes: number; available_bytes: number } }> =>
    new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);
      const accessToken = getAccessToken();

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/api/v1/files`);
      if (accessToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      }
      // 不设 Content-Type：由 XHR 按 FormData 自动带 multipart boundary

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error("Upload failed"));
          }
        } else {
          let message = "Upload failed";
          try {
            message = JSON.parse(xhr.responseText).error ?? message;
          } catch {
            // 响应体非 JSON，用默认消息
          }
          reject(new Error(message));
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(formData);
    }),
  downloadUpload: (name: string) => `${API_BASE}/api/v1/files/uploads/${name}`,
  downloadOutput: (taskId: number) => `${API_BASE}/api/v1/files/outputs/${taskId}`,
  /** 带认证拉取渲染产物为 Blob（见 authFetchBlob）。 */
  fetchOutputBlob: (taskId: number): Promise<Blob> =>
    authFetchBlob(`${API_BASE}/api/v1/files/outputs/${taskId}`, "Failed to download output"),
  /** 带认证拉取用户上传文件为 Blob（见 authFetchBlob）。 */
  fetchUploadBlob: (name: string): Promise<Blob> =>
    authFetchBlob(`${API_BASE}/api/v1/files/uploads/${encodeURIComponent(name)}`, "Failed to download file"),
  delete: (name: string) =>
    authFetch<void>(`/api/v1/files/${encodeURIComponent(name)}`, { method: "DELETE" }),
};

// ── Render ────────────────────────────────────────────
export const render = {
  submit: (mode: "single" | "multi", codec: "h264" | "gif", inputProps: Record<string, unknown>) =>
    authFetch<{
      id: number;
      mode: string;
      codec: string;
      status: string;
      input_props: Record<string, unknown>;
      output_path: string;
      created_at: string;
    }>(
      "/api/v1/render",
      { method: "POST", body: JSON.stringify({ mode, codec, input_props: inputProps }) },
    ),
};

// ── Tasks ─────────────────────────────────────────────
export const tasks = {
  list: () =>
    authFetch<{ queue_size: number; avg_fps?: number | null; tasks: Array<TaskResponse> }>("/api/v1/tasks"),
  get: (id: number) => authFetch<TaskResponse>(`/api/v1/tasks/${id}`),
  delete: (id: number) => authFetch<void>(`/api/v1/tasks/${id}`, { method: "DELETE" }),
};

// ── Assets ────────────────────────────────────────────
export const assets = {
  listSilhouettes: () =>
    authFetch<Array<{ name: string; path: string; size_bytes: number }>>(
      "/api/v1/assets/silhouettes",
    ),
  listMusic: () =>
    authFetch<Array<{ name: string; path: string; size_bytes: number }>>(
      "/api/v1/assets/music",
    ),
  url: (category: string, name: string) =>
    `${API_BASE}/api/v1/assets/${category}/${encodeURIComponent(name)}`,
};

export interface AdminSession {
  id: number;
  username: string | null;
  email: string;
  capabilities: string[];
}

export type AssetCategory = "silhouettes" | "music";

export interface AdminAsset {
  category: AssetCategory;
  name: string;
  path: string;
  size_bytes: number;
  modified_at: string;
}

export interface AdminUser {
  id: number;
  username: string | null;
  email: string;
  is_verified: boolean;
  is_admin: boolean;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface AdminUserList {
  items: AdminUser[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminUserDetail {
  user: AdminUser;
  usage: {
    upload_count: number;
    upload_bytes: number;
    output_bytes: number;
    render_total: number;
    render_done: number;
    render_failed: number;
    render_canceled: number;
    render_success_rate: number;
    activity_count: number;
    storage_partial: boolean;
  };
}

export interface AdminAuditEvent {
  id: number;
  actor_user_id: number | null;
  subject_user_id: number | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  success: boolean;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
}

export interface AdminAuditEventList {
  items: AdminAuditEvent[];
  next_cursor: number | null;
}

export interface AdminRenderTask {
  id: number;
  user_id: number;
  mode: string;
  codec: string;
  status: string;
  output_path: string;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  retry_of_task_id: number | null;
}

export interface AdminActiveRender extends AdminRenderTask {
  position: number;
  rendered_frames: number | null;
  total_frames: number | null;
  eta_seconds: number | null;
}

export interface AdminActiveRenderList {
  concurrency: number;
  queue_size: number;
  avg_fps: number | null;
  items: AdminActiveRender[];
}

export interface AdminRenderHistory {
  items: AdminRenderTask[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminUserFilters {
  search?: string;
  isAdmin?: boolean;
  isActive?: boolean;
  isVerified?: boolean;
  page?: number;
  pageSize?: number;
}

function adminUserQuery(filters: AdminUserFilters): string {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.isAdmin !== undefined) query.set("is_admin", String(filters.isAdmin));
  if (filters.isActive !== undefined) query.set("is_active", String(filters.isActive));
  if (filters.isVerified !== undefined) query.set("is_verified", String(filters.isVerified));
  query.set("page", String(filters.page ?? 1));
  query.set("page_size", String(filters.pageSize ?? 50));
  return query.toString();
}

function uploadAdminAsset(
  category: AssetCategory,
  file: File,
  overwrite: boolean,
  onProgress?: (percent: number) => void,
): Promise<AdminAsset> {
  return new Promise((resolve, reject) => {
    const data = new FormData();
    data.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `${API_BASE}/api/v1/admin/assets/${category}?overwrite=${overwrite}`,
    );
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || "null") as AdminAsset | {
        error?: string;
        code?: string;
      } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body) {
        resolve(body as AdminAsset);
        return;
      }
      const errorBody = body as { error?: string; code?: string } | null;
      reject(
        new ApiError(errorBody?.error ?? "公共资源上传失败", {
          code: errorBody?.code,
          status: xhr.status,
        }),
      );
    };
    xhr.onerror = () => reject(new Error("公共资源上传失败"));
    xhr.send(data);
  });
}

export const admin = {
  session: () => authFetch<AdminSession>("/api/v1/admin/me"),
  listAssets: (category: AssetCategory) =>
    authFetch<AdminAsset[]>(
      `/api/v1/admin/assets?category=${encodeURIComponent(category)}`,
    ),
  uploadAsset: uploadAdminAsset,
  deleteAsset: (category: AssetCategory, name: string) =>
    authFetch<void>(
      `/api/v1/admin/assets/${category}/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    ),
  listUsers: (filters: AdminUserFilters = {}) =>
    authFetch<AdminUserList>(`/api/v1/admin/users?${adminUserQuery(filters)}`),
  getUser: (userId: number) =>
    authFetch<AdminUserDetail>(`/api/v1/admin/users/${userId}`),
  setUserRole: (userId: number, isAdmin: boolean) =>
    authFetch<AdminUser>(`/api/v1/admin/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ is_admin: isAdmin }),
    }),
  setUserStatus: (userId: number, isActive: boolean) =>
    authFetch<AdminUser>(`/api/v1/admin/users/${userId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: isActive }),
    }),
  listAuditEvents: (options: { beforeId?: number; limit?: number; action?: string; success?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (options.beforeId !== undefined) query.set("before_id", String(options.beforeId));
    if (options.action) query.set("action", options.action);
    if (options.success !== undefined) query.set("success", String(options.success));
    query.set("limit", String(options.limit ?? 50));
    return authFetch<AdminAuditEventList>(`/api/v1/admin/audit-events?${query}`);
  },
  listUserActivity: (userId: number, beforeId?: number) => {
    const query = beforeId === undefined ? "" : `?before_id=${beforeId}`;
    return authFetch<AdminAuditEventList>(`/api/v1/admin/users/${userId}/activity${query}`);
  },
  activeRenders: () => authFetch<AdminActiveRenderList>("/api/v1/admin/render/active"),
  renderHistory: (filters: { userId?: number; status?: string; mode?: string; codec?: string; page?: number; pageSize?: number } = {}) => {
    const query = new URLSearchParams();
    if (filters.userId !== undefined) query.set("user_id", String(filters.userId));
    if (filters.status) query.set("status", filters.status);
    if (filters.mode) query.set("mode", filters.mode);
    if (filters.codec) query.set("codec", filters.codec);
    query.set("page", String(filters.page ?? 1));
    query.set("page_size", String(filters.pageSize ?? 50));
    return authFetch<AdminRenderHistory>(`/api/v1/admin/render/history?${query}`);
  },
  cancelRender: (taskId: number) =>
    authFetch<AdminRenderTask>(`/api/v1/admin/render/${taskId}/cancel`, { method: "POST" }),
  retryRender: (taskId: number) =>
    authFetch<AdminRenderTask>(`/api/v1/admin/render/${taskId}/retry`, { method: "POST" }),
};

export interface TaskResponse {
  id: number;
  mode: string;
  codec: string;
  status: string;
  input_props: Record<string, unknown>;
  output_path: string;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  position: number;
  eta_seconds: number | null;
  rendered_frames: number | null;
  total_frames: number | null;
  queue_size: number;
  // 文件状态（运行时计算）
  file_expired: boolean;   // 文件是否已被 GC 删除
  output_exists: boolean;  // 文件是否存在
}
