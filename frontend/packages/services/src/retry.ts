import { type AxiosError, type AxiosRequestConfig } from "axios";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(["get", "head", "options", "put", "delete"]);

/** Per-request retry bookkeeping attached to the axios config. */
export type RetryMetadata = {
  count: number;
  max: number;
  baseDelayMs: number;
};

export type RetryableRequestConfig = AxiosRequestConfig & {
  saas?: { retry?: RetryMetadata };
};

/**
 * Whether a failed request should be retried.
 * Only idempotent methods are retried, and only on transient conditions.
 */
export function isRetryable(
  error: AxiosError,
  config: RetryableRequestConfig | undefined,
  maxRetries: number
): boolean {
  if (!config || maxRetries <= 0) return false;

  const method = (config.method ?? "get").toLowerCase();
  if (!IDEMPOTENT_METHODS.has(method)) return false;

  const retry = config.saas?.retry;
  if (retry && retry.count >= Math.min(retry.max, maxRetries)) return false;

  if (error.response) {
    return RETRYABLE_STATUS.has(error.response.status);
  }

  // Network-level failures (no response) are retryable, except aborts/timeouts.
  if (error.code === "ERR_CANCELED") return false;
  if (error.code === "ECONNABORTED") return false;
  return true;
}

/** Mark one retry attempt for a config. */
export function markRetried(
  config: RetryableRequestConfig,
  max: number,
  baseDelayMs: number
): void {
  const current = config.saas?.retry?.count ?? 0;
  config.saas = config.saas ?? {};
  config.saas.retry = { count: current + 1, max, baseDelayMs };
}

/**
 * Exponential backoff with full jitter: delay = random(0, base * 2^attempt),
 * clamped to [0, maxDelayMs].
 */
export function retryDelayMs(attempt: number, baseDelayMs = 300, maxDelayMs = 8000): number {
  const exponent = Math.min(attempt, 10);
  const cap = Math.min(baseDelayMs * 2 ** exponent, maxDelayMs);
  return Math.floor(Math.random() * (cap + 1));
}
