import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAdminDashboard } from "@/hooks/admin/useAdminDashboard";

const api = vi.hoisted(() => ({ dashboard: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ admin: api }));

describe("useAdminDashboard", () => {
  beforeEach(() => { vi.clearAllMocks(); api.dashboard.mockResolvedValue({ range: "24h" }); });
  it("loads and switches range", async () => {
    const { result } = renderHook(() => useAdminDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.dashboard).toHaveBeenCalledWith("24h");
    act(() => result.current.setRange("7d"));
    await waitFor(() => expect(api.dashboard).toHaveBeenLastCalledWith("7d"));
  });
  it("surfaces errors", async () => {
    api.dashboard.mockRejectedValue(new Error("metrics failed"));
    const { result } = renderHook(() => useAdminDashboard());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("metrics failed");
  });
});
