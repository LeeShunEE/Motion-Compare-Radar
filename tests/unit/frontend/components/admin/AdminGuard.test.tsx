import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { __router } from "next/navigation";

const state = vi.hoisted(() => ({
  auth: {
    loading: true,
    isAuthenticated: false,
    user: null as null | { isAdmin: boolean },
  },
  session: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => state.auth,
}));

vi.mock("@/lib/api-client", () => ({
  admin: { session: state.session },
}));

describe("AdminGuard", () => {
  beforeEach(() => {
    state.auth = { loading: true, isAuthenticated: false, user: null };
    state.session.mockReset();
    __router.replace.mockReset();
  });

  it("does not expose children while authentication is loading", () => {
    render(<AdminGuard><p>restricted</p></AdminGuard>);
    expect(screen.getByText("正在校验管理权限…")).toBeInTheDocument();
    expect(screen.queryByText("restricted")).not.toBeInTheDocument();
  });

  it("redirects an unauthenticated visitor to login", () => {
    state.auth = { loading: false, isAuthenticated: false, user: null };
    render(<AdminGuard><p>restricted</p></AdminGuard>);
    expect(__router.replace).toHaveBeenCalledWith("/login");
  });

  it("shows a stable denial state for a regular user", () => {
    state.auth = {
      loading: false,
      isAuthenticated: true,
      user: { isAdmin: false },
    };
    render(<AdminGuard><p>restricted</p></AdminGuard>);
    expect(screen.getByRole("heading", { name: "无法访问管理区域" })).toBeInTheDocument();
    expect(state.session).not.toHaveBeenCalled();
  });

  it("renders children only after the server confirms the admin session", async () => {
    state.auth = {
      loading: false,
      isAuthenticated: true,
      user: { isAdmin: true },
    };
    state.session.mockResolvedValue({
      id: 7,
      username: "operator",
      email: "operator@example.com",
      capabilities: ["system:read"],
    });

    render(<AdminGuard><p>restricted</p></AdminGuard>);

    await waitFor(() => expect(screen.getByText("restricted")).toBeInTheDocument());
    expect(state.session).toHaveBeenCalledOnce();
  });
});
