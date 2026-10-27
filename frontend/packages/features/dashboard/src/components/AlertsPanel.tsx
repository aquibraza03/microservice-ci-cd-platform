"use client";
import { BellRing } from "lucide-react";
import { useI18n } from "@saas/intl";
import { EmptyState, StatusBadge } from "@saas/ui";
import { useAlerts, type DashboardQueryDeps } from "../api";
import { alertSeverityMeta } from "../status-meta";
import { LoadingRows, WidgetCard, WidgetError } from "./shared";

/**
 * Active alerts panel. Severity is conveyed by an accessible label plus the
 * status badge — never colour alone.
 */
export function AlertsPanel({
  deps,
  limit = 5,
  onRetry
}: {
  deps: DashboardQueryDeps;
  limit?: number;
  onRetry?: () => void;
}) {
  const { t, formatRelativeTime } = useI18n();
  const query = useAlerts(limit, deps);

  return (
    <WidgetCard title={t("dashboard.sections.alerts")}>
      {query.isPending ? (
        <LoadingRows rows={limit} />
      ) : query.isError ? (
        <WidgetError section={t("dashboard.sections.alerts")} onRetry={onRetry} />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={<BellRing aria-hidden="true" />} title={t("dashboard.noAlerts")} />
      ) : (
        <ul className="space-y-1">
          {query.data.items.map((alert) => {
            const meta = alertSeverityMeta[alert.severity];
            return (
              <li
                key={alert.id}
                className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{alert.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {alert.source} · {formatRelativeTime(alert.createdAt)}
                  </p>
                </div>
                <StatusBadge tone={meta.tone} className="shrink-0">
                  {t(meta.labelKey)}
                </StatusBadge>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
