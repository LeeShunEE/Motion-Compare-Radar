import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAdminRender } from "@/hooks/admin/useAdminRender";

const api = vi.hoisted(() => ({ activeRenders: vi.fn(), renderHistory: vi.fn(), cancelRender: vi.fn(), retryRender: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ admin: api }));

describe("useAdminRender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.activeRenders.mockResolvedValue({ concurrency: 2, queue_size: 1, avg_fps: 30, items: [{ id: 8 }] });
    api.renderHistory.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 });
  });

  it("loads both views and refreshes after cancel and retry", async () => {
    const { result } = renderHook(() => useAdminRender());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.active.queue_size).toBe(1);
    await act(() => result.current.cancel(8));
    await act(() => result.current.retry(8));
    expect(api.cancelRender).toHaveBeenCalledWith(8);
    expect(api.retryRender).toHaveBeenCalledWith(8);
    expect(api.activeRenders).toHaveBeenCalledTimes(3);
  });

  it("surfaces active view errors", async () => {
    api.activeRenders.mockRejectedValue(new Error("worker down"));
    const { result } = renderHook(() => useAdminRender());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("worker down");
  });

  it("uses fallbacks for non-Error failures", async () => {
    api.renderHistory.mockRejectedValue("offline");
    const { result } = renderHook(() => useAdminRender());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("渲染历史加载失败");

    api.renderHistory.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 });
    api.activeRenders.mockRejectedValue("offline");
    await act(() => result.current.refreshActive());
    expect(result.current.error).toBe("活动队列加载失败");
  });

  it("polls only while the page is visible", async () => {
    const { unmount } = renderHook(() => useAdminRender());
    await waitFor(() => expect(api.activeRenders).toHaveBeenCalled());
    const before = api.activeRenders.mock.calls.length;
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(api.activeRenders).toHaveBeenCalledTimes(before);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(api.activeRenders).toHaveBeenCalledTimes(before + 1));
    unmount();
  });
});
