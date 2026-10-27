"use client";

import { useState } from "react";
import Link from "next/link";
import { GitBranch } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { useI18n } from "@saas/intl";
import type { PipelineRun, PipelineStatus } from "@saas/types";
import { usePipelineRuns, type DashboardQueryDeps, WidgetError } from "@saas/features/dashboard";
import { pipelineStatusMeta, pipelineTriggerMeta } from "@saas/features/dashboard";
import { DataTable, EmptyState, Input, PageHeader, StatusBadge } from "@saas/ui";
import { cn } from "@saas/utils";
import { getAppComposition } from "@/lib/composition";

const STATUS_FILTERS: Array<PipelineStatus | "all"> = [
  "all",
  "succeeded",
  "running",
  "failed",
  "queued",
  "cancelled",
  "skipped"
];

/**
 * Pipeline runs page: search, status filter, sorting, and pagination over the
 * pipeline runs contract.
 */
export function PipelineRunsView() {
  const { t, formatDuration, formatRelativeTime } = useI18n();
  const { dashboard } = getAppComposition();
  const deps: DashboardQueryDeps = { source: dashboard };

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PipelineStatus | "all">("all");

  const query = usePipelineRuns({ limit: 100 }, deps);

  const columns: ColumnDef<PipelineRun>[] = [
    {
      id: "pipelineName",
      accessorKey: "pipelineName",
      header: t("pipelineRuns.columns.pipeline"),
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.pipelineName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.original.commit.slice(0, 7)} · {row.original.commitMessage || "—"}
          </p>
        </div>
      )
    },
    {
      id: "projectName",
      accessorKey: "projectName",
      header: t("pipelineRuns.columns.project"),
      cell: ({ row }) => (
        <Link
          href={`/projects/${row.original.projectId}`}
          className="rounded-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {row.original.projectName}
        </Link>
      )
    },
    {
      id: "branch",
      accessorKey: "branch",
      header: t("pipelineRuns.columns.branch"),
      cell: ({ getValue }) => (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <GitBranch className="size-3" aria-hidden="true" />
          {String(getValue<string>())}
        </span>
      )
    },
    {
      id: "status",
      accessorKey: "status",
      header: t("pipelineRuns.columns.status"),
      cell: ({ row }) => (
        <StatusBadge tone={pipelineStatusMeta[row.original.status].tone}>
          {t(pipelineStatusMeta[row.original.status].labelKey)}
        </StatusBadge>
      )
    },
    {
      id: "trigger",
      accessorKey: "trigger",
      header: t("pipelineRuns.columns.trigger"),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">
          {t(pipelineTriggerMeta[getValue<PipelineRun["trigger"]>()])}
        </span>
      )
    },
    {
      id: "durationMs",
      accessorKey: "durationMs",
      header: t("pipelineRuns.columns.duration"),
      cell: ({ getValue }) => {
        const value = getValue<number | null>();
        return (
          <span className="tabular-nums text-muted-foreground">
            {value === null ? "—" : formatDuration(value)}
          </span>
        );
      }
    },
    {
      id: "startedAt",
      accessorKey: "startedAt",
      header: t("pipelineRuns.columns.started"),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">{formatRelativeTime(getValue<string>())}</span>
      )
    },
    {
      id: "actor",
      accessorKey: "actor",
      header: t("pipelineRuns.columns.actor"),
      cell: ({ getValue }) => {
        const actor = getValue<string | null>();
        return <span className="text-muted-foreground">{actor ?? "—"}</span>;
      }
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("pipelineRuns.title")} description={t("pipelineRuns.description")} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("projects.search")}
          aria-label={t("projects.search")}
          className="max-w-xs"
        />
        <div
          className="flex flex-wrap items-center gap-1 rounded-md border p-0.5"
          role="group"
          aria-label={t("pipelineRuns.filterStatus")}
        >
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatus(filter)}
              aria-pressed={status === filter}
              className={cn(
                "h-7 rounded-sm px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                status === filter
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {filter === "all"
                ? t("pipelineRuns.filterAll")
                : t(pipelineStatusMeta[filter].labelKey)}
            </button>
          ))}
        </div>
      </div>

      {query.isError ? (
        <WidgetError section={t("pipelineRuns.title")} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          data={query.data?.items ?? []}
          columns={columns}
          rowKey={(run) => run.id}
          searchValue={search}
          filter={status === "all" ? undefined : (run) => run.status === status}
          loading={query.isPending}
          empty={
            <EmptyState icon={<GitBranch aria-hidden="true" />} title={t("pipelineRuns.empty")} />
          }
          defaultSort={[{ id: "startedAt", desc: true }]}
          className="mt-1"
        />
      )}
    </div>
  );
}
