"use client";
import { History } from "lucide-react";
import { useI18n } from "@saas/intl";
import { Avatar, AvatarFallback, EmptyState, StatusBadge } from "@saas/ui";
import { useActivity, type DashboardQueryDeps } from "../api";
import { activityTypeMeta } from "../status-meta";
import { LoadingRows, WidgetCard, WidgetError } from "./shared";

function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.split(/[.\s_]/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts[1]?.charAt(0) ?? "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Recent activity feed. Each row pairs the activity type label with a text
 * timestamp; colour never carries meaning on its own.
 */
export function RecentActivity({
  deps,
  limit = 8,
  onRetry
}: {
  deps: DashboardQueryDeps;
  limit?: number;
  onRetry?: () => void;
}) {
  const { t, formatRelativeTime } = useI18n();
  const query = useActivity(limit, deps);

  return (
    <WidgetCard title={t("dashboard.sections.recentActivity")}>
      {query.isPending ? (
        <LoadingRows rows={limit} />
      ) : query.isError ? (
        <WidgetError section={t("dashboard.sections.recentActivity")} onRetry={onRetry} />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={<History aria-hidden="true" />} title={t("dashboard.noActivity")} />
      ) : (
        <ul className="space-y-3">
          {query.data.items.map((item) => {
            const meta = activityTypeMeta[item.type];
            return (
              <li key={item.id} className="flex items-start gap-3">
                <Avatar className="mt-0.5 size-8">
                  <AvatarFallback>{initials(item.actor)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <StatusBadge tone={meta.tone} className="mr-1.5">
                      {t(meta.labelKey)}
                    </StatusBadge>
                    <span className="font-medium">{item.title}</span>
                  </p>
                  {item.description ? (
                    <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatRelativeTime(item.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
