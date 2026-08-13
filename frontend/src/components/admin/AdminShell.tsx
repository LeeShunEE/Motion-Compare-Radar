"use client";

import {
  Activity,
  AudioLines,
  Gauge,
  LayoutDashboard,
  RadioTower,
  Users,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useAdminBasePath } from "@/hooks/admin/useAdminBasePath";
import { adminHref } from "@/lib/admin-path";

const sections = [
  { href: "", label: "系统总览", icon: LayoutDashboard },
  { href: "assets", label: "公共资源", icon: AudioLines },
  { href: "users", label: "用户与权限", icon: Users },
  { href: "activity", label: "使用记录", icon: Activity },
  { href: "render", label: "渲染任务", icon: RadioTower },
  { href: "system", label: "系统状态", icon: Gauge },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const basePath = useAdminBasePath();

  return (
    <div className="min-h-screen bg-[#08111f] text-slate-100 lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="border-b border-cyan-200/10 bg-[#0b1728] lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="border-b border-cyan-200/10 px-5 py-5">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.32em] text-cyan-300">Radar operations</p>
          <p className="mt-2 text-lg font-semibold tracking-tight">控制台</p>
          <p className="mt-1 truncate text-xs text-slate-500">{user?.email}</p>
        </div>
        <nav aria-label="管理控制台" className="grid grid-cols-2 gap-1 p-3 sm:grid-cols-3 lg:grid-cols-1">
          {sections.map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href={adminHref(basePath, href)}
              className="flex min-h-11 items-center gap-3 border border-transparent px-3 py-2 text-sm text-slate-300 transition-colors hover:border-cyan-300/20 hover:bg-cyan-300/5 hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              <Icon aria-hidden="true" className="size-4 text-cyan-400" />
              {label}
            </a>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
