"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProjectListParams } from "@saas/services";
import type { DashboardTimeRange } from "@saas/types";
import type { DashboardDataSource } from "./data-source";

/** Query keys for dashboard/project server state. */
export const dashboardKeys = {
  all: ["dashboard"] as const,
  metrics: (range: DashboardTimeRange) => [...dashboardKeys.all, "metrics", range] as const,
  pipelineRuns: (params: { limit?: number; status?: string } | undefined) =>
    [...dashboardKeys.all, "pipeline-runs", params] as const,
  deployments: (limit: number) => [...dashboardKeys.all, "deployments", limit] as const,
  systemHealth: () => [...dashboardKeys.all, "system-health"] as const,
  alerts: (limit: number) => [...dashboardKeys.all, "alerts", limit] as const,
  security: () => [...dashboardKeys.all, "security"] as const,
  activity: (limit: number) => [...dashboardKeys.all, "activity", limit] as const,
  projects: (params: ProjectListParams | undefined) => ["projects", params] as const,
  project: (id: string) => ["projects", "detail", id] as const
};

export type DashboardQueryDeps = {
  source: DashboardDataSource;
};

const QUERY_DEFAULTS = { staleTime: 30_000 } as const;

export function useDashboardMetrics(range: DashboardTimeRange, deps: DashboardQueryDeps) {
  return useQuery({
    queryKey: dashboardKeys.metrics(range),
    queryFn: () => deps.source.getMetrics(range),
    ...QUERY_DEFAULTS
  });
}

export function usePipelineRuns(
  params: { limit?: number; status?: string } | undefined,
  deps: DashboardQueryDeps
) {
  return useQuery({
    queryKey: dashboardKeys.pipelineRuns(params),
    queryFn: () => deps.source.getPipelineRuns(params),
    ...QUERY_DEFAULTS
  });
}

export function useDeployments(limit: number, deps: DashboardQueryDeps) {
  return useQuery({
    queryKey: dashboardKeys.deployments(limit),
    queryFn: () => deps.source.getDeployments({ limit }),
    ...QUERY_DEFAULTS
  });
}

export function useSystemHealth(deps: DashboardQueryDeps) {
  return useQuery({
    queryKey: dashboardKeys.systemHealth(),
    queryFn: () => deps.source.getSystemHealth(),
    ...QUERY_DEFAULTS
  });
}

export function useAlerts(limit: number, deps: DashboardQueryDeps) {
  return useQuery({
    queryKey: dashboardKeys.alerts(limit),
    queryFn: () => deps.source.getAlerts({ limit }),
    ...QUERY_DEFAULTS
  });
}

export function useSecuritySummary(deps: DashboardQueryDeps) {
  return useQuery({
    queryKey: dashboardKeys.security(),
    queryFn: () => deps.source.getSecuritySummary(),
    ...QUERY_DEFAULTS
  });
}

export function useActivity(limit: number, deps: DashboardQueryDeps) {
  return useQuery({
    queryKey: dashboardKeys.activity(limit),
    queryFn: () => deps.source.getActivity({ limit }),
    ...QUERY_DEFAULTS
  });
}

export function useProjects(params: ProjectListParams | undefined, deps: DashboardQueryDeps) {
  return useQuery({
    queryKey: dashboardKeys.projects(params),
    queryFn: () => deps.source.listProjects(params),
    ...QUERY_DEFAULTS
  });
}

export function useProject(id: string, deps: DashboardQueryDeps) {
  return useQuery({
    queryKey: dashboardKeys.project(id),
    queryFn: () => deps.source.getProject(id),
    enabled: id.length > 0,
    ...QUERY_DEFAULTS
  });
}
