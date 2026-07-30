import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QueueOverview } from "@/components/admin/dashboard/QueueOverview";

describe("QueueOverview", () => { it("shows occupancy and fps", () => { render(<QueueOverview queue={{ pending: 3, running: 2, concurrency: 4, avg_fps: 29.5 }} />); expect(screen.getByText("2/4")).toBeInTheDocument(); expect(screen.getByText("29.5")).toBeInTheDocument(); expect(screen.getByLabelText("并发槽占用").firstElementChild).toHaveStyle({ width: "50%" }); }); it("shows calibrating fps safely", () => { render(<QueueOverview queue={{ pending: 0, running: 0, concurrency: 1, avg_fps: null }} />); expect(screen.getByText("—")).toBeInTheDocument(); }); });
