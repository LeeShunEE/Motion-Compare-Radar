import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UserTable } from "@/components/admin/users/UserTable";
import type { AdminUser } from "@/lib/api-client";

const user: AdminUser = { id: 9, username: "radar", email: "radar@example.com", is_verified: true, is_admin: false, is_active: true, last_login_at: null, created_at: "2026-01-01T00:00:00Z" };

describe("UserTable", () => {
  it("confirms dangerous role and status changes", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const role = vi.fn().mockResolvedValue(undefined);
    const status = vi.fn().mockResolvedValue(undefined);
    render(<UserTable users={[user]} loading={false} onRoleChange={role} onStatusChange={status} />);

    fireEvent.click(screen.getByRole("button", { name: /授予.*管理员/ }));
    fireEvent.click(screen.getByRole("button", { name: /停用/ }));
    await waitFor(() => expect(role).toHaveBeenCalledWith(9, true));
    expect(status).toHaveBeenCalledWith(9, false);
  });

  it("does not execute when confirmation is rejected", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const role = vi.fn();
    render(<UserTable users={[user]} loading={false} onRoleChange={role} onStatusChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /授予.*管理员/ }));
    expect(role).not.toHaveBeenCalled();
  });

  it("shows loading, empty and action errors", async () => {
    const { rerender } = render(<UserTable users={[]} loading onRoleChange={vi.fn()} onStatusChange={vi.fn()} />);
    expect(screen.getByText(/正在读取用户目录/)).toBeInTheDocument();
    rerender(<UserTable users={[]} loading={false} onRoleChange={vi.fn()} onStatusChange={vi.fn()} />);
    expect(screen.getByText("没有匹配的用户。")).toBeInTheDocument();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    rerender(<UserTable users={[user]} loading={false} onRoleChange={vi.fn().mockRejectedValue(new Error("last admin"))} onStatusChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /授予.*管理员/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("last admin");
  });
});
