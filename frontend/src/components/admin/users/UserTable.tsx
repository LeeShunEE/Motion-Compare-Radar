"use client";

import React from "react";
import { ShieldCheck, ShieldOff, UserRoundCheck, UserRoundX } from "lucide-react";

import type { AdminUser } from "@/lib/api-client";

function userHref(userId: number): string {
  if (typeof window === "undefined") return "#";
  const base = window.location.pathname.split("/").filter(Boolean)[0];
  return base ? `/${base}/users/${userId}` : "#";
}

export function UserTable({
  users,
  loading,
  onRoleChange,
  onStatusChange,
}: {
  users: AdminUser[];
  loading: boolean;
  onRoleChange: (userId: number, isAdmin: boolean) => Promise<void>;
  onStatusChange: (userId: number, isActive: boolean) => Promise<void>;
}) {
  const [actionError, setActionError] = React.useState<string | null>(null);

  const act = async (message: string, action: () => Promise<void>) => {
    if (!window.confirm(message)) return;
    setActionError(null);
    try {
      await action();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "操作失败");
    }
  };

  if (loading) return <p className="py-10 text-sm text-slate-500">正在读取用户目录…</p>;
  if (users.length === 0) return <p className="py-10 text-sm text-slate-500">没有匹配的用户。</p>;

  return (
    <div className="overflow-x-auto border border-cyan-100/10 bg-[#0d1b2e]">
      {actionError && <div role="alert" className="border-b border-red-300/20 px-4 py-3 text-sm text-red-200">{actionError}</div>}
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-cyan-100/10 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-slate-500">
          <tr><th className="px-4 py-3">用户</th><th>状态</th><th>角色</th><th>最近登录</th><th className="px-4 text-right">操作</th></tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-cyan-100/5 last:border-0">
              <td className="px-4 py-4"><a className="font-medium text-cyan-100 hover:text-cyan-300" href={userHref(user.id)}>{user.username ?? `用户 #${user.id}`}</a><p className="mt-1 text-xs text-slate-500">{user.email}</p></td>
              <td><span className={user.is_active ? "text-emerald-300" : "text-red-300"}>{user.is_active ? "启用" : "停用"}</span></td>
              <td>{user.is_admin ? "管理员" : "用户"}</td>
              <td className="font-mono text-xs text-slate-400">{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "从未"}</td>
              <td className="px-4"><div className="flex justify-end gap-2">
                <button type="button" aria-label={user.is_admin ? `撤销 ${user.email} 管理员` : `授予 ${user.email} 管理员`} className="border border-cyan-200/20 p-2 text-cyan-200" onClick={() => void act(user.is_admin ? "确认撤销该用户的管理员权限？" : "确认授予该用户管理员权限？", () => onRoleChange(user.id, !user.is_admin))}>{user.is_admin ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />}</button>
                <button type="button" aria-label={user.is_active ? `停用 ${user.email}` : `启用 ${user.email}`} className="border border-amber-200/20 p-2 text-amber-200" onClick={() => void act(user.is_active ? "确认停用该账号？现有登录将在下一次鉴权时失效。" : "确认重新启用该账号？", () => onStatusChange(user.id, !user.is_active))}>{user.is_active ? <UserRoundX className="size-4" /> : <UserRoundCheck className="size-4" />}</button>
              </div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
