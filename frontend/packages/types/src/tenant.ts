/**
 * Multi-tenancy foundation types.
 *
 * The platform is designed for nested tenancy: Organizations → Teams →
 * Projects, with Namespaces isolating resources and Roles isolating
 * capabilities. These contracts prepare the domain model; resolution of the
 * active tenant context is provided by the session (user.organization /
 * user.namespace) in a future module — no single-tenant assumptions are baked
 * into the frontend.
 */

export type TenantId = string;
export type OrganizationId = string;
export type TeamId = string;
export type ProjectId = string;
export type NamespaceId = string;

/** Top-level tenant that owns resources and billing. */
export type Organization = {
  id: OrganizationId;
  slug: string;
  name: string;
  plan?: string | null;
};

/** Grouping of users and projects within an organization. */
export type Team = {
  id: TeamId;
  organizationId: OrganizationId;
  slug: string;
  name: string;
};

/** Resource container scoped to a team or namespace. */
export type Project = {
  id: ProjectId;
  teamId?: TeamId | null;
  namespaceId: NamespaceId;
  slug: string;
  name: string;
};

/** Isolation boundary for resources (registry entries, pipelines, …). */
export type Namespace = {
  id: NamespaceId;
  organizationId: OrganizationId;
  slug: string;
  name: string;
};

/** The tenant context a request/session operates under. */
export type TenantContext = {
  organization?: Organization | null;
  team?: Team | null;
  project?: Project | null;
  namespace?: Namespace | null;
};
