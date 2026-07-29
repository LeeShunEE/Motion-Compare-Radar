import type { AdminUserDetail as AdminUserDetailData } from "@/lib/api-client";

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function UserDetail({ detail }: { detail: AdminUserDetailData }) {
  const metrics = [
    ["上传素材", `${detail.usage.upload_count} 个 / ${bytes(detail.usage.upload_bytes)}`],
    ["渲染产物", bytes(detail.usage.output_bytes)],
    ["渲染任务", String(detail.usage.render_total)],
    ["成功率", `${Math.round(detail.usage.render_success_rate * 100)}%`],
    ["失败 / 取消", `${detail.usage.render_failed} / ${detail.usage.render_canceled}`],
    ["活动记录", String(detail.usage.activity_count)],
  ];
  return (
    <div className="space-y-5">
      <section className="border border-cyan-100/10 bg-[#0d1b2e] p-5">
        <p className="font-mono text-xs text-cyan-300">USER / {detail.user.id}</p>
        <h2 className="mt-2 text-xl font-semibold">{detail.user.username ?? "未设置用户名"}</h2>
        <p className="mt-1 text-sm text-slate-400">{detail.user.email}</p>
      </section>
      {detail.usage.storage_partial && <p role="status" className="border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-200">存储卷扫描不完整，文件指标暂为部分结果。</p>}
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, value]) => <div key={label} className="border border-cyan-100/10 bg-[#0d1b2e] p-4"><dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-2 font-mono text-lg text-slate-100">{value}</dd></div>)}
      </dl>
    </div>
  );
}
