"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ControlPlaneService,
  NotificationParams,
  NotificationService,
  SearchParams,
  SearchService
} from "@saas/services";
import { useLocalStorage } from "@saas/hooks";
import type { ProjectListParams } from "@saas/services";

export type PlatformQueryDeps = {
  search: SearchService;
  notifications: NotificationService;
  controlPlane?: ControlPlaneService;
};

export const platformKeys = {
  all: ["platform"] as const,
  search: (params: SearchParams) => [...platformKeys.all, "search", params] as const,
  notifications: (params?: NotificationParams) =>
    [...platformKeys.all, "notifications", params] as const,
  organizations: () => [...platformKeys.all, "organizations"] as const,
  projects: (organizationId: string, params?: ProjectListParams) =>
    [...platformKeys.all, "projects", organizationId, params] as const,
  project: (organizationId: string, id: string) =>
    [...platformKeys.all, "project", organizationId, id] as const,
  repositories: (organizationId: string, params?: { page?: number; pageSize?: number }) =>
    [...platformKeys.all, "repositories", organizationId, params] as const,
  environments: (organizationId: string, params?: { page?: number; pageSize?: number }) =>
    [...platformKeys.all, "environments", organizationId, params] as const
};

export function useGlobalSearch(params: SearchParams, deps: PlatformQueryDeps) {
  return useQuery({
    queryKey: platformKeys.search(params),
    queryFn: () => deps.search.search(params),
    enabled: params.query.trim().length >= 2,
    staleTime: 30_000,
    retry: false
  });
}

export function useNotifications(params: NotificationParams | undefined, deps: PlatformQueryDeps) {
  return useQuery({
    queryKey: platformKeys.notifications(params),
    queryFn: () => deps.notifications.list(params),
    staleTime: 30_000,
    retry: false
  });
}

export function useMarkNotificationRead(deps: PlatformQueryDeps) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deps.notifications.markAsRead(id),
    onSuccess: () => client.invalidateQueries({ queryKey: platformKeys.notifications() })
  });
}

export function useMarkAllNotificationsRead(deps: PlatformQueryDeps) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => deps.notifications.markAllAsRead(),
    onSuccess: () => client.invalidateQueries({ queryKey: platformKeys.notifications() })
  });
}

export function useOrganizations(deps: PlatformQueryDeps) {
  return useQuery({
    queryKey: platformKeys.organizations(),
    queryFn: () => deps.controlPlane!.listOrganizations(),
    staleTime: 60_000,
    enabled: Boolean(deps.controlPlane),
    retry: false
  });
}

export function useActiveOrganization(deps: PlatformQueryDeps) {
  const query = useOrganizations(deps);
  const [selectedId, setSelectedId] = useLocalStorage<string | null>(
    "control-plane.organization-id",
    null
  );
  const organization =
    query.data?.items.find((item) => item.id === selectedId) ?? query.data?.items[0] ?? null;
  return {
    ...query,
    organization,
    organizationId: organization?.id ?? null,
    selectOrganization: setSelectedId
  };
}

export function useControlPlaneProjects(
  organizationId: string | null,
  params: ProjectListParams | undefined,
  deps: PlatformQueryDeps
) {
  return useQuery({
    queryKey: platformKeys.projects(organizationId ?? "none", params),
    queryFn: () => deps.controlPlane!.listProjects(organizationId!, params),
    enabled: Boolean(organizationId && deps.controlPlane),
    staleTime: 30_000,
    retry: false
  });
}

export function useControlPlaneProject(
  organizationId: string | null,
  id: string,
  deps: PlatformQueryDeps
) {
  return useQuery({
    queryKey: platformKeys.project(organizationId ?? "none", id),
    queryFn: () => deps.controlPlane!.getProject(organizationId!, id),
    enabled: Boolean(organizationId && id && deps.controlPlane),
    staleTime: 30_000,
    retry: false
  });
}

export function useCreateProject(organizationId: string | null, deps: PlatformQueryDeps) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; slug: string; description?: string }) =>
      deps.controlPlane!.createProject(organizationId!, input),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: platformKeys.projects(organizationId ?? "none") })
  });
}

export function useRepositoryReferences(
  organizationId: string | null,
  params: { page?: number; pageSize?: number } | undefined,
  deps: PlatformQueryDeps
) {
  return useQuery({
    queryKey: platformKeys.repositories(organizationId ?? "none", params),
    queryFn: () => deps.controlPlane!.listRepositoryReferences(organizationId!, params),
    enabled: Boolean(organizationId && deps.controlPlane),
    staleTime: 30_000,
    retry: false
  });
}

export function useEnvironmentReferences(
  organizationId: string | null,
  params: { page?: number; pageSize?: number } | undefined,
  deps: PlatformQueryDeps
) {
  return useQuery({
    queryKey: platformKeys.environments(organizationId ?? "none", params),
    queryFn: () => deps.controlPlane!.listEnvironmentReferences(organizationId!, params),
    enabled: Boolean(organizationId && deps.controlPlane),
    staleTime: 30_000,
    retry: false
  });
}
