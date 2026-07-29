import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HealthPanel } from "@/components/admin/dashboard/HealthPanel";
import type { SystemHealthData } from "@/lib/api-client";

const health: SystemHealthData = { state: "degraded", uptime_seconds: 42, database: { state: "healthy", latency_ms: 2, message: null }, render_worker: { state: "degraded", latency_ms: 3000, message: "render worker unavailable" }, backend_storage: { state: "healthy", readable: true, writable: true }, public_assets: { state: "healthy", readable: true, writable: true }, render_tmp: { state: "healthy", readable: true, writable: true }, disk_total_bytes: 10 * 1024 ** 3, disk_free_bytes: 4 * 1024 ** 3 };

describe("HealthPanel", () => { it("shows degraded component and optional system detail", () => { render(<HealthPanel health={health} detailed />); expect(screen.getAllByText("degraded")).toHaveLength(2); expect(screen.getByText("UPTIME 42s")).toBeInTheDocument(); expect(screen.getByText(/DISK FREE 4.0 GiB/)).toBeInTheDocument(); }); });
