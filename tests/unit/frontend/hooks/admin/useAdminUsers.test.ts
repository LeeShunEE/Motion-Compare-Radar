import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAdminUsers } from "@/hooks/admin/useAdminUsers";

const api = vi.hoisted(() => ({ listUsers: vi.fn(), setUserRole: vi.fn(), setUserStatus: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ admin: api }));

const page = { items: [{ id: 4, email: "u@example.com" }], total: 1, page: 1, page_size: 50 };

describe("useAdminUsers", () => {
  beforeEach(() => { vi.clearAllMocks(); api.listUsers.mockResolvedValue(page); });

  it("loads filters and refreshes after permission changes", async () => {
    const { result } = renderHook(() => useAdminUsers({ isActive: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.listUsers).toHaveBeenCalledWith({ isActive: true });

    await act(() => result.current.setRole(4, true));
    await act(() => result.current.setStatus(4, false));
    expect(api.setUserRole).toHaveBeenCalledWith(4, true);
    expect(api.setUserStatus).toHaveBeenCalledWith(4, false);
    expect(api.listUsers).toHaveBeenCalledTimes(3);
  });

  it("surfaces load errors", async () => {
    api.listUsers.mockRejectedValue(new Error("denied"));
    const { result } = renderHook(() => useAdminUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("denied");
  });
});
