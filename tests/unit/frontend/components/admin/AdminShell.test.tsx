import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminShell } from "@/components/admin/AdminShell";

const auth = vi.hoisted(() => ({
  user: { username: "operator", email: "operator@example.com" },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));

describe("AdminShell", () => {
  beforeEach(() => window.history.replaceState({}, "", "/radar-ops-console-9x7k2m4p/users/42"));

  it("renders all operational sections with the runtime path prefix", async () => {
    render(<AdminShell><p>workspace</p></AdminShell>);

    expect(screen.getByRole("navigation", { name: "管理控制台" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "公共资源" })).toHaveAttribute(
        "href",
        "/radar-ops-console-9x7k2m4p/assets",
      ),
    );
    expect(screen.getByRole("link", { name: "渲染任务" })).toHaveAttribute(
      "href",
      "/radar-ops-console-9x7k2m4p/render",
    );
    expect(screen.getByRole("link", { name: "公共资源" }).getAttribute("href")).not.toContain(
      "control-internal",
    );
    expect(screen.getByText("workspace")).toBeInTheDocument();
    expect(screen.getByText("operator@example.com")).toBeInTheDocument();
  });
});
