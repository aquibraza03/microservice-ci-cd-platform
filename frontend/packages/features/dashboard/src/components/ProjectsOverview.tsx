"use client";
import Link from "next/link";
import { FolderGit2 } from "lucide-react";
import { useI18n } from "@saas/intl";
import { Button, EmptyState, StatusBadge } from "@saas/ui";
import { useProjects, type DashboardQueryDeps } from "../api";
import { projectStatusMeta } from "../status-meta";
import { LoadingRows, WidgetCard, WidgetError } from "./shared";

/**
 * Projects overview. Rows link to their project details; loading/error/empty
 * states are explicit and honest.
 */
export function ProjectsOverview({
  deps,
  limit = 6,
  onRetry
}: {
  deps: DashboardQueryDeps;
  limit?: number;
  onRetry?: () => void;
}) {
  const { t, formatRelativeTime } = useI18n();
  const query = useProjects({ page: 1, pageSize: limit }, deps);

  return (
    <WidgetCard
      title={t("dashboard.sections.projectsOverview")}
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href="/projects">{t("dashboard.viewAll")}</Link>
        </Button>
      }
    >
      {query.isPending ? (
        <LoadingRows rows={limit} />
      ) : query.isError ? (
        <WidgetError section={t("dashboard.sections.projectsOverview")} onRetry={onRetry} />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={<FolderGit2 aria-hidden="true" />} title={t("dashboard.noProjects")} />
      ) : (
        <ul className="space-y-1">
          {query.data.items.map((project) => {
            const meta = projectStatusMeta[project.status];
            return (
              <li key={project.id} className="border-b last:border-b-0">
                <Link
                  href={`/projects/${project.id}`}
                  className="flex items-center justify-between gap-3 rounded-sm px-1 py-2 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{project.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {project.slug}
                      {project.lastActivityAt
                        ? ` · ${t("common.lastActivity")} ${formatRelativeTime(project.lastActivityAt)}`
                        : ""}
                    </span>
                  </span>
                  <StatusBadge tone={meta.tone} className="shrink-0">
                    {t(meta.labelKey)}
                  </StatusBadge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
