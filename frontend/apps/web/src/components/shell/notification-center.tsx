"use client";

import Link from "next/link";
import { Bell, Check, RefreshCw } from "lucide-react";
import { ApiErrorCode, type Notification } from "@saas/types";
import { isApiError } from "@saas/services";
import {
  useNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead
} from "@saas/features/platform";
import { useI18n } from "@saas/intl";
import { useOnlineStatus } from "@saas/hooks";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Skeleton
} from "@saas/ui";
import { getAppComposition } from "@/lib/composition";

const severityVariant = {
  critical: "destructive",
  high: "destructive",
  medium: "warning",
  low: "secondary",
  info: "info"
} as const;

function NotificationRow({
  notification,
  canMarkRead,
  onMarkRead
}: {
  notification: Notification;
  canMarkRead: boolean;
  onMarkRead: (id: string) => void;
}) {
  const { t, formatRelativeTime } = useI18n();
  const unread = notification.readAt === null || notification.readAt === undefined;
  return (
    <div className={`flex gap-3 border-b px-3 py-3 last:border-0 ${unread ? "bg-accent/40" : ""}`}>
      <Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium">{notification.title}</p>
          <Badge variant={severityVariant[notification.severity]}>{notification.severity}</Badge>
        </div>
        {notification.description ? (
          <p className="text-xs text-muted-foreground">{notification.description}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{formatRelativeTime(notification.createdAt)}</span>
          {notification.resourceHref ? (
            <Link
              className="font-medium text-foreground underline-offset-2 hover:underline"
              href={notification.resourceHref}
            >
              {t("common.viewAll")}
            </Link>
          ) : null}
          {unread ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              disabled={!canMarkRead}
              onClick={() => onMarkRead(notification.id)}
            >
              <Check aria-hidden="true" />
              {t("shell.notifications.markRead")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function NotificationCenter() {
  const { t } = useI18n();
  const online = useOnlineStatus();
  const { config, notifications } = getAppComposition();
  const query = useNotifications(
    { page: 0, pageSize: 8 },
    { search: getAppComposition().search, notifications }
  );
  const markRead = useMarkNotificationRead({ search: getAppComposition().search, notifications });
  const markAll = useMarkAllNotificationsRead({
    search: getAppComposition().search,
    notifications
  });
  const items = query.data?.items ?? [];
  const unreadCount = items.filter((item) => !item.readAt).length;
  const unavailable = isApiError(query.error) && query.error.code === ApiErrorCode.UNAVAILABLE;
  const canMarkRead = Boolean(config.notifications.read);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("shell.notifications")}
          className="relative"
        >
          <Bell aria-hidden="true" />
          {unreadCount > 0 ? (
            <span
              className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground"
              aria-label={`${unreadCount} ${t("shell.notifications.unread")}`}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0">{t("shell.notifications")}</DropdownMenuLabel>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            disabled={!config.notifications.readAll || unreadCount === 0}
            onClick={() => markAll.mutate()}
          >
            {t("shell.notifications.markAllRead")}
          </Button>
        </div>
        <DropdownMenuSeparator className="m-0" />
        {query.isPending ? (
          <div className="space-y-3 p-4" aria-busy="true" role="status">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : null}
        {query.isError ? (
          <div className="p-3">
            {!online ? (
              <EmptyState
                title={t("shell.notifications.offline")}
                description={t("shell.notifications.unavailableHint")}
                className="py-6"
              />
            ) : unavailable ? (
              <EmptyState
                title={t("shell.notifications.unavailable")}
                description={t("shell.notifications.unavailableHint")}
                className="py-6"
              />
            ) : (
              <EmptyState
                title={t("shell.notifications.error")}
                action={
                  <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                    <RefreshCw aria-hidden="true" />
                    {t("common.retry")}
                  </Button>
                }
                className="py-6"
              />
            )}
          </div>
        ) : null}
        {!query.isPending && !query.isError && items.length === 0 ? (
          <EmptyState
            title={t("shell.notificationsEmpty")}
            description={t("shell.notificationsEmptyHint")}
            className="py-8"
          />
        ) : null}
        {!query.isPending && !query.isError && items.length > 0
          ? items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                canMarkRead={canMarkRead}
                onMarkRead={(id) => markRead.mutate(id)}
              />
            ))
          : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
