"use client";

import { AuditTable } from "@/components/admin/activity/AuditTable";
import { useAdminBasePath } from "@/hooks/admin/useAdminBasePath";
import { useUserActivity } from "@/hooks/admin/useUserActivity";
import { adminHref } from "@/lib/admin-path";

export function UserActivityPanel({ userId }: { userId: number }) {
  const activity = useUserActivity(userId);
  const base = useAdminBasePath();

  return (
    <section className="space-y-3" aria-label="最近活动">
      <h3 className="text-sm font-semibold text-slate-200">最近活动</h3>
      {activity.loading && activity.events.length === 0 ? (
        <p className="text-sm text-slate-500">正在读取活动…</p>
      ) : (
        <AuditTable events={activity.events} />
      )}
      {activity.error && <p role="alert" className="text-sm text-red-200">{activity.error}</p>}
      <div className="flex flex-wrap gap-3">
        {activity.nextCursor !== null && (
          <button
            type="button"
            disabled={activity.loading}
            className="border border-cyan-300/30 px-4 py-2 text-sm text-cyan-100 disabled:opacity-50"
            onClick={() => void activity.loadMore()}
          >
            加载更早
          </button>
        )}
        <a
          className="border border-cyan-300/30 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10"
          href={adminHref(base, `activity?involved_user_id=${userId}`)}
        >
          查看该用户全部活动
        </a>
      </div>
    </section>
  );
}
