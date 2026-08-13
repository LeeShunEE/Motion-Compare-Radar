/**
 * login/page.tsx：已登录访问登录页时应离开，而不是继续停在表单。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { __router } from "next/navigation";

const auth = vi.hoisted(() => ({
  value: {
    user: null as null | { username: string | null },
    loading: false,
    error: null as string | null,
    login: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth.value,
}));

vi.mock("@/lib/auth-store", () => ({
  getAuthState: () => ({ user: auth.value.user }),
}));

vi.mock("@/components/auth/OAuthButtons", () => ({
  OAuthButtons: () => null,
}));

import LoginPage from "@/app/(auth)/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    __router.push.mockReset();
    __router.replace.mockReset();
    auth.value = {
      user: null,
      loading: false,
      error: null,
      login: vi.fn(),
    };
  });

  it("未登录时渲染表单且不跳转", () => {
    render(<LoginPage />);
    expect(screen.getByLabelText("用户名或邮箱")).toBeInTheDocument();
    expect(__router.replace).not.toHaveBeenCalled();
    expect(__router.push).not.toHaveBeenCalled();
  });

  it("已登录且有 username 时 replace 到 /app", async () => {
    auth.value.user = { username: "alice" };
    render(<LoginPage />);
    await waitFor(() => expect(__router.replace).toHaveBeenCalledWith("/app"));
  });

  it("已登录但 username 为空时 replace 到 /welcome", async () => {
    auth.value.user = { username: null };
    render(<LoginPage />);
    await waitFor(() =>
      expect(__router.replace).toHaveBeenCalledWith("/welcome"),
    );
  });

  it("loading 时不跳转", () => {
    auth.value.loading = true;
    auth.value.user = null;
    render(<LoginPage />);
    expect(__router.replace).not.toHaveBeenCalled();
  });
});
