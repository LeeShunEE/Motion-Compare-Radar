/**
 * OAuth 回调页面。
 *
 * 处理 OAuth provider（Google/GitHub）的回调，
 * 提取 code/state 参数，调用后端完成登录，
 * 根据是否新用户跳转到欢迎页面或主页。
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getAuthState, handleOAuthCallback } from "@/lib/auth-store";
import { Card } from "@/components/ui/card";

export default function OAuthCallbackPage() {
  const t = useTranslations("auth.callback");
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const processedRef = useRef(false);

  useEffect(() => {
    const processCallback = async () => {
      if (processedRef.current) {
        return;
      }

      const provider = typeof params.provider === "string" ? params.provider : "";
      const code = searchParams.get("code");
      const state = searchParams.get("state");

      if (!provider || !code || !state) {
        setError(t("missingParams"));
        setLoading(false);
        return;
      }

      processedRef.current = true;

      try {
        await handleOAuthCallback(provider, code, state);
        // 统一基于 username 判断 onboarding 是否完成（不依赖 is_new_user：
        // 中断的 OAuth 用户重登时 is_new_user=False 但 username 仍空）
        const username = getAuthState().user?.username;
        router.push(username ? "/app" : "/welcome");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("failed");
        setError(message);
        setLoading(false);
      }
    };

    processCallback();
  }, [params, router, searchParams, t]);

  return (
    <Card className="p-6 space-y-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {loading && (
          <p className="text-sm text-muted-foreground mt-4">
            {t("processing")}
          </p>
        )}
        {error && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={() => router.push("/login")}
              className="text-sm text-primary hover:underline"
            >
              {t("backToLogin")}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}