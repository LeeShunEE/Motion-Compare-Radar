"use client";

import React from "react";

import { admin, type AdminDashboardData, type DashboardRange } from "@/lib/api-client";

export function useAdminDashboard(initialRange: DashboardRange = "24h") {
  const [range, setRange] = React.useState<DashboardRange>(initialRange);
  const [data, setData] = React.useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await admin.dashboard(range)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Dashboard 加载失败"); }
    finally { setLoading(false); }
  }, [range]);
  React.useEffect(() => { void refresh(); }, [refresh]);
  return { data, range, setRange, loading, error, refresh };
}
