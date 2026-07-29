"use client";

import { HealthPanel } from "@/components/admin/dashboard/HealthPanel";
import { KpiGrid } from "@/components/admin/dashboard/KpiGrid";
import { QueueOverview } from "@/components/admin/dashboard/QueueOverview";
import { useAdminDashboard } from "@/hooks/admin/useAdminDashboard";
import { useSystemHealth } from "@/hooks/admin/useSystemHealth";
import type { DashboardRange } from "@/lib/api-client";

const ranges: DashboardRange[] = ["24h", "7d", "30d"];

export default function AdminDashboardPage() {
  const dashboard = useAdminDashboard();
  const health = useSystemHealth();
  return <div className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">Live operations</p><h1 className="mt-2 text-3xl font-semibold">系统总览</h1><p className="mt-2 text-sm text-slate-400">用户、渲染、存储和服务状态的当前观测面。</p></div><div className="flex">{ranges.map((range) => <button key={range} type="button" className={`border px-3 py-2 font-mono text-xs ${dashboard.range === range ? "border-cyan-300 bg-cyan-300/10 text-cyan-100" : "border-cyan-100/10 text-slate-500"}`} onClick={() => dashboard.setRange(range)}>{range}</button>)}</div></header>{(dashboard.error || health.error) && <div role="alert" className="flex items-center justify-between border border-red-300/20 p-3 text-sm text-red-200"><span>{dashboard.error ?? health.error}</span><button type="button" onClick={() => { void dashboard.refresh(); void health.refresh(); }}>重试</button></div>}{dashboard.loading || !dashboard.data ? <p className="text-sm text-slate-500">正在汇聚运营指标…</p> : <><KpiGrid dashboard={dashboard.data} /><div className="grid gap-5 xl:grid-cols-2"><QueueOverview queue={dashboard.data.queue} />{health.data ? <HealthPanel health={health.data} /> : <div className="border border-cyan-100/10 p-5 text-sm text-slate-500">健康状态加载中…</div>}</div><section className="border border-cyan-100/10 bg-[#0d1b2e] p-5"><h2 className="text-lg font-semibold">主要错误</h2>{dashboard.data.top_errors.length === 0 ? <p className="mt-4 text-sm text-slate-500">当前时间范围内没有失败任务。</p> : <ul className="mt-4 space-y-2">{dashboard.data.top_errors.map((error) => <li key={error.error_code} className="flex justify-between font-mono text-sm"><span>{error.error_code}</span><span className="text-amber-300">{error.count}</span></li>)}</ul>}</section></>}</div>;
}
