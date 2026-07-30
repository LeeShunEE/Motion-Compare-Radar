import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UserDetail } from "@/components/admin/users/UserDetail";
import type { AdminUserDetail as Detail } from "@/lib/api-client";

const detail: Detail = { user: { id: 3, username: "alice", email: "a@example.com", is_verified: true, is_admin: false, is_active: true, last_login_at: null, created_at: "2026-01-01T00:00:00Z" }, usage: { upload_count: 2, upload_bytes: 2048, output_bytes: 4096, render_total: 4, render_done: 3, render_failed: 1, render_canceled: 0, render_success_rate: 0.75, activity_count: 12, storage_partial: true } };

describe("UserDetail", () => {
  it("shows usage metrics and partial storage warning", () => {
    render(<UserDetail detail={detail} />);
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("2 个 / 2.0 KB")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("部分结果");
  });
});
