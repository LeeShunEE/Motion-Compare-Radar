"use client";

import { ActiveRenderTable } from "@/components/admin/render/ActiveRenderTable";
import { RenderHistoryTable } from "@/components/admin/render/RenderHistoryTable";
import { useAdminRender } from "@/hooks/admin/useAdminRender";

export default function AdminRenderPage() {
  const render = useAdminRender();
  return <div className="space-y-6">
    <header><p className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-300">Render telemetry</p><h1 className="mt-2 text-2xl font-semibold">渲染任务</h1><p className="mt-2 text-sm text-slate-400">查看全局队列、逐帧进度与历史，并对异常任务执行取消或重试。</p></header>
    {render.error && <p role="alert" className="border border-red-300/20 p-3 text-sm text-red-200">{render.error}</p>}
    <section className="border border-cyan-100/10 bg-[#0d1b2e] p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">活动队列</h2><p className="mt-1 font-mono text-xs text-slate-500">{render.active.queue_size} TASKS / {render.active.concurrency} SLOTS / {render.active.avg_fps === null ? "FPS CALIBRATING" : `${render.active.avg_fps.toFixed(1)} FPS`}</p></div></div><ActiveRenderTable items={render.active.items} onCancel={render.cancel} /></section>
    <section className="border border-cyan-100/10 bg-[#0d1b2e] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">渲染历史</h2><p className="mt-1 font-mono text-xs text-slate-500">{render.history.total} RECORDS</p></div><select aria-label="历史状态" className="border border-cyan-100/15 bg-[#08111f] px-3 py-2 text-sm" onChange={(event) => render.setHistoryFilters((current) => ({ ...current, status: event.target.value || undefined }))}><option value="">全部状态</option><option value="done">done</option><option value="failed">failed</option><option value="canceled">canceled</option></select></div><RenderHistoryTable items={render.history.items} onRetry={render.retry} /></section>
  </div>;
}
