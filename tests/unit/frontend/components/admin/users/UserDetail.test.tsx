import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UserDetail } from "@/components/admin/users/UserDetail";
import type { AdminUserDetail as Detail } from "@/lib/api-client";

const detail: Detail = { user: { id: 3, username: "alice", display_name: null, email: "a@example.com", is_verified: true, is_admin: false, is_active: true, last_login_at: null, created_at: "2026-01-01T00:00:00Z" }, usage: { upload_count: 2, upload_bytes: 2048, output_bytes: 4096, render_total: 4, render_done: 3, render_failed: 1, render_canceled: 0, render_success_rate: 0.75, activity_count: 12, storage_partial: true } };

describe("UserDetail", () => {
  it("shows usage metrics and partial storage warning", () => {
    render(<UserDetail detail={detail} />);
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("2 个 / 2.0 KB")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("部分结果");
  });

  it("renders identity badges, registration year and never-logged-in", () => {
    render(<UserDetail detail={detail} />);
    expect(screen.getByText("已验证")).toBeInTheDocument();
    expect(screen.getByText("用户")).toBeInTheDocument();
    expect(screen.getByText("启用")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.getByText(/从未/)).toBeInTheDocument();
    expect(screen.queryByText(/显示名/)).not.toBeInTheDocument();
  });

  it("shows display_name when present and hides empty values", () => {
    const { rerender } = render(
      <UserDetail detail={{ ...detail, user: { ...detail.user, display_name: "Alice From Google" } }} />,
    );
    expect(screen.getByText(/Alice From Google/)).toBeInTheDocument();
    rerender(<UserDetail detail={{ ...detail, user: { ...detail.user, display_name: "" } }} />);
    expect(screen.queryByText(/Alice From Google/)).not.toBeInTheDocument();
  });
});
