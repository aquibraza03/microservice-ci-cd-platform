import type { AppConfig } from "@saas/lib";
import type { HttpClient } from "../http";
import { createAuthService, type AuthService } from "./auth.service";
import { createDashboardService, type DashboardService } from "./dashboard.service";
import { createHealthService, type HealthService } from "./health.service";
import { createProjectsService, type ProjectsService } from "./projects.service";
import {
  createNotificationService,
  createSearchService,
  type NotificationService,
  type SearchService
} from "./workspace.service";
import { createControlPlaneService, type ControlPlaneService } from "./control-plane.service";

export type { AuthService } from "./auth.service";
export { tokensFromRefresh, RefreshResponseSchema } from "./auth.service";
export type { RefreshResponse } from "./auth.service";
export type { DashboardService } from "./dashboard.service";
export type { HealthService } from "./health.service";
export type { ProjectsService, ProjectListParams } from "./projects.service";
export type {
  NotificationService,
  NotificationParams,
  SearchParams,
  SearchService
} from "./workspace.service";
export type { ControlPlaneService } from "./control-plane.service";

/** Container of every typed service bound to the shared HTTP client. */
export type ServiceContainer = {
  auth: AuthService;
  health: HealthService;
  dashboard: DashboardService;
  projects: ProjectsService;
  search: SearchService;
  notifications: NotificationService;
  controlPlane: ControlPlaneService;
};

/**
 * Build all typed services over a single HTTP client.
 * This is the ONLY place services are composed; the app wires one container
 * and injects it where needed.
 */
export function createServices(http: HttpClient, config: AppConfig): ServiceContainer {
  return {
    auth: createAuthService(http, config),
    health: createHealthService(http),
    dashboard: createDashboardService(http, config),
    projects: createProjectsService(http, config),
    search: createSearchService(http, config),
    notifications: createNotificationService(http, config),
    controlPlane: createControlPlaneService(http, config)
  };
}
