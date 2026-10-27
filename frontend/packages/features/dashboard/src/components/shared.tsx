"use client";
import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@saas/intl";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton
} from "@saas/ui";
import { cn } from "@saas/utils";

/** Consistent dashboard widget card shell (title + description + action). */
export function WidgetCard({
  title,
  description,
  action,
  children,
  className
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Skeleton loading rows used by widgets while their query is pending. */
export function LoadingRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" role="status">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-4 w-full" />
      ))}
    </div>
  );
}

/** Honest error state for a widget with an optional retry action. */
export function WidgetError({ section, onRetry }: { section?: string; onRetry?: () => void }) {
  const { t } = useI18n();
  const title = section ? t("dashboard.error.loading", { section }) : t("common.unavailable");
  return (
    <Alert variant="destructive" title={title}>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          {t("dashboard.retry")}
        </Button>
      ) : null}
    </Alert>
  );
}
