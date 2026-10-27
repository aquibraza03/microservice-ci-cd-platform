import { getConfig, type AppConfig } from "@saas/lib";
import { createApiClient, createServices, HttpClient, type ServiceContainer } from "@saas/services";
import { AUTH_EVENTS, createTokenPersistence, TokenManager } from "@saas/features/auth";
import { createDashboardDataSource, type DashboardDataSource } from "@saas/features/dashboard";

export type AppComposition = {
  config: AppConfig;
  services: ServiceContainer;
  tokenManager: TokenManager;
  /** Dashboard data source (http contract or dev sample), selected by config. */
  dashboard: DashboardDataSource;
  search: ServiceContainer["search"];
  notifications: ServiceContainer["notifications"];
  controlPlane: ServiceContainer["controlPlane"];
};

let composition: AppComposition | null = null;

/**
 * Composition root — the single place the frontend's dependency graph is
 * assembled. Safe to build during SSR (no browser access at construction);
 * browser-only behavior is reached lazily through the token manager and the
 * session-expired callback.
 */
export function getAppComposition(): AppComposition {
  if (composition !== null) {
    return composition;
  }

  const config = getConfig();

  // Persistence is provider-aware: dev/guest may use localStorage, production
  // providers keep tokens in memory only (httpOnly-cookie model is the target).
  const tokenManager = new TokenManager(createTokenPersistence(config.auth.provider), () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(AUTH_EVENTS.SESSION_EXPIRED));
    }
  });

  // Auth endpoints never carry a bearer token and never trigger refresh
  // (a 401 there means "bad credentials", not "session expired").
  const authPaths = Object.values(config.auth.endpoints).filter(Boolean) as string[];

  const client = createApiClient({
    baseURL: config.api.baseUrl,
    timeoutMs: config.api.timeoutMs,
    maxRetries: config.api.retries,
    tokenStore: tokenManager,
    authExempt: (request) => {
      const url = request.url ?? "";
      return authPaths.some((endpoint) => url.includes(endpoint));
    },
    onSessionExpired: () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_EVENTS.SESSION_EXPIRED));
      }
    }
  });

  const http = new HttpClient(client);
  const services = createServices(http, config);
  const dashboard = createDashboardDataSource(config.dashboard.source, services);

  composition = {
    config,
    services,
    tokenManager,
    dashboard,
    search: services.search,
    notifications: services.notifications,
    controlPlane: services.controlPlane
  };
  return composition;
}

/** Reset the composition singleton (used by tests). */
export function resetAppComposition(): void {
  composition = null;
}
