"use client";
import Link from "next/link";
import { GitBranch } from "lucide-react";
import { useI18n } from "@saas/intl";
import { Button, EmptyState, StatusBadge } from "@saas/ui";
import { usePipelineRuns, type DashboardQueryDeps } from "../api";
import { pipelineStatusMeta } from "../status-meta";
import { LoadingRows, WidgetCard, WidgetError } from "./shared";

/**
 * Recent pipeline runs. Honest states: loading skeleton, error with retry, and
 * an empty state — never fabricated rows.
 */
export function RecentPipelineRuns({
  deps,
  limit = 6,
  onRetry
}: {
  deps: DashboardQueryDeps;
  limit?: number;
  onRetry?: () => void;
}) {
  const { t, formatDuration } = useI18n();
  const query = usePipelineRuns({ limit }, deps);

  return (
    <WidgetCard
      title={t("dashboard.sections.recentRuns")}
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href="/pipeline-runs">{t("dashboard.viewAll")}</Link>
        </Button>
      }
    >
      {query.isPending ? (
        <LoadingRows rows={limit} />
      ) : query.isError ? (
        <WidgetError section={t("dashboard.sections.recentRuns")} onRetry={onRetry} />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={<GitBranch aria-hidden="true" />} title={t("dashboard.noRuns")} />
      ) : (
        <ul className="space-y-1">
          {query.data.items.map((run) => {
            const meta = pipelineStatusMeta[run.status];
            return (
              <li
                key={run.id}
                className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{run.pipelineName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {run.projectName} · {run.branch} · {run.commit.slice(0, 7)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {run.durationMs !== null && run.durationMs !== undefined ? (
                    <span className="hidden tabular-nums text-muted-foreground sm:inline">
                      {formatDuration(run.durationMs)}
                    </span>
                  ) : null}
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
