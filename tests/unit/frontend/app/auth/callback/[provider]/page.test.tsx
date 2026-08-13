/**
 * OAuth 回调页：同一 code/state 只打一次后端，成功后按 username 跳转。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import {
  __router,
  __params,
  __setSearchParams,
  __resetNavigationMocks,
} from "next/navigation";

const handleOAuthCallback = vi.fn();
const getAuthState = vi.fn();

vi.mock("@/lib/auth-store", () => ({
  handleOAuthCallback: (...args: unknown[]) => handleOAuthCallback(...args),
  getAuthState: () => getAuthState(),
}));

import OAuthCallbackPage from "@/app/auth/callback/[provider]/page";

describe("OAuthCallbackPage", () => {
  beforeEach(() => {
    __resetNavigationMocks();
    __params.provider = "google";
    __setSearchParams("code=abc&state=xyz");
    handleOAuthCallback.mockReset();
    getAuthState.mockReset();
    handleOAuthCallback.mockResolvedValue(false);
    getAuthState.mockReturnValue({ user: { username: "alice" } });
  });

  it("StrictMode 双调用 effect 时 handleOAuthCallback 只跑一次", async () => {
    render(
      <StrictMode>
        <OAuthCallbackPage />
      </StrictMode>,
    );

    await waitFor(() => expect(handleOAuthCallback).toHaveBeenCalled());
    expect(handleOAuthCallback).toHaveBeenCalledTimes(1);
    expect(handleOAuthCallback).toHaveBeenCalledWith("google", "abc", "xyz");
    await waitFor(() => expect(__router.push).toHaveBeenCalledWith("/app"));
  });

  it("username 为空时跳转 /welcome", async () => {
    getAuthState.mockReturnValue({ user: { username: null } });
    render(<OAuthCallbackPage />);

    await waitFor(() => expect(__router.push).toHaveBeenCalledWith("/welcome"));
  });

  it("缺少 code/state 时不打后端", async () => {
    __setSearchParams("");
    render(<OAuthCallbackPage />);

    await waitFor(() => expect(handleOAuthCallback).not.toHaveBeenCalled());
  });
});
