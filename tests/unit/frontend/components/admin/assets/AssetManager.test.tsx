import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssetManager } from "@/components/admin/assets/AssetManager";
import { ApiError } from "@/lib/api-client";

const hook = vi.hoisted(() => ({
  value: {
    assets: {
      silhouettes: [],
      music: [{
        category: "music",
        name: "intro.flac",
        path: "music/intro.flac",
        size_bytes: 4096,
        modified_at: "2026-01-01T00:00:00Z",
      }],
    },
    loading: false as boolean,
    error: null as string | null,
    upload: vi.fn(),
    remove: vi.fn(),
    refresh: vi.fn(),
  },
}));

vi.mock("@/hooks/admin/useAdminAssets", () => ({
  useAdminAssets: () => hook.value,
}));

describe("AssetManager", () => {
  beforeEach(() => {
    hook.value.loading = false;
    hook.value.error = null;
    hook.value.upload.mockReset();
    hook.value.remove.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("renders the two fixed categories and existing metadata", () => {
    render(<AssetManager />);
    expect(screen.getByRole("heading", { name: "剪影" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "音乐" })).toBeInTheDocument();
    expect(screen.getByText("intro.flac")).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent?.startsWith("4 KB ·") ?? false),
    ).toBeInTheDocument();
  });

  it("requires a second confirmation before overwriting a conflict", async () => {
    hook.value.upload
      .mockRejectedValueOnce(new ApiError("同名资源已存在", { status: 409, code: "asset_conflict" }))
      .mockResolvedValueOnce(undefined);
    render(<AssetManager />);
    const file = new File(["audio"], "intro.flac", { type: "audio/flac" });

    fireEvent.change(screen.getByLabelText("上传音乐"), { target: { files: [file] } });

    await waitFor(() => expect(hook.value.upload).toHaveBeenCalledTimes(2));
    expect(hook.value.upload.mock.calls[0][2]).toBe(false);
    expect(hook.value.upload.mock.calls[1][2]).toBe(true);
    expect(window.confirm).toHaveBeenCalled();
  });

  it("confirms destructive deletion", async () => {
    hook.value.remove.mockResolvedValue(undefined);
    render(<AssetManager />);

    fireEvent.click(screen.getByRole("button", { name: "删除 intro.flac" }));

    await waitFor(() => expect(hook.value.remove).toHaveBeenCalledWith("music", "intro.flac"));
  });

  it("renders loading and API error states without exposing stale actions", () => {
    hook.value.loading = true;
    hook.value.error = "storage unavailable";
    render(<AssetManager />);

    expect(screen.getByRole("alert")).toHaveTextContent("storage unavailable");
    expect(screen.getAllByText("正在读取资源…")).toHaveLength(2);
  });

  it("does not delete when the operator cancels confirmation", () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<AssetManager />);
    fireEvent.click(screen.getByRole("button", { name: "删除 intro.flac" }));
    expect(hook.value.remove).not.toHaveBeenCalled();
  });
});
