import type { AdminUserDetail as AdminUserDetailData } from "@/lib/api-client";

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function hasDisplayName(value: string | null | undefined): value is string {
  return value != null && value !== "";
}

function formatTimestamp(value: string | null): string {
  if (!value) return "从未";
  return new Date(value).toLocaleString();
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{detail.user.username ?? "未设置用户名"}</h2>
          <span className="border border-cyan-100/15 px-2 py-0.5 text-xs text-slate-300">
            {detail.user.is_verified ? "已验证" : "未验证"}
          </span>
          <span className="border border-cyan-100/15 px-2 py-0.5 text-xs text-slate-300">
            {detail.user.is_admin ? "管理员" : "用户"}
          </span>
          <span className={`border px-2 py-0.5 text-xs ${detail.user.is_active ? "border-emerald-300/30 text-emerald-300" : "border-red-300/30 text-red-300"}`}>
            {detail.user.is_active ? "启用" : "停用"}
          </span>
        </div>
        {hasDisplayName(detail.user.display_name) && (
          <p className="mt-2 text-sm text-slate-300">显示名 {detail.user.display_name}</p>
        )}
        <p className="mt-1 text-sm text-slate-400">邮箱 {detail.user.email}</p>
        <p className="mt-1 font-mono text-xs text-slate-500">注册 {formatTimestamp(detail.user.created_at)}</p>
        <p className="mt-1 font-mono text-xs text-slate-500">最近登录 {formatTimestamp(detail.user.last_login_at)}</p>
      </section>
      {detail.usage.storage_partial && <p role="status" className="border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-200">存储卷扫描不完整，文件指标暂为部分结果。</p>}
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, value]) => <div key={label} className="border border-cyan-100/10 bg-[#0d1b2e] p-4"><dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-2 font-mono text-lg text-slate-100">{value}</dd></div>)}
      </dl>
    </div>
  );
}
