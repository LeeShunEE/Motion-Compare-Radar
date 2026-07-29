"use client";

import { AuditTable } from "@/components/admin/activity/AuditTable";
import { useAuditEvents } from "@/hooks/admin/useAuditEvents";

export default function AdminActivityPage() {
  const audit = useAuditEvents();
  return (
    <div className="space-y-6">
      <header><p className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-300">Audit stream</p><h1 className="mt-2 text-2xl font-semibold">使用记录</h1><p className="mt-2 text-sm text-slate-400">保留 180 天的登录、文件、渲染和管理员关键动作。</p></header>
      <div className="flex flex-wrap gap-3 border border-cyan-100/10 bg-[#0d1b2e] p-4">
        <input aria-label="动作筛选" className="min-w-60 flex-1 border border-cyan-100/15 bg-[#08111f] px-3 py-2 text-sm" value={audit.action} onChange={(event) => audit.setAction(event.target.value)} placeholder="例如 render.submitted" />
        <select aria-label="操作结果" className="border border-cyan-100/15 bg-[#08111f] px-3 py-2 text-sm" value={audit.success === undefined ? "" : String(audit.success)} onChange={(event) => audit.setSuccess(event.target.value === "" ? undefined : event.target.value === "true")}><option value="">全部结果</option><option value="true">成功</option><option value="false">失败</option></select>
      </div>
      {audit.error && <p role="alert" className="text-sm text-red-200">{audit.error}</p>}
      {audit.loading && audit.events.length === 0 ? <p className="text-sm text-slate-500">正在读取审计流…</p> : <AuditTable events={audit.events} />}
      {audit.nextCursor !== null && <button type="button" disabled={audit.loading} className="border border-cyan-300/30 px-4 py-2 text-sm text-cyan-100 disabled:opacity-50" onClick={() => void audit.loadMore()}>加载更早记录</button>}
    </div>
  );
}
