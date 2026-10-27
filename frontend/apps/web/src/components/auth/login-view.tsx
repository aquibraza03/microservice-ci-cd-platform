"use client";

import { LoginForm } from "@saas/features/auth";
import { ThemeToggle } from "@saas/features/theme";
import { useI18n } from "@saas/intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@saas/ui";
import { getAppComposition } from "@/lib/composition";

/**
 * Client login screen.
 * Composition is resolved client-side so the (non-serializable) auth service
 * never crosses a Server→Client boundary.
 */
export function LoginView() {
  const { config } = getAppComposition();
  const { t } = useI18n();

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <ThemeToggle className="absolute right-4 top-4" />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("login.title", { name: config.name })}</CardTitle>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
