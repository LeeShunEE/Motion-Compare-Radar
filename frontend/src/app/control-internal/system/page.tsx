"use client";

import { HealthPanel } from "@/components/admin/dashboard/HealthPanel";
import { useSystemHealth } from "@/hooks/admin/useSystemHealth";

export default function AdminSystemPage() {
  const health = useSystemHealth();
  return <div className="space-y-6"><header><p className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-300">Infrastructure</p><h1 className="mt-2 text-2xl font-semibold">系统状态</h1><p className="mt-2 text-sm text-slate-400">数据库、渲染 worker、持久卷和磁盘的实时探测。</p></header>{health.error && <p role="alert" className="text-red-200">{health.error}</p>}{health.loading || !health.data ? <p className="text-slate-500">正在探测子系统…</p> : <HealthPanel health={health.data} detailed />}</div>;
}
