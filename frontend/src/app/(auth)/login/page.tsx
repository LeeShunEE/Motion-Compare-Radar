/**
 * 登录页面。
 */
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthState } from "@/lib/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

export default function LoginPage() {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const { login, loading, error, user } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!loading && user) {
      router.replace(user.username ? "/app" : "/welcome");
    }
  }, [loading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    try {
      await login(identifier, password);
      // 统一基于 username 判断：未完成 onboarding（username 空）→ /welcome
      const username = getAuthState().user?.username;
      router.push(username ? "/app" : "/welcome");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("failed");
      setLocalError(message);
    }
  };

  const displayError = localError ?? error;

  return (
    <Card className="p-6 space-y-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="identifier">{t("identifierLabel")}</Label>
          <Input
            id="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={t("identifierPlaceholder")}
            required
            autoComplete="username"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t("passwordLabel")}</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("passwordPlaceholder")}
            required
            autoComplete="current-password"
          />
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-xs text-primary hover:underline"
            >
              {t("forgotPassword")}
            </Link>
          </div>
        </div>

        {displayError && (
          <p className="text-sm text-red-500">{displayError}</p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t("submitting") : t("submit")}
        </Button>
      </form>

      <OAuthButtons />

      <div className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link href="/register" className="text-primary hover:underline">
          {t("registerLink")}
        </Link>
      </div>
    </Card>
  );
}