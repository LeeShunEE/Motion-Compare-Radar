import { describe, expect, it } from "vitest";

import { adminHref } from "@/lib/admin-path";

describe("adminHref", () => {
  it("returns # when the runtime base is empty", () => {
    expect(adminHref("", "users/2")).toBe("#");
  });

  it("joins the secret prefix with an in-console path", () => {
    expect(adminHref("/secret", "users/2")).toBe("/secret/users/2");
    expect(adminHref("/secret", "/users/2")).toBe("/secret/users/2");
    expect(adminHref("/secret")).toBe("/secret");
  });

  it("never emits the internal rewrite tree", () => {
    expect(adminHref("/radar-ops", "users")).not.toContain("control-internal");
  });
});
