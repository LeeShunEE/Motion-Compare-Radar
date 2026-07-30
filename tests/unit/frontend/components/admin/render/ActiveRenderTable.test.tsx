import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ActiveRenderTable } from "@/components/admin/render/ActiveRenderTable";
import type { AdminActiveRender } from "@/lib/api-client";

const task: AdminActiveRender = { id: 8, user_id: 3, mode: "single", codec: "h264", status: "running", output_path: "x", error: null, duration_ms: null, created_at: "2026-01-01T00:00:00Z", started_at: null, finished_at: null, retry_of_task_id: null, position: 0, rendered_frames: 25, total_frames: 100, eta_seconds: 5 };

describe("ActiveRenderTable", () => {
  it("shows progress and confirms cancellation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const cancel = vi.fn();
    render(<ActiveRenderTable items={[task]} onCancel={cancel} />);
    expect(screen.getByText("25% (25/100)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "取消任务 8" }));
    expect(cancel).toHaveBeenCalledWith(8);
  });

  it("shows empty and queued states", () => {
    const { rerender } = render(<ActiveRenderTable items={[]} onCancel={vi.fn()} />);
    expect(screen.getByText(/当前没有/)).toBeInTheDocument();
    rerender(<ActiveRenderTable items={[{ ...task, status: "queued", position: 2, rendered_frames: null, total_frames: null, eta_seconds: null }]} onCancel={vi.fn()} />);
    expect(screen.getByText("排队 #2")).toBeInTheDocument();
    expect(screen.getByText("等待上报")).toBeInTheDocument();
  });
});
