import { getEnv } from "./env";

/**
 * Application configuration, derived from the validated environment.
 * Single source of truth consumed by services, features, and the app shell.
 */

export type AuthEndpoints = {
  login: string;
  logout: string;
  refresh: string;
  userinfo: string;
  oauthAuthorize: string;
  oauthToken: string;
};

export type AppConfig = {
  name: string;
  url: string;
  enabled: boolean;
  api: {
    baseUrl: string;
    timeoutMs: number;
    retries: number;
  };
  auth: {
    enabled: boolean;
    provider: string;
    endpoints: AuthEndpoints;
    oauthClientId: string;
    oauthScopes: string[];
    redirectPath: string;
    sessionTtlMs: number;
  };
  logLevel: "debug" | "info" | "warn" | "error" | "silent";
  maintenanceMode: boolean;
  dashboard: {
    source: "http" | "dev";
    endpoints: {
      metrics: string;
      pipelineRuns: string;
      deployments: string;
      systemHealth: string;
      alerts: string;
      security: string;
      activity: string;
    };
  };
  projects: {
    endpoints: {
      list: string;
      detail: string;
    };
  };
  controlPlane: {
    organizations: string;
    projects: string;
    project: string;
    repositories: string;
    environments: string;
  };
  search: { endpoint: string };
  notifications: { list: string; read: string; readAll: string };
  features: {
    registry: boolean;
    observability: boolean;
    ciCd: boolean;
    pipelines: boolean;
    deployments: boolean;
    repositories: boolean;
    environments: boolean;
    containers: boolean;
    infrastructure: boolean;
    logs: boolean;
    traces: boolean;
    alerts: boolean;
    security: boolean;
    vulnerabilities: boolean;
    sbom: boolean;
    compliance: boolean;
    users: boolean;
    teams: boolean;
    settings: boolean;
  };
};

export function getConfig(): AppConfig {
  const env = getEnv();

  return {
    name: env.NEXT_PUBLIC_APP_NAME,
    url: env.NEXT_PUBLIC_APP_URL,
    enabled: env.NEXT_PUBLIC_APP_ENABLED,
    api: {
      baseUrl: env.NEXT_PUBLIC_API_BASE_URL,
      timeoutMs: env.NEXT_PUBLIC_API_TIMEOUT_MS,
      retries: env.NEXT_PUBLIC_API_RETRIES
    },
    auth: {
      enabled: env.NEXT_PUBLIC_AUTH_ENABLED,
      provider: env.NEXT_PUBLIC_AUTH_PROVIDER,
      endpoints: {
        login: env.NEXT_PUBLIC_AUTH_LOGIN_URL,
        logout: env.NEXT_PUBLIC_AUTH_LOGOUT_URL,
        refresh: env.NEXT_PUBLIC_AUTH_REFRESH_URL,
        userinfo: env.NEXT_PUBLIC_AUTH_USERINFO_URL,
        oauthAuthorize: env.NEXT_PUBLIC_AUTH_OAUTH_AUTHORIZE_URL,
        oauthToken: env.NEXT_PUBLIC_AUTH_OAUTH_TOKEN_URL
      },
      oauthClientId: env.NEXT_PUBLIC_AUTH_OAUTH_CLIENT_ID,
      oauthScopes: env.NEXT_PUBLIC_AUTH_OAUTH_SCOPES.split(" ").filter(Boolean),
      redirectPath: env.NEXT_PUBLIC_AUTH_REDIRECT_PATH,
      sessionTtlMs: env.NEXT_PUBLIC_AUTH_SESSION_TTL_MS
    },
    logLevel: env.NEXT_PUBLIC_LOG_LEVEL,
    maintenanceMode: env.NEXT_PUBLIC_MAINTENANCE_MODE,
    dashboard: {
      source: env.NEXT_PUBLIC_DASHBOARD_SOURCE,
      endpoints: {
        metrics: env.NEXT_PUBLIC_DASHBOARD_METRICS_URL,
        pipelineRuns: env.NEXT_PUBLIC_DASHBOARD_PIPELINE_RUNS_URL,
        deployments: env.NEXT_PUBLIC_DASHBOARD_DEPLOYMENTS_URL,
        systemHealth: env.NEXT_PUBLIC_DASHBOARD_SYSTEM_HEALTH_URL,
        alerts: env.NEXT_PUBLIC_DASHBOARD_ALERTS_URL,
        security: env.NEXT_PUBLIC_DASHBOARD_SECURITY_URL,
        activity: env.NEXT_PUBLIC_DASHBOARD_ACTIVITY_URL
      }
    },
    projects: {
      endpoints: {
        list: env.NEXT_PUBLIC_PROJECTS_LIST_URL,
        detail: env.NEXT_PUBLIC_PROJECT_DETAIL_URL
      }
    },
    controlPlane: {
      organizations: env.NEXT_PUBLIC_ORGANIZATIONS_URL,
      projects: env.NEXT_PUBLIC_ORGANIZATION_PROJECTS_URL,
      project: env.NEXT_PUBLIC_ORGANIZATION_PROJECT_URL,
      repositories: env.NEXT_PUBLIC_ORGANIZATION_REPOSITORIES_URL,
      environments: env.NEXT_PUBLIC_ORGANIZATION_ENVIRONMENTS_URL
    },
    search: { endpoint: env.NEXT_PUBLIC_SEARCH_URL },
    notifications: {
      list: env.NEXT_PUBLIC_NOTIFICATIONS_URL,
      read: env.NEXT_PUBLIC_NOTIFICATION_READ_URL,
      readAll: env.NEXT_PUBLIC_NOTIFICATIONS_READ_ALL_URL
    },
    features: {
      registry: env.NEXT_PUBLIC_FEATURE_REGISTRY,
      observability: env.NEXT_PUBLIC_FEATURE_OBSERVABILITY,
      ciCd: env.NEXT_PUBLIC_FEATURE_CI_CD,
      pipelines: env.NEXT_PUBLIC_FEATURE_PIPELINES,
      deployments: env.NEXT_PUBLIC_FEATURE_DEPLOYMENTS,
      repositories: env.NEXT_PUBLIC_FEATURE_REPOSITORIES,
      environments: env.NEXT_PUBLIC_FEATURE_ENVIRONMENTS,
      containers: env.NEXT_PUBLIC_FEATURE_CONTAINERS,
      infrastructure: env.NEXT_PUBLIC_FEATURE_INFRASTRUCTURE,
      logs: env.NEXT_PUBLIC_FEATURE_LOGS,
      traces: env.NEXT_PUBLIC_FEATURE_TRACES,
      alerts: env.NEXT_PUBLIC_FEATURE_ALERTS,
      security: env.NEXT_PUBLIC_FEATURE_SECURITY,
      vulnerabilities: env.NEXT_PUBLIC_FEATURE_VULNERABILITIES,
      sbom: env.NEXT_PUBLIC_FEATURE_SBOM,
      compliance: env.NEXT_PUBLIC_FEATURE_COMPLIANCE,
      users: env.NEXT_PUBLIC_FEATURE_USERS,
      teams: env.NEXT_PUBLIC_FEATURE_TEAMS,
      settings: env.NEXT_PUBLIC_FEATURE_SETTINGS
    }
  };
}

/** Shortcut for build-time flags used in layouts/routes. */
export function isMaintenanceMode(): boolean {
  return getConfig().maintenanceMode;
}

export function isAuthEnabled(): boolean {
  return getConfig().auth.enabled;
}
