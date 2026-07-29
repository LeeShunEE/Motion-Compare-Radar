/** 管理员 API 客户端边界集成测试。 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { admin, ApiError, setTokens } from "@/lib/api-client";

class FakeXHR {
  static latest: FakeXHR;
  status = 0;
  responseText = "";
  requestHeaders: Record<string, string> = {};
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  url = "";

  constructor() {
    FakeXHR.latest = this;
  }

  open(_method: string, url: string) {
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.requestHeaders[name] = value;
  }

  send(_body: FormData) {}
}

describe("admin api client", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists and deletes assets with authenticated requests", async () => {
    setTokens("access", "refresh");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [{ name: "intro.flac" }],
      })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    const listed = await admin.listAssets("music");
    await admin.deleteAsset("music", "intro.flac");

    expect(listed[0].name).toBe("intro.flac");
    expect(fetchMock.mock.calls[0][0]).toContain("category=music");
    expect(fetchMock.mock.calls[1][1].method).toBe("DELETE");
  });

  it("uploads with progress, overwrite flag and bearer token", async () => {
    setTokens("access", "refresh");
    const progress = vi.fn();
    const promise = admin.uploadAsset(
      "music",
      new File(["audio"], "intro.flac"),
      true,
      progress,
    );
    const xhr = FakeXHR.latest;
    xhr.upload.onprogress?.({
      lengthComputable: true,
      loaded: 1,
      total: 2,
    } as ProgressEvent);
    xhr.status = 201;
    xhr.responseText = JSON.stringify({ name: "intro.flac" });
    xhr.onload?.();

    await expect(promise).resolves.toMatchObject({ name: "intro.flac" });
    expect(xhr.url).toContain("overwrite=true");
    expect(xhr.requestHeaders.Authorization).toBe("Bearer access");
    expect(progress).toHaveBeenCalledWith(50);
  });

  it("preserves the backend conflict code for overwrite confirmation", async () => {
    const promise = admin.uploadAsset(
      "music",
      new File(["audio"], "intro.flac"),
      false,
    );
    const xhr = FakeXHR.latest;
    xhr.status = 409;
    xhr.responseText = JSON.stringify({
      error: "同名公共资源已存在",
      code: "asset_conflict",
    });
    xhr.onload?.();

    await expect(promise).rejects.toMatchObject<ApiError>({
      status: 409,
      code: "asset_conflict",
    });
  });
});
