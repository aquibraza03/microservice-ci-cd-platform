"use client";

import { useI18n } from "@saas/intl";
import { AlertsPanel, SystemHealthPanel, type DashboardQueryDeps } from "@saas/features/dashboard";
import { PageHeader } from "@saas/ui";
import { getAppComposition } from "@/lib/composition";

/**
 * Monitoring page (OBSERVABILITY group). Reuses the dashboard's system health
 * and alerts widgets — no duplicate implementations.
 */
export function ObservabilityView() {
  const { t } = useI18n();
  const { dashboard } = getAppComposition();
  const deps: DashboardQueryDeps = { source: dashboard };
  const refresh = () => undefined;

  return (
    <div className="space-y-6">
      <PageHeader title={t("observability.title")} description={t("observability.description")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SystemHealthPanel deps={deps} onRetry={refresh} />
        <AlertsPanel deps={deps} limit={8} onRetry={refresh} />
      </div>
    </div>
  );
}
