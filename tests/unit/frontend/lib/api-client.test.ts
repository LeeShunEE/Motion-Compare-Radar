/**
 * api-client.ts 单元测试：mock fetch，验证 header 注入、401 刷新重试、错误解析。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  auth,
  files,
  render,
  tasks,
  assets,
  setTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  ApiError,
  admin,
  TaskResponse,
} from "@/lib/api-client";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(global, "localStorage", { value: localStorageMock });

describe("api-client", () => {
  beforeEach(() => {
    localStorageMock.clear();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("token helpers", () => {
    it("setTokens writes to localStorage", () => {
      setTokens("access123", "refresh456");
      expect(localStorageMock.getItem("access_token")).toBe("access123");
      expect(localStorageMock.getItem("refresh_token")).toBe("refresh456");
    });

    it("clearTokens removes from localStorage", () => {
      setTokens("access", "refresh");
      clearTokens();
      expect(localStorageMock.getItem("access_token")).toBeNull();
      expect(localStorageMock.getItem("refresh_token")).toBeNull();
    });

    it("getAccessToken returns stored token", () => {
      localStorageMock.setItem("access_token", "stored-access");
      expect(getAccessToken()).toBe("stored-access");
    });
  });

  describe("authFetch", () => {
    it("injects Authorization header when token exists", async () => {
      setTokens("test-access", "test-refresh");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 1 }),
      });

      await auth.me();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/v1/auth/me");
      expect(options.headers.get("Authorization")).toBe("Bearer test-access");
    });

    it("parses error response on non-2xx", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "未提供凭证", code: "auth_error" }),
      });

      await expect(auth.me()).rejects.toThrow("未提供凭证");
    });

    it("returns null for 204 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: vi.fn(),
      });

      const result = await files.delete("test.png");
      expect(result).toBeNull();
    });
  });

  describe("auth endpoints", () => {
    it("register calls correct endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 1, username: "test", email: "test@example.com", created_at: "2026-01-01" }),
      });

      const result = await auth.register("test", "test@example.com", "password123");
      expect(result.username).toBe("test");
      expect(mockFetch.mock.calls[0][0]).toContain("/api/v1/auth/register");
    });

    it("login returns tokens", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "acc", refresh_token: "ref", token_type: "bearer" }),
      });

      const result = await auth.login("test", "password");
      expect(result.access_token).toBe("acc");
      expect(result.refresh_token).toBe("ref");
    });
  });

  describe("files endpoints", () => {
    it("list returns files and quota", async () => {
      setTokens("acc", "ref");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          files: [{ name: "test.png", size_bytes: 1024, modified_at: "2026-01-01" }],
          quota: { used_bytes: 1024, limit_bytes: 200000000, available_bytes: 199998976 },
        }),
      });

      const result = await files.list();
      expect(result.files).toHaveLength(1);
      expect(result.files[0].name).toBe("test.png");
    });

    it("downloadUpload returns URL", () => {
      const url = files.downloadUpload("test.png");
      expect(url).toContain("/api/v1/files/uploads/test.png");
    });
  });

  describe("render endpoints", () => {
    it("submit posts to /render", async () => {
      setTokens("acc", "ref");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          id: 1,
          mode: "single",
          codec: "h264",
          status: "queued",
          input_props: {},
          output_path: "",
          created_at: "2026-01-01",
        }),
      });

      const result = await render.submit("single", "h264", { characterName: "Test" });
      expect(result.id).toBe(1);
      expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    });
  });

  describe("tasks endpoints", () => {
    it("list returns queue_size and tasks", async () => {
      setTokens("acc", "ref");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ queue_size: 2, tasks: [] }),
      });

      const result = await tasks.list();
      expect(result.queue_size).toBe(2);
    });

    it("get returns single task", async () => {
      setTokens("acc", "ref");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 1, mode: "single", codec: "h264", status: "queued", position: 0, eta_seconds: 30 }),
      });

      const result = await tasks.get(1);
      expect(result.id).toBe(1);
      expect(result.position).toBe(0);
    });
  });

  describe("assets endpoints", () => {
    it("listSilhouettes returns array", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ name: "hero.png", path: "silhouettes/hero.png", size_bytes: 1024 }],
      });

      const result = await assets.listSilhouettes();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("hero.png");
    });

    it("url constructs asset URL", () => {
      const url = assets.url("silhouettes", "hero.png");
      expect(url).toContain("/api/v1/assets/silhouettes/hero.png");
    });

    it("url encodes asset name", () => {
      const url = assets.url("music", "rock & roll.mp3");
      expect(url).toContain("rock%20%26%20roll.mp3");
    });

    it("listMusic returns array", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ name: "bgm.mp3", path: "music/bgm.mp3", size_bytes: 2 }],
      });

      const result = await assets.listMusic();
      expect(result[0].name).toBe("bgm.mp3");
    });
  });

  describe("authFetch 高级分支", () => {
    it("getRefreshToken 读取存储的 refresh token", () => {
      localStorageMock.setItem("refresh_token", "stored-refresh");
      expect(getRefreshToken()).toBe("stored-refresh");
    });

    it("带 body 时自动注入 Content-Type", async () => {
      setTokens("a", "r");
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

      await auth.setUsername("alice");

      const opts = mockFetch.mock.calls[0][1];
      expect(opts.headers.get("Content-Type")).toBe("application/json");
    });

    it("401 + 有效 refresh token 触发刷新并重试", async () => {
      setTokens("expired", "valid-refresh");
      mockFetch
        // 第 1 次：GET me → 401
        .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "expired", code: "x" }) })
        // 第 2 次：POST refresh → 200 新 token
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "new-a", refresh_token: "new-r" }) })
        // 第 3 次：GET me 重试 → 200
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 9, username: "u", email: "e", is_verified: true, display_name: null, created_at: "x" }) });

      const result = await auth.me();
      expect(result.id).toBe(9);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(getAccessToken()).toBe("new-a");
      expect(getRefreshToken()).toBe("new-r");
    });

    it("401 + 刷新失败时抛出原始错误并清空 token", async () => {
      setTokens("expired", "bad-refresh");
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "expired", code: "x" }) })
        .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "refresh failed" }) });

      await expect(auth.me()).rejects.toThrow("expired");
      expect(getRefreshToken()).toBeNull();
    });

    it("401 且无 refresh token 时不重试直接抛错", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "no creds", code: "auth_error" }) });

      await expect(auth.me()).rejects.toThrow("no creds");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("非 2xx 且响应体非 JSON 时使用默认错误消息", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error("not json"); } });

      await expect(auth.me()).rejects.toThrow("Unknown error");
    });

    it("抛出的 ApiError 携带 code 与 status", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "禁止", code: "forbidden" }) });

      try {
        await auth.me();
        expect.fail("应抛出");
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).status).toBe(403);
        expect((e as ApiError).code).toBe("forbidden");
      }
    });
  });

  describe("auth 其余端点", () => {
    const okUser = () => ({ ok: true, status: 200, json: async () => ({ id: 1, username: "u", email: "e", created_at: "x" }) });

    it("sendCode posts to /send-code", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ message: "ok" }) });
      const res = await auth.sendCode("e@x.com", "register");
      expect(res.message).toBe("ok");
      expect(mockFetch.mock.calls[0][0]).toContain("/api/v1/auth/send-code");
    });

    it("resetPassword posts to /reset-password", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "a", refresh_token: "r", token_type: "bearer" }) });
      const res = await auth.resetPassword("e@x.com", "123", "pw");
      expect(res.access_token).toBe("a");
    });

    it("registerWithPassword posts username/email/password", async () => {
      mockFetch.mockResolvedValueOnce(okUser());
      const res = await auth.registerWithPassword("u", "e@x.com", "pw");
      expect(res.username).toBe("u");
    });

    it("login 以邮箱登录时发送 email 字段", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "a", refresh_token: "r", token_type: "bearer" }) });
      await auth.login("e@x.com", "pw");
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.email).toBe("e@x.com");
      expect(body.username).toBeUndefined();
    });

    it("refresh posts refresh_token", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "a", refresh_token: "r" }) });
      const res = await auth.refresh("old-r");
      expect(res.access_token).toBe("a");
    });

    it("setUsername / setPassword", async () => {
      mockFetch.mockResolvedValueOnce(okUser());
      await auth.setUsername("newname");
      mockFetch.mockResolvedValueOnce(okUser());
      await auth.setPassword("secret");
      expect(mockFetch.mock.calls[0][0]).toContain("/set-username");
      expect(mockFetch.mock.calls[1][0]).toContain("/set-password");
    });

    it("oauthProviders / oauthStart / oauthCallback", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ google: true, github: false }) });
      const providers = await auth.oauthProviders();
      expect(providers.google).toBe(true);

      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ auth_url: "https://oauth/start" }) });
      const start = await auth.oauthStart("google");
      expect(start.auth_url).toContain("oauth");

      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: "a", refresh_token: "r", token_type: "bearer", is_new_user: true }) });
      const cb = await auth.oauthCallback("google", "code1", "state1");
      expect(cb.is_new_user).toBe(true);
      expect(mockFetch.mock.calls.at(-1)![0]).toContain("code=code1&state=state1");
    });

    it("listOAuthAccounts / bindOAuth / unbindOAuth", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ id: 1, provider: "github", provider_email: null, provider_display_name: null, created_at: "x" }] });
      const accs = await auth.listOAuthAccounts();
      expect(accs).toHaveLength(1);

      mockFetch.mockResolvedValueOnce(okUser());
      await auth.bindOAuth("github", "c", "s");
      expect(mockFetch.mock.calls.at(-1)![1].method).toBe("POST");

      mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: vi.fn() });
      const unbound = await auth.unbindOAuth("github");
      expect(unbound).toBeNull();
    });
  });

  describe("admin users and audit", () => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

    it("serializes user filters and reads detail", async () => {
      mockFetch.mockResolvedValueOnce(ok({ items: [], total: 0, page: 2, page_size: 20 }));
      await admin.listUsers({ search: "alice", isAdmin: true, isActive: false, isVerified: true, page: 2, pageSize: 20 });
      expect(mockFetch.mock.calls[0][0]).toContain("search=alice");
      expect(mockFetch.mock.calls[0][0]).toContain("is_active=false");
      expect(mockFetch.mock.calls[0][0]).toContain("page_size=20");
      mockFetch.mockResolvedValueOnce(ok({ user: { id: 9 }, usage: {} }));
      expect((await admin.getUser(9)).user.id).toBe(9);
    });

    it("patches role and status", async () => {
      mockFetch.mockResolvedValueOnce(ok({ id: 9, is_admin: true }));
      await admin.setUserRole(9, true);
      expect(mockFetch.mock.calls.at(-1)![1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ is_admin: true }) });
      mockFetch.mockResolvedValueOnce(ok({ id: 9, is_active: false }));
      await admin.setUserStatus(9, false);
      expect(mockFetch.mock.calls.at(-1)![1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ is_active: false }) });
    });

    it("serializes audit filters and user cursor", async () => {
      mockFetch.mockResolvedValueOnce(ok({ items: [], next_cursor: null }));
      await admin.listAuditEvents({ beforeId: 12, limit: 20, action: "render.submitted", success: false });
      expect(mockFetch.mock.calls.at(-1)![0]).toContain("before_id=12");
      expect(mockFetch.mock.calls.at(-1)![0]).toContain("success=false");
      mockFetch.mockResolvedValueOnce(ok({ items: [], next_cursor: null }));
      await admin.listUserActivity(9, { beforeId: 4, limit: 20 });
      expect(mockFetch.mock.calls.at(-1)![0]).toContain("users/9/activity?before_id=4");
      expect(mockFetch.mock.calls.at(-1)![0]).toContain("limit=20");
      mockFetch.mockResolvedValueOnce(ok({ items: [], next_cursor: null }));
      await admin.listAuditEvents({ involvedUserId: 9 });
      expect(mockFetch.mock.calls.at(-1)![0]).toContain("involved_user_id=9");
    });

    it("uses stable defaults for unfiltered pages", async () => {
      mockFetch.mockResolvedValueOnce(ok({ items: [], total: 0, page: 1, page_size: 50 }));
      await admin.listUsers();
      expect(mockFetch.mock.calls.at(-1)![0]).toContain("page=1&page_size=50");
      mockFetch.mockResolvedValueOnce(ok({ items: [], next_cursor: null }));
      await admin.listAuditEvents();
      expect(mockFetch.mock.calls.at(-1)![0]).toContain("limit=50");
      mockFetch.mockResolvedValueOnce(ok({ items: [], next_cursor: null }));
      await admin.listUserActivity(9);
      expect(mockFetch.mock.calls.at(-1)![0]).toMatch(/users\/9\/activity$/);
    });

    it("covers global render queue, filtered history and operations", async () => {
      mockFetch.mockResolvedValueOnce(ok({ concurrency: 2, queue_size: 0, avg_fps: null, items: [] }));
      expect((await admin.activeRenders()).concurrency).toBe(2);
      mockFetch.mockResolvedValueOnce(ok({ items: [], total: 0, page: 2, page_size: 20 }));
      await admin.renderHistory({ userId: 3, status: "failed", mode: "single", codec: "h264", page: 2, pageSize: 20 });
      expect(mockFetch.mock.calls.at(-1)![0]).toContain("user_id=3");
      expect(mockFetch.mock.calls.at(-1)![0]).toContain("codec=h264");
      mockFetch.mockResolvedValueOnce(ok({ items: [], total: 0, page: 1, page_size: 50 }));
      await admin.renderHistory();
      expect(mockFetch.mock.calls.at(-1)![0]).toContain("page_size=50");
      mockFetch.mockResolvedValueOnce(ok({ id: 8, status: "canceled" }));
      await admin.cancelRender(8);
      expect(mockFetch.mock.calls.at(-1)![1].method).toBe("POST");
      mockFetch.mockResolvedValueOnce(ok({ id: 12, status: "queued" }));
      await admin.retryRender(8);
      expect(mockFetch.mock.calls.at(-1)![0]).toContain("/8/retry");
    });

    it("loads dashboard range and system health", async () => {
      mockFetch.mockResolvedValueOnce(ok({ range: "7d" }));
      expect((await admin.dashboard("7d")).range).toBe("7d");
      expect(mockFetch.mock.calls.at(-1)![0]).toContain("range=7d");
      mockFetch.mockResolvedValueOnce(ok({ state: "degraded" }));
      expect((await admin.systemHealth()).state).toBe("degraded");
    });
  });

  describe("files.upload（XHR，支持进度）", () => {
    /** 最小 XHR stub：send 后不自动完成，由测试手动触发 onload/onerror/onprogress。 */
    class FakeXHR {
      static instances: FakeXHR[] = [];
      method = "";
      url = "";
      requestHeaders: Record<string, string> = {};
      sentBody: unknown = null;
      status = 0;
      responseText = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      upload = {
        onprogress: null as
          | ((e: { lengthComputable: boolean; loaded: number; total: number }) => void)
          | null,
      };
      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }
      setRequestHeader(key: string, value: string) {
        this.requestHeaders[key] = value;
      }
      send(body: unknown) {
        this.sentBody = body;
        FakeXHR.instances.push(this);
      }
    }

    beforeEach(() => {
      FakeXHR.instances = [];
      vi.stubGlobal("XMLHttpRequest", FakeXHR);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    /** 启动上传并返回 (promise, xhr 实例)。 */
    const startUpload = (onProgress?: (p: number) => void) => {
      const promise = files.upload(new File(["d"], "x.png"), onProgress);
      const xhr = FakeXHR.instances[0];
      return { promise, xhr };
    };

    it("成功解析 JSON 并携带 Authorization 头", async () => {
      setTokens("a", "r");
      const { promise, xhr } = startUpload();
      expect(xhr.method).toBe("POST");
      expect(xhr.url).toContain("/api/v1/files");
      expect(xhr.requestHeaders.Authorization).toBe("Bearer a");
      // FormData 上传不应手动设置 Content-Type（交给 XHR 带 boundary）
      expect(xhr.requestHeaders["Content-Type"]).toBeUndefined();
      expect(xhr.sentBody).toBeInstanceOf(FormData);

      xhr.status = 201;
      xhr.responseText = JSON.stringify({ file: { name: "x.png" } });
      xhr.onload!();

      const res = await promise;
      expect(res.file.name).toBe("x.png");
    });

    it("无 token 时不设置 Authorization 头", async () => {
      const { promise, xhr } = startUpload();
      expect(xhr.requestHeaders.Authorization).toBeUndefined();
      xhr.status = 201;
      xhr.responseText = "{}";
      xhr.onload!();
      await promise;
    });

    it("非 2xx 抛出 body.error", async () => {
      const { promise, xhr } = startUpload();
      xhr.status = 413;
      xhr.responseText = JSON.stringify({ error: "太大" });
      xhr.onload!();
      await expect(promise).rejects.toThrow("太大");
    });

    it("非 2xx 且响应体非 JSON 时回退「Upload failed」", async () => {
      const { promise, xhr } = startUpload();
      xhr.status = 500;
      xhr.responseText = "Internal Server Error";
      xhr.onload!();
      await expect(promise).rejects.toThrow("Upload failed");
    });

    it("onerror 抛出「Upload failed」", async () => {
      const { promise, xhr } = startUpload();
      xhr.onerror!();
      await expect(promise).rejects.toThrow("Upload failed");
    });

    it("onprogress 回调百分比（四舍五入）", async () => {
      const onProgress = vi.fn();
      const { promise, xhr } = startUpload(onProgress);
      xhr.upload.onprogress!({ lengthComputable: true, loaded: 1, total: 3 });
      xhr.upload.onprogress!({ lengthComputable: true, loaded: 3, total: 3 });
      expect(onProgress).toHaveBeenNthCalledWith(1, 33);
      expect(onProgress).toHaveBeenNthCalledWith(2, 100);
      xhr.status = 201;
      xhr.responseText = "{}";
      xhr.onload!();
      await promise;
    });

    it("lengthComputable 为 false 时不回调", async () => {
      const onProgress = vi.fn();
      const { promise, xhr } = startUpload(onProgress);
      xhr.upload.onprogress!({ lengthComputable: false, loaded: 1, total: 0 });
      expect(onProgress).not.toHaveBeenCalled();
      xhr.status = 201;
      xhr.responseText = "{}";
      xhr.onload!();
      await promise;
    });
  });

  describe("files 二进制端点", () => {
    it("downloadOutput 构造产物 URL", () => {
      expect(files.downloadOutput(7)).toContain("/api/v1/files/outputs/7");
    });

    it("fetchOutputBlob 带 token 拉取 Blob", async () => {
      setTokens("a", "r");
      const blob = new Blob(["x"], { type: "video/mp4" });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, blob: async () => blob });
      const res = await files.fetchOutputBlob(7);
      expect(res).toBe(blob);
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe("Bearer a");
    });

    it("fetchUploadBlob 失败抛带 HTTP 状态的错误", async () => {
      setTokens("a", "r");
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404, blob: async () => new Blob() });
      await expect(files.fetchUploadBlob("missing.png")).rejects.toThrow("HTTP 404");
    });
  });

  describe("tasks.delete / get 详尽", () => {
    it("delete 返回 null（204）", async () => {
      setTokens("a", "r");
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: vi.fn() });
      const res = await tasks.delete(5);
      expect(res).toBeNull();
      expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
    });
  });
});
