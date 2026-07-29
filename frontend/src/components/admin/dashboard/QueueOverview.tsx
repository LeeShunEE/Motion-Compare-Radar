import type { AdminDashboardData } from "@/lib/api-client";

export function QueueOverview({ queue }: { queue: AdminDashboardData["queue"] }) {
  const occupied = Math.min(queue.running / queue.concurrency * 100, 100);
  return <section className="border border-cyan-100/10 bg-[#0d1b2e] p-5"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">实时队列</h2><p className="mt-1 text-xs text-slate-500">并发槽占用</p></div><span className="font-mono text-cyan-300">{queue.running}/{queue.concurrency}</span></div><div aria-label="并发槽占用" className="mt-5 h-2 bg-slate-800"><div className="h-full bg-cyan-300" style={{ width: `${occupied}%` }} /></div><div className="mt-4 grid grid-cols-3 gap-3 text-center"><div><p className="font-mono text-xl">{queue.pending}</p><p className="text-xs text-slate-500">pending</p></div><div><p className="font-mono text-xl">{queue.running}</p><p className="text-xs text-slate-500">running</p></div><div><p className="font-mono text-xl">{queue.avg_fps === null ? "—" : queue.avg_fps.toFixed(1)}</p><p className="text-xs text-slate-500">recent FPS</p></div></div></section>;
}
