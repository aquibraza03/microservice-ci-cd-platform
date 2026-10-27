"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Settings2, TriangleAlert } from "lucide-react";
import { useI18n } from "@saas/intl";
import { useLocalStorage } from "@saas/hooks";
import type { DashboardTimeRange } from "@saas/types";
import {
  AlertsPanel,
  DASHBOARD_TIME_RANGES,
  dashboardKeys,
  dashboardRangeLabelKey,
  metricLabelKeys,
  MetricGrid,
  PipelineStatusSummary,
  ProjectsOverview,
  RecentActivity,
  RecentDeployments,
  RecentPipelineRuns,
  SecuritySummaryPanel,
  SystemHealthPanel,
  type DashboardQueryDeps
} from "@saas/features/dashboard";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  PageHeader
} from "@saas/ui";
import { cn } from "@saas/utils";
import { getAppComposition } from "@/lib/composition";

const DEFAULT_VISIBLE_METRICS = ["pipelineRuns", "deployments", "successRate", "openAlerts"];

function TimeRangeSelector({
  value,
  onChange
}: {
  value: DashboardTimeRange;
  onChange: (range: DashboardTimeRange) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="flex items-center rounded-md border p-0.5"
      role="group"
      aria-label={t("dashboard.timeRange")}
    >
      {DASHBOARD_TIME_RANGES.map((range) => (
        <Button
          key={range}
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2.5 text-xs",
            value === range && "bg-accent text-accent-foreground"
          )}
          onClick={() => onChange(range)}
          aria-pressed={value === range}
        >
          {t(dashboardRangeLabelKey[range])}
        </Button>
      ))}
    </div>
  );
}

function CustomizeDialog({
  visibleIds,
  onChange
}: {
  visibleIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const metricIds = Object.keys(metricLabelKeys);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings2 aria-hidden="true" />
        {t("dashboard.customize")}
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("dashboard.customize.title")}</DialogTitle>
          <DialogDescription>{t("dashboard.customize.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          {metricIds.map((id) => (
            <div key={id} className="flex items-center gap-2.5">
              <Checkbox
                id={`metric-${id}`}
                checked={visibleIds.includes(id)}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange(visibleIds.includes(id) ? visibleIds : [...visibleIds, id]);
                  } else {
                    onChange(visibleIds.filter((existing) => existing !== id));
                  }
                }}
              />
              <Label htmlFor={`metric-${id}`} className="text-sm font-normal">
                {t(metricLabelKeys[id] ?? "common.unavailable")}
              </Label>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("dashboard.customize.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DashboardContent() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { dashboard } = getAppComposition();
  const deps: DashboardQueryDeps = { source: dashboard };

  const [range, setRange] = useState<DashboardTimeRange>("7d");
  const [visibleMetrics, setVisibleMetrics] = useLocalStorage<string[]>(
    "dashboard.visible-metrics",
    DEFAULT_VISIBLE_METRICS
  );
  const effectiveIds =
    visibleMetrics.length > 0
      ? visibleMetrics.filter((id) => id in metricLabelKeys)
      : DEFAULT_VISIBLE_METRICS;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <>
            <TimeRangeSelector value={range} onChange={setRange} />
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw aria-hidden="true" />
              {t("dashboard.refresh")}
            </Button>
            <CustomizeDialog visibleIds={effectiveIds} onChange={setVisibleMetrics} />
          </>
        }
      />

      {dashboard.isSample ? (
        <Badge variant="info" className="gap-1.5">
          <TriangleAlert className="size-3.5" aria-hidden="true" />
          {t("dashboard.sampleData")}
        </Badge>
      ) : null}

      <MetricGrid range={range} deps={deps} visibleIds={effectiveIds} onRetry={refresh} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <RecentPipelineRuns deps={deps} onRetry={refresh} />
          <SystemHealthPanel deps={deps} onRetry={refresh} />
        </div>
        <div className="space-y-4">
          <PipelineStatusSummary deps={deps} onRetry={refresh} />
          <RecentDeployments deps={deps} onRetry={refresh} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AlertsPanel deps={deps} onRetry={refresh} />
        <SecuritySummaryPanel deps={deps} onRetry={refresh} />
        <RecentActivity deps={deps} onRetry={refresh} />
      </div>

      <ProjectsOverview deps={deps} onRetry={refresh} />
    </div>
  );
}

/** Dashboard page. Renders honest loading/empty/error states for every widget. */
export function DashboardView() {
  return <DashboardContent />;
}
