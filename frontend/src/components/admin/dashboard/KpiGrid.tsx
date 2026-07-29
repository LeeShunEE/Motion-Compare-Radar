import type { AdminDashboardData } from "@/lib/api-client";

export function KpiGrid({ dashboard }: { dashboard: AdminDashboardData }) {
  const metrics = [
    ["用户总数", dashboard.users.total, `${dashboard.users.active} 活跃`],
    ["渲染提交", dashboard.renders.submitted, `${dashboard.renders.done} 完成`],
    ["渲染成功率", `${Math.round(dashboard.renders.success_rate * 100)}%`, `${dashboard.renders.failed} 失败`],
    ["P95 渲染耗时", `${(dashboard.renders.p95_render_ms / 1000).toFixed(1)}s`, `AVG ${(dashboard.renders.avg_render_ms / 1000).toFixed(1)}s`],
  ];
  return <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value, note], index) => <div key={label} className="relative overflow-hidden border border-cyan-100/10 bg-[#0d1b2e] p-5"><div aria-hidden="true" className={`absolute -right-8 -top-8 size-24 rounded-full border ${index === 2 ? "border-amber-300/20" : "border-cyan-300/10"}`} /><dt className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</dt><dd className="mt-3 font-mono text-3xl text-slate-100">{value}</dd><p className="mt-2 text-xs text-cyan-300">{note}</p></div>)}</dl>;
}
