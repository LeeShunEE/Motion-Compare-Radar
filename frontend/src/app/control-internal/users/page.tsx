"use client";

import React from "react";

import { UserTable } from "@/components/admin/users/UserTable";
import { useAdminUsers } from "@/hooks/admin/useAdminUsers";

export default function AdminUsersPage() {
  const users = useAdminUsers();
  const [search, setSearch] = React.useState("");
  return (
    <div className="space-y-6">
      <header><p className="font-mono text-xs uppercase tracking-[0.25em] text-cyan-300">Identity control</p><h1 className="mt-2 text-2xl font-semibold">用户与权限</h1><p className="mt-2 text-sm text-slate-400">搜索账号、调整管理员角色并控制账号启停。</p></header>
      <form className="flex flex-wrap gap-3 border border-cyan-100/10 bg-[#0d1b2e] p-4" onSubmit={(event) => { event.preventDefault(); users.setFilters((current) => ({ ...current, search, page: 1 })); }}>
        <input aria-label="搜索用户" className="min-w-60 flex-1 border border-cyan-100/15 bg-[#08111f] px-3 py-2 text-sm outline-none focus:border-cyan-300" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="邮箱或用户名" />
        <select aria-label="账号状态" className="border border-cyan-100/15 bg-[#08111f] px-3 py-2 text-sm" onChange={(event) => users.setFilters((current) => ({ ...current, isActive: event.target.value === "" ? undefined : event.target.value === "active", page: 1 }))}><option value="">全部状态</option><option value="active">启用</option><option value="disabled">停用</option></select>
        <select aria-label="用户角色" className="border border-cyan-100/15 bg-[#08111f] px-3 py-2 text-sm" onChange={(event) => users.setFilters((current) => ({ ...current, isAdmin: event.target.value === "" ? undefined : event.target.value === "admin", page: 1 }))}><option value="">全部角色</option><option value="admin">管理员</option><option value="user">用户</option></select>
        <button className="border border-cyan-300/30 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10" type="submit">查询</button>
      </form>
      {users.error && <p role="alert" className="text-sm text-red-200">{users.error}</p>}
      <p className="font-mono text-xs text-slate-500">匹配 {users.data.total} 个账号</p>
      <UserTable users={users.data.items} loading={users.loading} onRoleChange={users.setRole} onStatusChange={users.setStatus} />
    </div>
  );
}
