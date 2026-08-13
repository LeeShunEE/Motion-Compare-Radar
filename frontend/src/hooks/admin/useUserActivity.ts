"use client";

import React from "react";

import { admin, type AdminAuditEvent } from "@/lib/api-client";

const PAGE_SIZE = 20;

export function useUserActivity(userId: number | null) {
  const [events, setEvents] = React.useState<AdminAuditEvent[]>([]);
  const [nextCursor, setNextCursor] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(userId !== null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (beforeId?: number) => {
      if (userId === null) {
        setEvents([]);
        setNextCursor(null);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const page = await admin.listUserActivity(userId, { beforeId, limit: PAGE_SIZE });
        setEvents((current) => (beforeId === undefined ? page.items : [...current, ...page.items]));
        setNextCursor(page.next_cursor);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "活动记录加载失败");
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  return {
    events,
    nextCursor,
    loading,
    error,
    loadMore: () => (nextCursor === null ? Promise.resolve() : load(nextCursor)),
  };
}
