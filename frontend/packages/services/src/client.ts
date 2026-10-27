import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { logger } from "@saas/lib";
import { toApiError } from "./errors";
import { isRetryable, markRetried, retryDelayMs, type RetryableRequestConfig } from "./retry";
import { RefreshCoordinator } from "./refresh";
import type { TokenStore } from "./token-store";

type AugmentedConfig = InternalAxiosRequestConfig & {
  _saasRefreshed?: boolean;
};

export type ApiClientOptions = {
  baseURL: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  tokenStore?: TokenStore;
  /** Requests matching this predicate skip auth headers and 401-refresh handling. */
  authExempt?: (config: InternalAxiosRequestConfig) => boolean;
  /** Invoked when a session cannot be restored after a refresh failure. */
  onSessionExpired?: () => void;
  headers?: Record<string, string>;
};

/**
 * Build the single configured Axios instance for the application.
 *
 * Responsibilities:
 * - Auth middleware: attach `Authorization: Bearer <token>` to every request.
 * - Automatic token refresh: on 401, run a single-flight refresh and replay
 *   the request once.
 * - Retry strategy: bounded exponential backoff for transient failures on
 *   idempotent methods.
 * - Timeout strategy: default timeout from config, overridable per request.
 * - Abort support: native `signal` passthrough (AbortController).
 * - Unified error handling: every rejection is a normalized `ApiError`.
 */
export function createApiClient(options: ApiClientOptions): AxiosInstance {
  const { baseURL, timeoutMs = 15000, maxRetries = 2, retryBaseDelayMs = 300 } = options;

  const tokenStore = options.tokenStore;
  const authExempt = options.authExempt ?? (() => false);

  const client = axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const coordinator = tokenStore ? new RefreshCoordinator(() => tokenStore.refresh()) : null;

  client.interceptors.request.use((config) => {
    if (authExempt(config)) return config;

    const token = tokenStore?.getAccessToken();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const config = error.config as AugmentedConfig | undefined;

      // Aborts are never retried or refreshed.
      if (error.code === "ERR_CANCELED") {
        return Promise.reject(toApiError(error));
      }

      // 401 → single-flight refresh, then replay the request once.
      if (
        config &&
        !config._saasRefreshed &&
        coordinator &&
        !authExempt(config) &&
        error.response?.status === 401
      ) {
        config._saasRefreshed = true;
        logger.debug("api: 401 received, refreshing session", { url: config.url });
        try {
          await coordinator.refresh();
          return client.request(config);
        } catch (refreshError) {
          logger.warn("api: session refresh failed", { url: config.url });
          options.onSessionExpired?.();
          return Promise.reject(toApiError(refreshError));
        }
      }

      // Transient failure → bounded retry with jittered backoff.
      if (config && isRetryable(error, config as RetryableRequestConfig, maxRetries)) {
        const retryConfig = config as RetryableRequestConfig;
        const attempt = retryConfig.saas?.retry?.count ?? 0;
        markRetried(retryConfig, maxRetries, retryBaseDelayMs);
        logger.debug("api: retrying request", { url: config.url, attempt: attempt + 1 });
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelayMs(attempt, retryBaseDelayMs))
        );
        return client.request(config);
      }

      return Promise.reject(toApiError(error));
    }
  );

  return client;
}
