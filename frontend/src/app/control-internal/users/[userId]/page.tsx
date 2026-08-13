"use client";

import { useParams } from "next/navigation";

import { UserActivityPanel } from "@/components/admin/users/UserActivityPanel";
import { UserDetail } from "@/components/admin/users/UserDetail";
import { useAdminBasePath } from "@/hooks/admin/useAdminBasePath";
import { useAdminUser } from "@/hooks/admin/useAdminUser";
import { adminHref } from "@/lib/admin-path";

export default function AdminUserDetailPage() {
  const params = useParams<{ userId: string }>();
  const parsed = Number(params.userId);
  const userId = Number.isInteger(parsed) ? parsed : null;
  const { detail, error } = useAdminUser(userId);
  const base = useAdminBasePath();

  if (userId === null) return <p role="alert" className="text-red-200">用户编号无效</p>;
  return (
    <div className="space-y-6">
      <a className="text-sm text-cyan-200 hover:text-cyan-100" href={adminHref(base, "users")}>
        返回用户列表
      </a>
      {error && <p role="alert" className="text-red-200">{error}</p>}
      {!error && !detail && <p className="text-slate-500">正在汇总用户指标…</p>}
      {detail && (
        <>
          <UserDetail detail={detail} />
          <UserActivityPanel userId={userId} />
        </>
      )}
    </div>
  );
}
