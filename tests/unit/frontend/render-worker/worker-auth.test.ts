import { describe, expect, it } from "vitest";

import { isWorkerAuthorized } from "../../../../frontend/render-worker/worker-auth.mjs";

describe("render worker internal authentication", () => {
  it("accepts only the exact bearer token", () => {
    expect(isWorkerAuthorized("Bearer worker-secret", "worker-secret")).toBe(true);
    expect(isWorkerAuthorized("Bearer wrong", "worker-secret")).toBe(false);
    expect(isWorkerAuthorized(undefined, "worker-secret")).toBe(false);
    expect(isWorkerAuthorized("Bearer worker-secret", "")).toBe(false);
  });
});
