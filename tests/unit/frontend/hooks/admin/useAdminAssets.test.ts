import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAdminAssets } from "@/hooks/admin/useAdminAssets";

const api = vi.hoisted(() => ({
  listAssets: vi.fn(),
  uploadAsset: vi.fn(),
  deleteAsset: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({ admin: api }));

const music = {
  category: "music",
  name: "intro.flac",
  path: "music/intro.flac",
  size_bytes: 4,
  modified_at: "2026-01-01T00:00:00Z",
};

describe("useAdminAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listAssets.mockImplementation((category: string) =>
      Promise.resolve(category === "music" ? [music] : []),
    );
  });

  it("loads both fixed asset categories", async () => {
    const { result } = renderHook(() => useAdminAssets());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.assets.music).toEqual([music]);
    expect(result.current.assets.silhouettes).toEqual([]);
    expect(api.listAssets).toHaveBeenCalledTimes(2);
  });

  it("refreshes the category after upload and delete", async () => {
    const { result } = renderHook(() => useAdminAssets());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const file = new File(["new"], "new.flac", { type: "audio/flac" });

    await act(() => result.current.upload("music", file, true));
    await act(() => result.current.remove("music", "intro.flac"));

    expect(api.uploadAsset).toHaveBeenCalledWith("music", file, true, undefined);
    expect(api.deleteAsset).toHaveBeenCalledWith("music", "intro.flac");
    expect(api.listAssets).toHaveBeenCalledTimes(4);
  });

  it("exposes a useful load error and leaves loading state", async () => {
    api.listAssets.mockRejectedValue(new Error("storage unavailable"));
    const { result } = renderHook(() => useAdminAssets());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("storage unavailable");
  });
});
