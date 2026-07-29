"use client";

import React from "react";

import { admin, type AdminActiveRenderList, type AdminRenderHistory } from "@/lib/api-client";

const emptyActive: AdminActiveRenderList = { concurrency: 1, queue_size: 0, avg_fps: null, items: [] };
const emptyHistory: AdminRenderHistory = { items: [], total: 0, page: 1, page_size: 50 };

export function useAdminRender() {
  const [active, setActive] = React.useState(emptyActive);
  const [history, setHistory] = React.useState(emptyHistory);
  const [historyFilters, setHistoryFilters] = React.useState<{ userId?: number; status?: string }>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refreshActive = React.useCallback(async () => {
    setError(null);
    try { setActive(await admin.activeRenders()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "活动队列加载失败"); }
  }, []);

  const refreshHistory = React.useCallback(async () => {
    setError(null);
    try { setHistory(await admin.renderHistory(historyFilters)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "渲染历史加载失败"); }
  }, [historyFilters]);

  React.useEffect(() => {
    Promise.all([refreshActive(), refreshHistory()]).finally(() => setLoading(false));
  }, [refreshActive, refreshHistory]);

  React.useEffect(() => {
    const poll = () => { if (document.visibilityState === "visible") void refreshActive(); };
    const interval = window.setInterval(poll, 3000);
    document.addEventListener("visibilitychange", poll);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", poll); };
  }, [refreshActive]);

  const cancel = React.useCallback(async (taskId: number) => {
    await admin.cancelRender(taskId);
    await Promise.all([refreshActive(), refreshHistory()]);
  }, [refreshActive, refreshHistory]);

  const retry = React.useCallback(async (taskId: number) => {
    await admin.retryRender(taskId);
    await Promise.all([refreshActive(), refreshHistory()]);
  }, [refreshActive, refreshHistory]);

  return { active, history, historyFilters, setHistoryFilters, loading, error, refreshActive, refreshHistory, cancel, retry };
}
