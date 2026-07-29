import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RenderHistoryTable } from "@/components/admin/render/RenderHistoryTable";
import type { AdminRenderTask } from "@/lib/api-client";

const failed: AdminRenderTask = { id: 8, user_id: 3, mode: "single", codec: "h264", status: "failed", output_path: "x", error: "worker", duration_ms: 1200, created_at: "2026-01-01T00:00:00Z", started_at: null, finished_at: null, retry_of_task_id: 4 };

describe("RenderHistoryTable", () => {
  it("only offers retry for failed or canceled history", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const retry = vi.fn();
    render(<RenderHistoryTable items={[failed, { ...failed, id: 9, status: "done", retry_of_task_id: null }]} onRetry={retry} />);
    expect(screen.getByText("RETRY #4")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "重试任务 8" }));
    expect(retry).toHaveBeenCalledWith(8);
  });

  it("shows empty state", () => {
    render(<RenderHistoryTable items={[]} onRetry={vi.fn()} />);
    expect(screen.getByText(/没有匹配/)).toBeInTheDocument();
  });
});
