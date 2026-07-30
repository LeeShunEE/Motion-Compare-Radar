import { describe, expect, it } from "vitest";

import { resolveAdminRoute } from "@/proxy";

const SECRET = "radar-ops-console-9x7k2m4p";

describe("resolveAdminRoute", () => {
  it("rewrites the runtime secret root to the internal dashboard", () => {
    expect(resolveAdminRoute(`/${SECRET}`, SECRET)).toBe("/control-internal");
  });

  it("preserves nested route suffixes during rewrite", () => {
    expect(resolveAdminRoute(`/${SECRET}/users/42`, SECRET)).toBe(
      "/control-internal/users/42",
    );
  });

  it.each(["/admin", "/control-internal", "/control-internal/users"])(
    "hides guessed or internal path %s",
    (pathname) => {
      expect(resolveAdminRoute(pathname, SECRET)).toBe("/404");
    },
  );

  it("leaves unrelated public routes unchanged", () => {
    expect(resolveAdminRoute("/app", SECRET)).toBeNull();
  });

  it.each([undefined, "short", "admin", "contains space but long enough"])(
    "fails closed for invalid runtime secret %s",
    (secret) => {
      expect(resolveAdminRoute(`/${SECRET}`, secret)).toBeNull();
    },
  );
});
