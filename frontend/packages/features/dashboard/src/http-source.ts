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
import type { DashboardDataSource } from "./data-source";

/**
 * Real data source: proxies the typed services bound to the shared HTTP
 * client. Endpoints are documented in `frontend/docs/API_CONTRACT.md` and
 * configuration-driven; when the backend has not implemented a route the
 * request fails and the UI renders an honest error/unavailable state.
 */
export function createHttpDataSource(
  services: Pick<ServiceContainer, "dashboard" | "projects">
): DashboardDataSource {
  return {
    isSample: false,
    getMetrics: (range: DashboardTimeRange) => services.dashboard.getMetrics(range),
    getPipelineRuns: (params) => services.dashboard.getPipelineRuns(params),
    getDeployments: (params) => services.dashboard.getDeployments(params),
    getSystemHealth: () => services.dashboard.getSystemHealth(),
    getAlerts: (params) => services.dashboard.getAlerts(params),
    getSecuritySummary: () => services.dashboard.getSecuritySummary(),
    getActivity: (params) => services.dashboard.getActivity(params),
    listProjects: (params: ProjectListParams) => services.projects.listProjects(params),
    getProject: (id: string) => services.projects.getProject(id)
  };
}

export type {
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
};
