import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuditEvents } from "@/hooks/admin/useAuditEvents";

const api = vi.hoisted(() => ({ listAuditEvents: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ admin: api }));

describe("useAuditEvents", () => {
  beforeEach(() => { vi.clearAllMocks(); api.listAuditEvents.mockResolvedValue({ items: [{ id: 8 }], next_cursor: 8 }); });

  it("loads and appends cursor pages", async () => {
    const { result } = renderHook(() => useAuditEvents());
    await waitFor(() => expect(result.current.loading).toBe(false));
    api.listAuditEvents.mockResolvedValueOnce({ items: [{ id: 7 }], next_cursor: null });
    await act(() => result.current.loadMore());
    expect(result.current.events.map((event) => event.id)).toEqual([8, 7]);
    expect(api.listAuditEvents).toHaveBeenLastCalledWith({
      beforeId: 8,
      action: undefined,
      success: undefined,
      involvedUserId: undefined,
    });
  });

  it("reloads when result filter changes", async () => {
    const { result } = renderHook(() => useAuditEvents());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setSuccess(false));
    await waitFor(() =>
      expect(api.listAuditEvents).toHaveBeenLastCalledWith({
        beforeId: undefined,
        action: undefined,
        success: false,
        involvedUserId: undefined,
      }),
    );
  });

  it("keeps involvedUserId when the success filter changes", async () => {
    const { result } = renderHook(() => useAuditEvents({ involvedUserId: 9 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.listAuditEvents).toHaveBeenLastCalledWith({
      beforeId: undefined,
      action: undefined,
      success: undefined,
      involvedUserId: 9,
    });
    act(() => result.current.setSuccess(false));
    await waitFor(() =>
      expect(api.listAuditEvents).toHaveBeenLastCalledWith({
        beforeId: undefined,
        action: undefined,
        success: false,
        involvedUserId: 9,
      }),
    );
  });
});
