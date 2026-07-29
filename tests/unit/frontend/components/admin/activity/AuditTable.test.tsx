import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuditTable } from "@/components/admin/activity/AuditTable";

describe("AuditTable", () => {
  it("renders structured action without exposing metadata values", () => {
    render(<AuditTable events={[{ id: 1, actor_user_id: 7, subject_user_id: 9, action: "admin.user_deactivated", resource_type: "user", resource_id: "9", success: true, metadata: { filename: "safe.svg" }, created_at: "2026-01-01T00:00:00Z" }]} />);
    expect(screen.getByText("admin.user_deactivated")).toBeInTheDocument();
    expect(screen.getByText("user:9")).toBeInTheDocument();
    expect(screen.queryByText("safe.svg")).not.toBeInTheDocument();
  });

  it("shows empty state and failed system events", () => {
    const { rerender } = render(<AuditTable events={[]} />);
    expect(screen.getByText("没有匹配的活动记录。")).toBeInTheDocument();
    rerender(<AuditTable events={[{ id: 2, actor_user_id: null, subject_user_id: null, action: "auth.login_succeeded", resource_type: null, resource_id: null, success: false, metadata: {}, created_at: "2026-01-01T00:00:00Z" }]} />);
    expect(screen.getByText("系统")).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
  });
});
