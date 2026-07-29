import type { SystemHealthData } from "@/lib/api-client";

function State({ value }: { value: "healthy" | "degraded" }) {
  return <span className={`font-mono text-xs uppercase ${value === "healthy" ? "text-emerald-300" : "text-amber-300"}`}>{value}</span>;
}

export function HealthPanel({ health, detailed = false }: { health: SystemHealthData; detailed?: boolean }) {
  const components = [["Database", health.database.state], ["Render worker", health.render_worker.state], ["Backend storage", health.backend_storage.state], ["Public assets", health.public_assets.state], ["Render temp", health.render_tmp.state]] as const;
  return <section className="border border-cyan-100/10 bg-[#0d1b2e] p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">系统健康</h2><State value={health.state} /></div><ul className="mt-4 divide-y divide-cyan-100/10">{components.map(([label, state]) => <li key={label} className="flex items-center justify-between py-3 text-sm"><span className="text-slate-300">{label}</span><State value={state} /></li>)}</ul>{detailed && <div className="mt-4 border-t border-cyan-100/10 pt-4 font-mono text-xs text-slate-400"><p>UPTIME {health.uptime_seconds}s</p><p className="mt-2">DISK FREE {(health.disk_free_bytes / 1024 / 1024 / 1024).toFixed(1)} GiB / {(health.disk_total_bytes / 1024 / 1024 / 1024).toFixed(1)} GiB</p></div>}</section>;
}
