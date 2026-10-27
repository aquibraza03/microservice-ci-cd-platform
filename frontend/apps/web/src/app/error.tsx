"use client";

import { useEffect } from "react";
import { Button } from "@saas/ui";
import { useI18n } from "@saas/intl";
import { getTelemetry } from "@saas/observability";

/**
 * Root error boundary (App Router).
 * Captures the error through the telemetry extension point (no-op provider by
 * default) and offers recovery actions to the user.
 */
export default function RootError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    getTelemetry().captureException(error, { digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t("error.title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("error.description")}</p>
      <div className="flex gap-3">
        <Button onClick={() => reset()}>{t("error.reset")}</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t("error.reload")}
        </Button>
      </div>
    </div>
  );
}
