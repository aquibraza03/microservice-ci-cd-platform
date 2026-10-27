"use client";
import { useI18n } from "@saas/intl";
import type { PipelineStatus } from "@saas/types";
import { Donut, StatusBadge } from "@saas/ui";
import { usePipelineRuns, type DashboardQueryDeps } from "../api";
import { pipelineStatusMeta } from "../status-meta";
import { LoadingRows, WidgetCard, WidgetError } from "./shared";

const ALL_STATUSES: PipelineStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "skipped"
];

/**
 * Pipeline status distribution. Computed from the fetched pipeline runs so the
 * widget never invents numbers; the donut is described by an accessible label
 * and a text legend accompanies it (never colour alone).
 */
export function PipelineStatusSummary({
  deps,
  onRetry
}: {
  deps: DashboardQueryDeps;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const query = usePipelineRuns({ limit: 100 }, deps);

  if (query.isPending) {
    return (
      <WidgetCard title={t("dashboard.sections.pipelineStatus")}>
        <LoadingRows rows={6} />
      </WidgetCard>
    );
  }

  if (query.isError) {
    return (
      <WidgetCard title={t("dashboard.sections.pipelineStatus")}>
        <WidgetError section={t("dashboard.sections.pipelineStatus")} onRetry={onRetry} />
      </WidgetCard>
    );
  }

  const counts = Object.fromEntries(ALL_STATUSES.map((status) => [status, 0])) as Record<
    PipelineStatus,
    number
  >;
  for (const run of query.data.items) {
    counts[run.status] = (counts[run.status] ?? 0) + 1;
  }
  const total = query.data.items.length;

  const segments = ALL_STATUSES.filter((status) => counts[status] > 0).map((status) => ({
    value: counts[status],
    label: t(pipelineStatusMeta[status].labelKey),
    tone: pipelineStatusMeta[status].tone
  }));

  const summary = segments.map((s) => `${s.label} ${s.value}`).join(", ");

  return (
    <WidgetCard title={t("dashboard.sections.pipelineStatus")}>
      {total === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">{t("dashboard.noRuns")}</p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <Donut
            segments={segments}
            label={summary}
            centerValue={total}
            centerLabel={t("dashboard.sections.pipelineStatus")}
            size={120}
          />
          <ul className="w-full min-w-0 space-y-1.5">
            {ALL_STATUSES.filter((status) => counts[status] > 0).map((status) => (
              <li key={status} className="flex items-center justify-between gap-3 text-sm">
                <StatusBadge tone={pipelineStatusMeta[status].tone}>
                  {t(pipelineStatusMeta[status].labelKey)}
                </StatusBadge>
                <span className="tabular-nums text-muted-foreground">{counts[status]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </WidgetCard>
  );
}
