import { render, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { useAdminBasePath } from "@/hooks/admin/useAdminBasePath";

function Probe({ onRender }: { onRender: (base: string) => void }) {
  const base = useAdminBasePath();
  onRender(base);
  return null;
}

describe("useAdminBasePath", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/radar-ops-console-9x7k2m4p/users");
  });

  it("is empty on the first render and then uses the first pathname segment", async () => {
    const renders: string[] = [];
    render(<Probe onRender={(base) => renders.push(base)} />);
    expect(renders[0]).toBe("");
    await waitFor(() => expect(renders.at(-1)).toBe("/radar-ops-console-9x7k2m4p"));
    expect(renders.at(-1)).not.toContain("control-internal");
  });
});
