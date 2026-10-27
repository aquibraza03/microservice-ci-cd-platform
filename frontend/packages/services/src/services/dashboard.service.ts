import type { AppConfig } from "@saas/lib";
import type { HttpClient } from "../http";
import { resolveUrl } from "../url";
import {
  ActivityItemSchema,
  AlertSchema,
  DashboardMetricsSchema,
  DeploymentSchema,
  PageSchema,
  PipelineRunSchema,
  SecuritySummarySchema,
  SystemHealthSchema,
  type ActivityItem,
  type Alert,
  type DashboardMetrics,
  type DashboardTimeRange,
  type Deployment,
  type Page,
  type PipelineRun,
  type SecuritySummary,
  type SystemHealth
} from "@saas/types";

/**
 * Typed service for the DOCUMENTED dashboard API contract.
 *
 * The endpoints (see `frontend/docs/API_CONTRACT.md`) are configuration-driven
 * and resolved against the API base URL — nothing is hardcoded. When the
 * backend has not implemented a route yet the request fails and the consuming
 * widget renders an honest unavailable/empty state.
 */
export interface DashboardService {
  getMetrics(range: DashboardTimeRange): Promise<DashboardMetrics>;
  getPipelineRuns(params?: { limit?: number; status?: string }): Promise<Page<PipelineRun>>;
  getDeployments(params?: { limit?: number }): Promise<Page<Deployment>>;
  getSystemHealth(): Promise<SystemHealth>;
  getAlerts(params?: { limit?: number }): Promise<Page<Alert>>;
  getSecuritySummary(): Promise<SecuritySummary>;
  getActivity(params?: { limit?: number }): Promise<Page<ActivityItem>>;
}

const PipelineRunPageSchema = PageSchema(PipelineRunSchema);
const DeploymentPageSchema = PageSchema(DeploymentSchema);
const AlertPageSchema = PageSchema(AlertSchema);
const ActivityPageSchema = PageSchema(ActivityItemSchema);

export function createDashboardService(http: HttpClient, config: AppConfig): DashboardService {
  const endpoints = config.dashboard.endpoints;

  return {
    getMetrics: (range) =>
      http.get<DashboardMetrics>(resolveUrl(config.api.baseUrl, endpoints.metrics), {
        params: { range },
        schema: DashboardMetricsSchema
      }),

    getPipelineRuns: (params) =>
      http.get<Page<PipelineRun>>(resolveUrl(config.api.baseUrl, endpoints.pipelineRuns), {
        params,
        schema: PipelineRunPageSchema
      }),

    getDeployments: (params) =>
      http.get<Page<Deployment>>(resolveUrl(config.api.baseUrl, endpoints.deployments), {
        params,
        schema: DeploymentPageSchema
      }),

    getSystemHealth: () =>
      http.get<SystemHealth>(resolveUrl(config.api.baseUrl, endpoints.systemHealth), {
        schema: SystemHealthSchema
      }),

    getAlerts: (params) =>
      http.get<Page<Alert>>(resolveUrl(config.api.baseUrl, endpoints.alerts), {
        params,
        schema: AlertPageSchema
      }),

    getSecuritySummary: () =>
      http.get<SecuritySummary>(resolveUrl(config.api.baseUrl, endpoints.security), {
        schema: SecuritySummarySchema
      }),

    getActivity: (params) =>
      http.get<Page<ActivityItem>>(resolveUrl(config.api.baseUrl, endpoints.activity), {
        params,
        schema: ActivityPageSchema
      })
  };
}
