import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KpiGrid } from "@/components/admin/dashboard/KpiGrid";
import type { AdminDashboardData } from "@/lib/api-client";

export const dashboard: AdminDashboardData = { range: "24h", users: { total: 10, admins: 1, verified: 8, active: 4 }, renders: { submitted: 5, queued: 1, running: 1, done: 2, failed: 1, canceled: 0, success_rate: 2 / 3, avg_queue_ms: 1000, p95_queue_ms: 2000, avg_render_ms: 3000, p95_render_ms: 5000 }, queue: { pending: 1, running: 1, concurrency: 2, avg_fps: 24 }, storage: { uploads: { count: 1, bytes: 2, partial: false }, outputs: { count: 2, bytes: 3, partial: false }, public_assets: { count: 3, bytes: 4, partial: false } }, recent_failures: [], top_errors: [] };

describe("KpiGrid", () => { it("renders user, render, rate and p95 KPIs", () => { render(<KpiGrid dashboard={dashboard} />); expect(screen.getByText("10")).toBeInTheDocument(); expect(screen.getByText("67%")).toBeInTheDocument(); expect(screen.getByText("5.0s")).toBeInTheDocument(); }); });
