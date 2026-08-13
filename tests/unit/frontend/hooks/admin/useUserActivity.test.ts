import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useUserActivity } from "@/hooks/admin/useUserActivity";

const api = vi.hoisted(() => ({ listUserActivity: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ admin: api }));

describe("useUserActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listUserActivity.mockResolvedValue({ items: [{ id: 8 }], next_cursor: 8 });
  });

  it("loads the first page with a 20-item limit", async () => {
    const { result } = renderHook(() => useUserActivity(9));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.listUserActivity).toHaveBeenCalledWith(9, { beforeId: undefined, limit: 20 });
  });

  it("loads earlier pages with the cursor", async () => {
    const { result } = renderHook(() => useUserActivity(9));
    await waitFor(() => expect(result.current.loading).toBe(false));
    api.listUserActivity.mockResolvedValueOnce({ items: [{ id: 7 }], next_cursor: null });
    await act(() => result.current.loadMore());
    expect(api.listUserActivity).toHaveBeenLastCalledWith(9, { beforeId: 8, limit: 20 });
    expect(result.current.events.map((event) => event.id)).toEqual([8, 7]);
  });
});
