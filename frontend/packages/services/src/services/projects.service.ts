import type { AppConfig } from "@saas/lib";
import type { HttpClient } from "../http";
import { resolveUrl } from "../url";
import {
  PageSchema,
  ProjectDetailSchema,
  ProjectSummarySchema,
  type Page,
  type ProjectDetail,
  type ProjectStatus,
  type ProjectSummary
} from "@saas/types";

/** List/filter params for the projects contract. */
export type ProjectListParams = {
  search?: string;
  status?: ProjectStatus;
  page?: number;
  pageSize?: number;
};

/**
 * Typed service for the DOCUMENTED projects API contract
 * (`frontend/docs/API_CONTRACT.md`). Endpoints are configuration-driven.
 */
export interface ProjectsService {
  listProjects(params?: ProjectListParams): Promise<Page<ProjectSummary>>;
  getProject(id: string): Promise<ProjectDetail>;
}

const ProjectPageSchema = PageSchema(ProjectSummarySchema);

export function createProjectsService(http: HttpClient, config: AppConfig): ProjectsService {
  const endpoints = config.projects.endpoints;

  return {
    listProjects: (params) =>
      http.get<Page<ProjectSummary>>(resolveUrl(config.api.baseUrl, endpoints.list), {
        params,
        schema: ProjectPageSchema
      }),

    getProject: (id) =>
      http.get<ProjectDetail>(
        resolveUrl(config.api.baseUrl, endpoints.detail.replace("{id}", id)),
        {
          schema: ProjectDetailSchema
        }
      )
  };
}
