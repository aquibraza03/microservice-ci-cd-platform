"use client";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { useI18n } from "@saas/intl";
import { Badge, Button, EmptyState, StatusBadge } from "@saas/ui";
import { useDeployments, type DashboardQueryDeps } from "../api";
import { deploymentStatusMeta, environmentKindMeta } from "../status-meta";
import { LoadingRows, WidgetCard, WidgetError } from "./shared";

/**
 * Recent deployments across environments. Honest loading/error/empty states —
 * rows come from the data source, never fabricated.
 */
export function RecentDeployments({
  deps,
  limit = 6,
  onRetry
}: {
  deps: DashboardQueryDeps;
  limit?: number;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const query = useDeployments(limit, deps);

  return (
    <WidgetCard
      title={t("dashboard.sections.recentDeployments")}
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href="/deployments">{t("dashboard.viewAll")}</Link>
        </Button>
      }
    >
      {query.isPending ? (
        <LoadingRows rows={limit} />
      ) : query.isError ? (
        <WidgetError section={t("dashboard.sections.recentDeployments")} onRetry={onRetry} />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={<Rocket aria-hidden="true" />} title={t("dashboard.noDeployments")} />
      ) : (
        <ul className="space-y-1">
          {query.data.items.map((deployment) => {
            const meta = deploymentStatusMeta[deployment.status];
            const envMeta = environmentKindMeta[deployment.environment.kind];
            return (
              <li
                key={deployment.id}
                className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{deployment.projectName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {deployment.version} · {t(envMeta.labelKey)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary" className="hidden sm:inline-flex">
                    {t(envMeta.labelKey)}
                  </Badge>
                  <StatusBadge tone={meta.tone}>{t(meta.labelKey)}</StatusBadge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
