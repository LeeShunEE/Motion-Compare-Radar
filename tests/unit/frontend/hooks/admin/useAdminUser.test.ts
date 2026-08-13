import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAdminUser } from "@/hooks/admin/useAdminUser";

const api = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ admin: api }));

const detail = {
  user: { id: 3, username: "alice", email: "a@example.com" },
  usage: { upload_count: 0 },
};

describe("useAdminUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getUser.mockResolvedValue(detail);
  });

  it("loads a user by id", async () => {
    const { result } = renderHook(() => useAdminUser(3));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getUser).toHaveBeenCalledWith(3);
    expect(result.current.detail).toEqual(detail);
  });

  it("does not request when the id is invalid", async () => {
    const { result } = renderHook(() => useAdminUser(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getUser).not.toHaveBeenCalled();
    expect(result.current.detail).toBeNull();
  });

  it("surfaces a 404 message", async () => {
    api.getUser.mockRejectedValue(new Error("用户不存在"));
    const { result } = renderHook(() => useAdminUser(99));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("用户不存在");
  });
});
