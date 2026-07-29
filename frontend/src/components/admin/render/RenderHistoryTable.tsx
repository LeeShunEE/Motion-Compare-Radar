"use client";

import { RotateCcw } from "lucide-react";

import type { AdminRenderTask } from "@/lib/api-client";

export function RenderHistoryTable({ items, onRetry }: { items: AdminRenderTask[]; onRetry: (taskId: number) => Promise<void> }) {
  if (items.length === 0) return <p className="py-8 text-sm text-slate-500">没有匹配的渲染历史。</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="font-mono text-xs text-slate-500"><tr><th className="py-3">任务</th><th>用户</th><th>规格</th><th>状态</th><th>耗时</th><th>创建时间</th><th /></tr></thead><tbody>{items.map((task) => <tr key={task.id} className="border-t border-cyan-100/10"><td className="py-4 font-mono text-cyan-200">#{task.id}{task.retry_of_task_id && <span className="ml-2 text-[0.65rem] text-slate-500">RETRY #{task.retry_of_task_id}</span>}</td><td>#{task.user_id}</td><td>{task.mode} / {task.codec}</td><td>{task.status}</td><td>{task.duration_ms === null ? "—" : `${(task.duration_ms / 1000).toFixed(1)}s`}</td><td className="font-mono text-xs text-slate-400">{new Date(task.created_at).toLocaleString()}</td><td className="text-right">{["failed", "canceled"].includes(task.status) && <button type="button" aria-label={`重试任务 ${task.id}`} className="border border-cyan-200/20 p-2 text-cyan-200" onClick={() => { if (window.confirm(`基于任务 #${task.id} 创建重试任务？`)) void onRetry(task.id); }}><RotateCcw className="size-4" /></button>}</td></tr>)}</tbody></table></div>;
}
