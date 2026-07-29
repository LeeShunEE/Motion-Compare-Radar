export default function AdminDashboardPage() {
  return (
    <section aria-labelledby="admin-dashboard-heading">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-300">Live operations</p>
      <h1 id="admin-dashboard-heading" className="mt-3 text-3xl font-semibold tracking-tight">系统总览</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
        管理身份已验证。后续阶段将在这里汇总渲染队列、用户活动、存储和服务健康状态。
      </p>
    </section>
  );
}
