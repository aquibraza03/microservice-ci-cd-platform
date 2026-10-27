"use client";

import Link from "next/link";
import { ArrowLeft, FolderGit2 } from "lucide-react";
import { useI18n } from "@saas/intl";
import { useActiveOrganization, useControlPlaneProject } from "@saas/features/platform";
import { WidgetError } from "@saas/features/dashboard";
import { projectStatusMeta } from "@saas/features/dashboard";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@saas/ui";
import { getAppComposition } from "@/lib/composition";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
    </div>
  );
}

function ModuleUnavailable() {
  const { t } = useI18n();
  return (
    <Card>
      <CardContent className="pt-6">
        <EmptyState
          icon={<FolderGit2 aria-hidden="true" />}
          title={t("projects.moduleUnavailable.title")}
          description={t("projects.moduleUnavailable.description")}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Project Details foundation. The Overview tab renders contract data; the
 * remaining tabs are structured placeholders that will be implemented together
 * with their backend contracts (never fake content).
 */
export function ProjectDetailView({ id }: { id: string }) {
  const { t, formatDate, formatRelativeTime } = useI18n();
  const { controlPlane, search, notifications } = getAppComposition();
  const deps = { controlPlane, search, notifications };
  const organization = useActiveOrganization(deps);
  const query = useControlPlaneProject(organization.organizationId, id, deps);

  const header = (
    <PageHeader
      title={query.data?.name ?? id}
      description={query.data?.description ?? undefined}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/projects">
            <ArrowLeft aria-hidden="true" />
            {t("projects.back")}
          </Link>
        </Button>
      }
    />
  );

  if (query.isPending) {
    return (
      <div className="space-y-6">
        {header}
        <div className="grid gap-4 md:grid-cols-3" aria-busy="true">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="space-y-6">
        {header}
        <WidgetError section={t("projects.title")} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const project = query.data;

  return (
    <div className="space-y-6">
      {header}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("projects.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="repositories">{t("projects.tabs.repositories")}</TabsTrigger>
          <TabsTrigger value="pipelines">{t("projects.tabs.pipelines")}</TabsTrigger>
          <TabsTrigger value="deployments">{t("projects.tabs.deployments")}</TabsTrigger>
          <TabsTrigger value="environments">{t("projects.tabs.environments")}</TabsTrigger>
          <TabsTrigger value="activity">{t("projects.tabs.activity")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>{t("projects.detail.repositories")}</CardTitle>
                <CardDescription>{t("projects.columns.repositories")}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">{project.repositoryCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("projects.detail.pipelines")}</CardTitle>
                <CardDescription>{t("projects.columns.pipelines")}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">{project.pipelineCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("projects.detail.deployments")}</CardTitle>
                <CardDescription>{t("projects.columns.deployments")}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">{project.deploymentCount}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{project.name}</CardTitle>
              <CardDescription>{project.slug}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <DetailRow
                  label={t("projects.columns.status")}
                  value={
                    <StatusBadge tone={projectStatusMeta[project.status].tone}>
                      {t(projectStatusMeta[project.status].labelKey)}
                    </StatusBadge>
                  }
                />
                <DetailRow
                  label={t("projects.detail.defaultBranch")}
                  value={project.defaultBranch}
                />
                <DetailRow
                  label={t("projects.detail.repository")}
                  value={project.repositoryUrl ?? "—"}
                />
                <DetailRow
                  label={t("projects.detail.lastActivity")}
                  value={project.lastActivityAt ? formatRelativeTime(project.lastActivityAt) : "—"}
                />
                <DetailRow
                  label={t("projects.detail.created")}
                  value={formatDate(project.createdAt)}
                />
                <DetailRow label={t("projects.columns.owner")} value={project.owner ?? "—"} />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="repositories">
          <ModuleUnavailable />
        </TabsContent>
        <TabsContent value="pipelines">
          <ModuleUnavailable />
        </TabsContent>
        <TabsContent value="deployments">
          <ModuleUnavailable />
        </TabsContent>
        <TabsContent value="environments">
          <ModuleUnavailable />
        </TabsContent>
        <TabsContent value="activity">
          <ModuleUnavailable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
