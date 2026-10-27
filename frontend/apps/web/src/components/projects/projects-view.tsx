"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { FolderGit2, Plus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { useI18n } from "@saas/intl";
import type { ProjectSummary, ProjectStatus } from "@saas/types";
import {
  useActiveOrganization,
  useControlPlaneProjects,
  useCreateProject
} from "@saas/features/platform";
import { projectStatusMeta } from "@saas/features/dashboard";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  StatusBadge
} from "@saas/ui";
import { cn } from "@saas/utils";
import { getAppComposition } from "@/lib/composition";
import { WidgetError } from "@saas/features/dashboard";

const STATUS_FILTERS: Array<ProjectStatus | "all"> = ["all", "active", "archived"];
const projectFormSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(2)
    .max(64),
  description: z.string().trim().max(500).optional()
});
type ProjectFormValues = z.infer<typeof projectFormSchema>;

/**
 * Projects page: search, status filter, sorting, and pagination over the
 * projects contract. The "New project" action is disabled (with an honest
 * tooltip) until the backend supports creation — no fake functionality.
 */
export function ProjectsView() {
  const { t, formatRelativeTime } = useI18n();
  const {
    controlPlane,
    search: searchService,
    notifications: notificationsService
  } = getAppComposition();
  const deps = { controlPlane, search: searchService, notifications: notificationsService };
  const organization = useActiveOrganization(deps);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "all">("all");

  const query = useControlPlaneProjects(
    organization.organizationId,
    {
      page: 1,
      pageSize: 25,
      search: search || undefined,
      status: status === "all" ? undefined : status
    },
    deps
  );
  const createProject = useCreateProject(organization.organizationId, deps);
  const [createOpen, setCreateOpen] = useState(false);
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: "", slug: "", description: "" }
  });

  const columns: ColumnDef<ProjectSummary>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: t("projects.columns.name"),
      cell: ({ row }) => (
        <Link
          href={`/projects/${row.original.id}`}
          className="rounded-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="block truncate">{row.original.name}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {row.original.slug}
          </span>
        </Link>
      )
    },
    {
      id: "status",
      accessorKey: "status",
      header: t("projects.columns.status"),
      cell: ({ row }) => (
        <StatusBadge tone={projectStatusMeta[row.original.status].tone}>
          {t(projectStatusMeta[row.original.status].labelKey)}
        </StatusBadge>
      )
    },
    {
      id: "repositories",
      accessorKey: "repositoryCount",
      header: t("projects.columns.repositories"),
      cell: ({ getValue }) => <span className="tabular-nums">{String(getValue<number>())}</span>
    },
    {
      id: "pipelines",
      accessorKey: "pipelineCount",
      header: t("projects.columns.pipelines"),
      cell: ({ getValue }) => <span className="tabular-nums">{String(getValue<number>())}</span>
    },
    {
      id: "deployments",
      accessorKey: "deploymentCount",
      header: t("projects.columns.deployments"),
      cell: ({ getValue }) => <span className="tabular-nums">{String(getValue<number>())}</span>
    },
    {
      id: "owner",
      accessorKey: "owner",
      header: t("projects.columns.owner"),
      cell: ({ getValue }) => {
        const owner = getValue<string | null>();
        return <span className="text-muted-foreground">{owner ?? "—"}</span>;
      }
    },
    {
      id: "lastActivityAt",
      accessorKey: "lastActivityAt",
      header: t("projects.columns.lastActivity"),
      cell: ({ getValue }) => {
        const value = getValue<string | null>();
        return (
          <span className="text-muted-foreground">{value ? formatRelativeTime(value) : "—"}</span>
        );
      }
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("projects.title")}
        description={t("projects.description")}
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <Button
              onClick={() => setCreateOpen(true)}
              disabled={!organization.organizationId}
              aria-label={t("projects.create")}
            >
              <Plus aria-hidden="true" />
              {t("projects.create")}
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("projects.create")}</DialogTitle>
                <DialogDescription>{t("projects.createDescription")}</DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit((values) =>
                  createProject.mutate(values, {
                    onSuccess: () => {
                      setCreateOpen(false);
                      form.reset();
                    }
                  })
                )}
              >
                <div className="space-y-2">
                  <Label htmlFor="project-name">{t("projects.form.name")}</Label>
                  <Input id="project-name" {...form.register("name")} />
                  {form.formState.errors.name ? (
                    <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-slug">{t("projects.form.slug")}</Label>
                  <Input id="project-slug" {...form.register("slug")} />
                  {form.formState.errors.slug ? (
                    <p className="text-sm text-destructive">{form.formState.errors.slug.message}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-description">{t("projects.form.description")}</Label>
                  <Input id="project-description" {...form.register("description")} />
                </div>
                {createProject.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {t("projects.createError")}
                  </p>
                ) : null}
                <DialogFooter>
                  <Button type="submit" disabled={createProject.isPending}>
                    {createProject.isPending ? t("common.loading") : t("projects.createSubmit")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("projects.search")}
          aria-label={t("projects.search")}
          className="max-w-xs"
        />
        <div
          className="flex items-center gap-1 rounded-md border p-0.5"
          role="group"
          aria-label={t("projects.filterStatus")}
        >
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter}
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2.5 text-xs",
                status === filter && "bg-accent text-accent-foreground"
              )}
              onClick={() => setStatus(filter)}
              aria-pressed={status === filter}
            >
              {filter === "all" ? t("projects.filterAll") : t(projectStatusMeta[filter].labelKey)}
            </Button>
          ))}
        </div>
      </div>

      {!organization.organizationId && !organization.isPending ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("projects.organizationRequired")}</CardTitle>
            <CardDescription>{t("projects.organizationRequiredHint")}</CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      ) : query.isError ? (
        <WidgetError section={t("projects.title")} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          data={query.data?.items ?? []}
          columns={columns}
          rowKey={(project) => project.id}
          searchValue=""
          filter={undefined}
          loading={query.isPending}
          empty={
            <EmptyState
              icon={<FolderGit2 aria-hidden="true" />}
              title={t("projects.empty.title")}
              description={t("projects.empty.description")}
            />
          }
          defaultSort={[{ id: "name", desc: false }]}
          className="mt-1"
        />
      )}
    </div>
  );
}
