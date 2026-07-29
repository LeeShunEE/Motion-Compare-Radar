import type { AdminAuditEvent } from "@/lib/api-client";

export function AuditTable({ events }: { events: AdminAuditEvent[] }) {
  if (events.length === 0) return <p className="py-10 text-sm text-slate-500">没有匹配的活动记录。</p>;
  return (
    <div className="overflow-x-auto border border-cyan-100/10 bg-[#0d1b2e]">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-cyan-100/10 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-slate-500"><tr><th className="px-4 py-3">时间</th><th>动作</th><th>操作者</th><th>资源</th><th className="px-4">结果</th></tr></thead>
        <tbody>{events.map((event) => <tr key={event.id} className="border-b border-cyan-100/5 last:border-0"><td className="px-4 py-4 font-mono text-xs text-slate-400">{new Date(event.created_at).toLocaleString()}</td><td className="font-mono text-cyan-200">{event.action}</td><td>{event.actor_user_id ?? "系统"}</td><td>{event.resource_type && `${event.resource_type}:${event.resource_id ?? "-"}`}</td><td className={`px-4 ${event.success ? "text-emerald-300" : "text-red-300"}`}>{event.success ? "成功" : "失败"}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
