"use client";

import React from "react";

import { admin, type AdminUserDetail } from "@/lib/api-client";

export function useAdminUser(userId: number | null) {
  const [detail, setDetail] = React.useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = React.useState(userId !== null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (userId === null) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDetail(await admin.getUser(userId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "用户详情加载失败");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { detail, loading, error, refresh };
}
