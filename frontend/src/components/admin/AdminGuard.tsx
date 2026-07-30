"use client";

import React from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import { admin } from "@/lib/api-client";

type AccessState = "checking" | "granted" | "denied";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, user } = useAuth();
  const router = useRouter();
  const [access, setAccess] = React.useState<AccessState>("checking");

  React.useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!user?.isAdmin) {
      setAccess("denied");
      return;
    }

    let active = true;
    admin.session().then(
      () => active && setAccess("granted"),
      () => active && setAccess("denied"),
    );
    return () => {
      active = false;
    };
  }, [isAuthenticated, loading, router, user?.isAdmin]);

  if (loading || access === "checking") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 grid place-items-center">
        <p className="font-mono text-sm tracking-wide">正在校验管理权限…</p>
      </div>
    );
  }
  if (!isAuthenticated) return null;
  if (access === "denied") {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center px-6">
        <section className="max-w-md border border-amber-400/30 bg-slate-900 p-8">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-amber-300">Access 403</p>
          <h1 className="mt-3 text-2xl font-semibold">无法访问管理区域</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">当前账号没有管理员权限，或账号已被停用。</p>
        </section>
      </main>
    );
  }
  return <>{children}</>;
}
