"use client";
import { useI18n, type AppFormatters } from "@saas/intl";
import type { DashboardTimeRange } from "@saas/types";
import { MetricCard } from "@saas/ui";
import { useDashboardMetrics, type DashboardQueryDeps } from "../api";
import { metricLabelKeys } from "../status-meta";
import { WidgetError } from "./shared";

export type MetricGridProps = {
  range: DashboardTimeRange;
  deps: DashboardQueryDeps;
  /** Metric ids to display, in order (dashboard customization). */
  visibleIds: string[];
  onRetry?: () => void;
};

function formatMetricValue(
  metric: { value: number; unit: "number" | "percent" | "ms" },
  formatters: Pick<AppFormatters, "formatDuration" | "formatNumber">
): string {
  if (metric.unit === "percent") return `${metric.value.toFixed(1)}%`;
  if (metric.unit === "ms") return formatters.formatDuration(metric.value);
  return formatters.formatNumber(metric.value);
}

function deltaOf(metric: { value: number; previousValue?: number | null }): number | null {
  if (metric.previousValue === null || metric.previousValue === undefined) return null;
  if (metric.previousValue === 0) return null;
  return ((metric.value - metric.previousValue) / Math.abs(metric.previousValue)) * 100;
}

/**
 * KPI grid. Each metric renders loading/error/empty states explicitly; values
 * come from the data source and are never hardcoded. The "open alerts" metric
 * inverts trend colouring so an increase reads as a regression.
 */
export function MetricGrid({ range, deps, visibleIds, onRetry }: MetricGridProps) {
  const { t, formatDuration, formatNumber } = useI18n();
  const query = useDashboardMetrics(range, deps);

  if (query.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
        {visibleIds.map((id) => (
          <MetricCard key={id} label={t(metricLabelKeys[id] ?? "common.unavailable")} loading />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return <WidgetError section={t("dashboard.title")} onRetry={onRetry} />;
  }

  const metrics = query.data.metrics.filter((metric) => visibleIds.includes(metric.id));
  if (metrics.length === 0) {
    return <WidgetError section={t("dashboard.title")} onRetry={onRetry} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const labelKey = metricLabelKeys[metric.id];
        return (
          <MetricCard
            key={metric.id}
            label={labelKey ? t(labelKey) : metric.id}
            value={formatMetricValue(metric, { formatDuration, formatNumber })}
            helper={t("dashboard.metrics.vsPrevious")}
            delta={deltaOf(metric)}
            deltaFormatter={(d) => `${d > 0 ? "+" : ""}${d.toFixed(1)}%`}
            sparkline={metric.sparkline}
            sparklineLabel={labelKey ? t(labelKey) : metric.id}
            trendInvert={metric.id === "openAlerts"}
          />
        );
      })}
    </div>
  );
}
