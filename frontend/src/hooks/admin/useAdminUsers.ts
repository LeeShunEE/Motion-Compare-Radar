"use client";

import React from "react";

import { admin, type AdminUserFilters, type AdminUserList } from "@/lib/api-client";

const emptyPage: AdminUserList = { items: [], total: 0, page: 1, page_size: 50 };

export function useAdminUsers(initialFilters: AdminUserFilters = {}) {
  const [filters, setFilters] = React.useState<AdminUserFilters>(initialFilters);
  const [data, setData] = React.useState<AdminUserList>(emptyPage);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await admin.listUsers(filters));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "用户列表加载失败");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const setRole = React.useCallback(async (userId: number, isAdmin: boolean) => {
    await admin.setUserRole(userId, isAdmin);
    await refresh();
  }, [refresh]);

  const setStatus = React.useCallback(async (userId: number, isActive: boolean) => {
    await admin.setUserStatus(userId, isActive);
    await refresh();
  }, [refresh]);

  return { data, filters, setFilters, loading, error, refresh, setRole, setStatus };
}
