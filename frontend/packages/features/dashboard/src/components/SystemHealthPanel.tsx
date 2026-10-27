"use client";
import { Activity } from "lucide-react";
import { useI18n } from "@saas/intl";
import { EmptyState, StatusBadge } from "@saas/ui";
import { useSystemHealth, type DashboardQueryDeps } from "../api";
import { serviceStatusMeta, systemHealthStatusMeta } from "../status-meta";
import { LoadingRows, WidgetCard, WidgetError } from "./shared";

/**
 * System health panel. The overall status badge is always accompanied by the
 * status label; per-service rows pair a status dot/badge with text.
 */
export function SystemHealthPanel({
  deps,
  onRetry
}: {
  deps: DashboardQueryDeps;
  onRetry?: () => void;
}) {
  const { t, formatDuration } = useI18n();
  const query = useSystemHealth(deps);

  return (
    <WidgetCard title={t("dashboard.sections.systemHealth")}>
      {query.isPending ? (
        <LoadingRows rows={5} />
      ) : query.isError ? (
        <WidgetError section={t("dashboard.sections.systemHealth")} onRetry={onRetry} />
      ) : query.data.services.length === 0 ? (
        <EmptyState icon={<Activity aria-hidden="true" />} title={t("dashboard.noServices")} />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <StatusBadge tone={systemHealthStatusMeta[query.data.status].tone}>
              {t(systemHealthStatusMeta[query.data.status].labelKey)}
            </StatusBadge>
            {query.data.incidentCount > 0 ? (
              <span className="text-xs text-muted-foreground">
                {t("dashboard.activeIncidents", { count: query.data.incidentCount })}
              </span>
            ) : null}
          </div>
          <ul className="space-y-1">
            {query.data.services.map((service) => {
              const meta = serviceStatusMeta[service.status];
              return (
                <li
                  key={service.name}
                  className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0"
                >
                  <span className="min-w-0 truncate font-medium">{service.name}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    {service.latencyMs !== null && service.latencyMs !== undefined ? (
                      <span className="hidden tabular-nums text-muted-foreground sm:inline">
                        {formatDuration(service.latencyMs)}
                      </span>
                    ) : null}
                    <StatusBadge tone={meta.tone}>{t(meta.labelKey)}</StatusBadge>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </WidgetCard>
  );
}
