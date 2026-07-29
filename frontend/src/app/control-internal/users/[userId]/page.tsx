"use client";

import React from "react";
import { useParams } from "next/navigation";

import { UserDetail } from "@/components/admin/users/UserDetail";
import { admin, type AdminUserDetail } from "@/lib/api-client";

export default function AdminUserDetailPage() {
  const params = useParams<{ userId: string }>();
  const [detail, setDetail] = React.useState<AdminUserDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    const userId = Number(params.userId);
    if (!Number.isInteger(userId)) { setError("用户编号无效"); return; }
    admin.getUser(userId).then(setDetail).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "用户详情加载失败"));
  }, [params.userId]);
  if (error) return <p role="alert" className="text-red-200">{error}</p>;
  if (!detail) return <p className="text-slate-500">正在汇总用户指标…</p>;
  return <UserDetail detail={detail} />;
}
