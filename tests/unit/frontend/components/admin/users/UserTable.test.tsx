import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserTable } from "@/components/admin/users/UserTable";
import type { AdminUser } from "@/lib/api-client";

const user: AdminUser = { id: 9, username: "radar", display_name: null, email: "radar@example.com", is_verified: true, is_admin: false, is_active: true, last_login_at: null, created_at: "2026-01-01T00:00:00Z" };

function renderTable(users: AdminUser[] = [user]) {
  return render(
    <UserTable users={users} loading={false} onRoleChange={vi.fn()} onStatusChange={vi.fn()} />,
  );
}

describe("UserTable", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/radar-ops-console-9x7k2m4p/users");
  });

  it("links username and 查看详情 after the path hook flushes", async () => {
    renderTable();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "radar" })).toHaveAttribute(
        "href",
        "/radar-ops-console-9x7k2m4p/users/9",
      ),
    );
    const detail = screen.getByRole("link", { name: "查看 radar@example.com 的详情" });
    expect(detail).toHaveAttribute("href", "/radar-ops-console-9x7k2m4p/users/9");
    expect(detail.getAttribute("href")).not.toContain("control-internal");
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("renders display_name between username and email, and hides empty values", () => {
    const { rerender } = renderTable([{ ...user, display_name: "Alice From Google" }]);
    const cell = screen.getByText("radar").closest("td");
    expect(cell?.textContent).toContain("Alice From Google");
    expect(cell?.textContent?.indexOf("Alice From Google")).toBeLessThan(
      cell?.textContent?.indexOf("radar@example.com") ?? -1,
    );

    rerender(
      <UserTable
        users={[{ ...user, display_name: "" }]}
        loading={false}
        onRoleChange={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );
    expect(screen.queryByText("Alice From Google")).not.toBeInTheDocument();
  });

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
