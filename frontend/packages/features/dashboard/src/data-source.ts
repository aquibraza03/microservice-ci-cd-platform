import type { ServiceContainer } from "@saas/services";
import type { ProjectListParams } from "@saas/services";
import type {
  ActivityItem,
  Alert,
  DashboardMetrics,
  DashboardTimeRange,
  Deployment,
  Page,
  PipelineRun,
  ProjectDetail,
  ProjectSummary,
  SecuritySummary,
  SystemHealth
} from "@saas/types";
import { DASHBOARD_DATA_SOURCE } from "./constants";
import { createDevDataSource } from "./dev-source";
import { createHttpDataSource } from "./http-source";

/**
 * Dashboard data source — the single seam between the UI and its data.
 *
 * Two implementations exist:
 *  - `http`: talks to the documented API contract through the typed services.
 *  - `dev` : development-only sample data. The factory throws in production so
 *            sample data can never ship; the UI also shows a "sample data"
 *            indicator while the dev source is active.
 */
export interface DashboardDataSource {
  readonly isSample: boolean;
  getMetrics(range: DashboardTimeRange): Promise<DashboardMetrics>;
  getPipelineRuns(params?: { limit?: number; status?: string }): Promise<Page<PipelineRun>>;
  getDeployments(params?: { limit?: number }): Promise<Page<Deployment>>;
  getSystemHealth(): Promise<SystemHealth>;
  getAlerts(params?: { limit?: number }): Promise<Page<Alert>>;
  getSecuritySummary(): Promise<SecuritySummary>;
  getActivity(params?: { limit?: number }): Promise<Page<ActivityItem>>;
  listProjects(params?: ProjectListParams): Promise<Page<ProjectSummary>>;
  getProject(id: string): Promise<ProjectDetail>;
}

/**
 * Build the dashboard data source for the active configuration.
 * `source === "dev"` selects the development sample source (forbidden in
 * production); anything else talks to the real backend contract.
 */
export function createDashboardDataSource(
  source: string,
  services: Pick<ServiceContainer, "dashboard" | "projects">
): DashboardDataSource {
  if (source === DASHBOARD_DATA_SOURCE.DEV) {
    return createDevDataSource();
  }
  return createHttpDataSource(services);
}
