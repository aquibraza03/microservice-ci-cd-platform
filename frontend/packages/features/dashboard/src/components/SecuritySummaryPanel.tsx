"use client";
import { ShieldAlert } from "lucide-react";
import { useI18n, type MessageKey } from "@saas/intl";
import { EmptyState, Progress, StatusBadge } from "@saas/ui";
import type { RiskLevel } from "@saas/types";
import { useSecuritySummary, type DashboardQueryDeps } from "../api";
import { LoadingRows, WidgetCard, WidgetError } from "./shared";

const RISK_TONE: Record<RiskLevel, "success" | "warning" | "destructive" | "info" | "neutral"> = {
  low: "success",
  medium: "warning",
  high: "destructive",
  critical: "destructive",
  unknown: "neutral"
};

const RISK_LABEL: Record<RiskLevel, MessageKey> = {
  low: "dashboard.riskLevel.low",
  medium: "dashboard.riskLevel.medium",
  high: "dashboard.riskLevel.high",
  critical: "dashboard.riskLevel.critical",
  unknown: "dashboard.riskLevel.unknown"
};

/**
 * Security posture summary. Counts are rendered as text (never colour alone)
 * and the resolved ratio is communicated both visually and via the progress
 * bar's accessible value.
 */
export function SecuritySummaryPanel({
  deps,
  onRetry
}: {
  deps: DashboardQueryDeps;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const query = useSecuritySummary(deps);

  if (query.isPending) {
    return (
      <WidgetCard title={t("dashboard.sections.securitySummary")}>
        <LoadingRows rows={4} />
      </WidgetCard>
    );
  }

  if (query.isError) {
    return (
      <WidgetCard title={t("dashboard.sections.securitySummary")}>
        <WidgetError section={t("dashboard.sections.securitySummary")} onRetry={onRetry} />
      </WidgetCard>
    );
  }

  const summary = query.data;
  const total = summary.vulnerabilities.total;
  const resolvedRatio = total > 0 ? summary.vulnerabilities.resolved / total : 0;

  return (
    <WidgetCard title={t("dashboard.sections.securitySummary")}>
      {total === 0 ? (
        <EmptyState
          icon={<ShieldAlert aria-hidden="true" />}
          title={t("dashboard.noVulnerabilities")}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{t("status.alert.critical")}</span>
            <StatusBadge tone={RISK_TONE[summary.riskLevel ?? "unknown"]}>
              {t(RISK_LABEL[summary.riskLevel ?? "unknown"])}
            </StatusBadge>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">{t("status.alert.critical")}</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {summary.vulnerabilities.critical}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("status.alert.high")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{summary.vulnerabilities.high}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("status.alert.medium")}</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {summary.vulnerabilities.medium}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("status.alert.low")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{summary.vulnerabilities.low}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("status.alert.resolved")}</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {summary.vulnerabilities.resolved}
              </dd>
            </div>
          </dl>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t("status.alert.resolved")}</span>
              <span className="tabular-nums">{Math.round(resolvedRatio * 100)}%</span>
            </div>
            <Progress
              value={resolvedRatio * 100}
              max={100}
              aria-label={t("dashboard.resolvedPercent", {
                percent: Math.round(resolvedRatio * 100)
              })}
            />
          </div>
        </div>
      )}
    </WidgetCard>
  );
}
