"use client";

import React from "react";

import { admin, type SystemHealthData } from "@/lib/api-client";

export function useSystemHealth() {
  const [data, setData] = React.useState<SystemHealthData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setData(await admin.systemHealth()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "系统健康加载失败"); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);
  return { data, loading, error, refresh };
}
