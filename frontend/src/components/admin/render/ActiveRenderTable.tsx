"use client";

import { PauseCircle } from "lucide-react";

import type { AdminActiveRender } from "@/lib/api-client";

export function ActiveRenderTable({ items, onCancel }: { items: AdminActiveRender[]; onCancel: (taskId: number) => Promise<void> }) {
  if (items.length === 0) return <p className="py-8 text-sm text-slate-500">当前没有排队或运行中的任务。</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="font-mono text-xs text-slate-500"><tr><th className="py-3">任务</th><th>用户</th><th>状态 / 排位</th><th>进度</th><th>ETA</th><th /></tr></thead><tbody>{items.map((task) => {
    const percent = task.rendered_frames !== null && task.total_frames ? Math.round(task.rendered_frames / task.total_frames * 100) : null;
    return <tr key={task.id} className="border-t border-cyan-100/10"><td className="py-4 font-mono text-cyan-200">#{task.id}</td><td>#{task.user_id}</td><td>{task.status === "running" ? "运行中" : `排队 #${task.position}`}</td><td>{percent === null ? "等待上报" : `${percent}% (${task.rendered_frames}/${task.total_frames})`}</td><td>{task.eta_seconds === null ? "—" : `${Math.ceil(task.eta_seconds)}s`}</td><td className="text-right"><button type="button" aria-label={`取消任务 ${task.id}`} className="border border-amber-200/20 p-2 text-amber-200" onClick={() => { if (window.confirm(`确认取消任务 #${task.id}？`)) void onCancel(task.id); }}><PauseCircle className="size-4" /></button></td></tr>;
  })}</tbody></table></div>;
}
