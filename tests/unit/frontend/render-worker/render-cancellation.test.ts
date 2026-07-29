import { describe, expect, it, vi } from "vitest";

import {
  cancelActiveRender,
  registerActiveRender,
  unregisterActiveRender,
} from "../../../../frontend/render-worker/render-cancellation.mjs";

describe("render cancellation registry", () => {
  it("cancels a registered render once", () => {
    const cancel = vi.fn();
    registerActiveRender(42, cancel);

    expect(cancelActiveRender(42)).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(cancelActiveRender(42)).toBe(false);
  });

  it("accepts a late cancellation while backend finalization may still be pending", () => {
    registerActiveRender(43, vi.fn());
    unregisterActiveRender(43);
    expect(cancelActiveRender(43)).toBe(true);
    expect(cancelActiveRender(43)).toBe(false);
    unregisterActiveRender(43);
  });

  it("honors cancellation that arrives before the renderer registers", () => {
    const cancel = vi.fn();

    expect(cancelActiveRender(44)).toBe(true);
    expect(cancelActiveRender(44)).toBe(false);
    registerActiveRender(44, cancel);

    expect(cancel).toHaveBeenCalledOnce();
    unregisterActiveRender(44);
  });
});
