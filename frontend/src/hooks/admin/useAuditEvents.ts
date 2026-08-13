"use client";

import React from "react";

import { admin, type AdminAuditEvent } from "@/lib/api-client";

export function useAuditEvents(initial: { involvedUserId?: number } = {}) {
  const involvedUserId = initial.involvedUserId;
  const [events, setEvents] = React.useState<AdminAuditEvent[]>([]);
  const [nextCursor, setNextCursor] = React.useState<number | null>(null);
  const [action, setAction] = React.useState("");
  const [success, setSuccess] = React.useState<boolean | undefined>(undefined);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (beforeId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const page = await admin.listAuditEvents({
        beforeId,
        action: action || undefined,
        success,
        involvedUserId,
      });
      setEvents((current) => beforeId === undefined ? page.items : [...current, ...page.items]);
      setNextCursor(page.next_cursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "审计记录加载失败");
    } finally {
      setLoading(false);
    }
  }, [action, success, involvedUserId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return {
    events,
    nextCursor,
    action,
    setAction,
    success,
    setSuccess,
    loading,
    error,
    refresh: () => load(),
    loadMore: () => nextCursor === null ? Promise.resolve() : load(nextCursor),
  };
}
