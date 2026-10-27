"use client";
import { AlertTriangle, ArrowDown, ArrowUp, Minus, PackageOpen } from "lucide-react";
import { cn } from "@saas/utils";
import { Card, CardContent } from "./Card";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import { Sparkline } from "./Sparkline";

export type MetricCardProps = {
  /** Localized metric label (e.g. "Pipeline runs"). */
  label: string;
  /** Pre-formatted primary value; when null an empty state is rendered. */
  value?: string | number | null;
  /** Optional caption under the value (e.g. "vs previous 24h"). */
  helper?: string | null;
  /** Signed change vs the previous period (e.g. 12.5). */
  delta?: number | null;
  /** Format the delta (e.g. "+12.5%"). */
  deltaFormatter?: (delta: number) => string;
  /** Sampled series for the sparkline. */
  sparkline?: number[];
  /** Accessible description of the sparkline. */
  sparklineLabel?: string;
  /** When true a rising value is "bad" (e.g. alerts, incidents). */
  trendInvert?: boolean;
  loading?: boolean;
  error?: boolean;
  errorText?: string;
  empty?: boolean;
  emptyText?: string;
  className?: string;
};

/**
 * Reusable KPI card. Handles loading (skeleton), error, and empty states
 * explicitly — values are never fabricated. The trend chip pairs an arrow with
 * a percentage so meaning is never conveyed by colour alone.
 */
export function MetricCard({
  label,
  value,
  helper,
  delta,
  deltaFormatter,
  sparkline = [],
  sparklineLabel,
  trendInvert = false,
  loading = false,
  error = false,
  errorText,
  empty = false,
  emptyText,
  className
}: MetricCardProps) {
  if (loading) {
    return (
      <Card className={cn(className)} aria-busy="true">
        <CardContent className="space-y-3 pt-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn(className)}>
        <CardContent className="pt-6">
          <EmptyState
            icon={<AlertTriangle aria-hidden="true" />}
            title={label}
            description={errorText ?? "Unavailable"}
          />
        </CardContent>
      </Card>
    );
  }

  if (empty || value === null || value === undefined) {
    return (
      <Card className={cn(className)}>
        <CardContent className="pt-6">
          <EmptyState
            icon={<PackageOpen aria-hidden="true" />}
            title={label}
            description={emptyText}
          />
        </CardContent>
      </Card>
    );
  }

  const trend =
    delta === null || delta === undefined || delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  const positiveIsGood = !trendInvert;
  const tone =
    trend === "flat" ? "neutral" : delta! > 0 === positiveIsGood ? "success" : "destructive";

  const TrendIcon = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : Minus;

  return (
    <Card className={cn(className)}>
      <CardContent className="space-y-2 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          </div>
          {sparkline.length > 0 ? (
            <Sparkline
              data={sparkline}
              label={sparklineLabel ?? label}
              width={72}
              height={32}
              className={cn(
                trend === "up" && !trendInvert ? "text-success" : "",
                trend === "down" && trendInvert ? "text-success" : "",
                trend === "down" && !trendInvert ? "text-destructive" : "",
                trend === "up" && trendInvert ? "text-destructive" : "",
                trend === "flat" ? "text-muted-foreground" : ""
              )}
            />
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {delta !== null && delta !== undefined ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                tone === "success" && "bg-success/15 text-success",
                tone === "destructive" && "bg-destructive/15 text-destructive",
                tone === "neutral" && "bg-muted text-muted-foreground"
              )}
            >
              <TrendIcon className="size-3" aria-hidden="true" />
              {deltaFormatter
                ? deltaFormatter(delta)
                : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
            </span>
          ) : null}
          {helper ? <span className="text-xs text-muted-foreground">{helper}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
