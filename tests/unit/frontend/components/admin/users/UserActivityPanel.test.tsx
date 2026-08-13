import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserActivityPanel } from "@/components/admin/users/UserActivityPanel";

const api = vi.hoisted(() => ({ listUserActivity: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ admin: api }));

const event = {
  id: 8,
  actor_user_id: 7,
  subject_user_id: 9,
  action: "auth.login_succeeded",
  resource_type: "user",
  resource_id: "9",
  success: true,
  metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

describe("UserActivityPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/radar-ops-console-9x7k2m4p/users/9");
    api.listUserActivity.mockResolvedValue({ items: [event], next_cursor: 8 });
  });

  it("renders activity rows and a deep-link that keeps the runtime prefix", async () => {
    render(<UserActivityPanel userId={9} />);
    expect(screen.getByText("正在读取活动…")).toBeInTheDocument();
    expect(await screen.findByText("auth.login_succeeded")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "查看该用户全部活动" })).toHaveAttribute(
        "href",
        "/radar-ops-console-9x7k2m4p/activity?involved_user_id=9",
      ),
    );
    expect(screen.getByRole("link", { name: "查看该用户全部活动" }).getAttribute("href")).not.toContain(
      "control-internal",
    );
  });

  it("loads earlier events with the cursor", async () => {
    render(<UserActivityPanel userId={9} />);
    await screen.findByText("auth.login_succeeded");
    api.listUserActivity.mockResolvedValueOnce({ items: [], next_cursor: null });
    fireEvent.click(screen.getByRole("button", { name: "加载更早" }));
    await waitFor(() =>
      expect(api.listUserActivity).toHaveBeenLastCalledWith(9, { beforeId: 8, limit: 20 }),
    );
  });

  it("shows the empty activity copy", async () => {
    api.listUserActivity.mockResolvedValueOnce({ items: [], next_cursor: null });
    render(<UserActivityPanel userId={3} />);
    expect(await screen.findByText("没有匹配的活动记录。")).toBeInTheDocument();
  });

  it("surfaces load errors without crashing", async () => {
    api.listUserActivity.mockRejectedValueOnce(new Error("denied"));
    render(<UserActivityPanel userId={9} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("denied");
  });
});
