import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSystemHealth } from "@/hooks/admin/useSystemHealth";

const api = vi.hoisted(() => ({ systemHealth: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ admin: api }));

describe("useSystemHealth", () => {
  beforeEach(() => vi.clearAllMocks());
  it("loads health", async () => {
    api.systemHealth.mockResolvedValue({ state: "healthy" });
    const { result } = renderHook(() => useSystemHealth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.state).toBe("healthy");
  });
  it("exposes degraded request errors", async () => {
    api.systemHealth.mockRejectedValue(new Error("probe failed"));
    const { result } = renderHook(() => useSystemHealth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("probe failed");
  });
  it("uses a stable message for non-Error rejections", async () => {
    api.systemHealth.mockRejectedValue("offline");
    const { result } = renderHook(() => useSystemHealth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("系统健康加载失败");
  });
});
