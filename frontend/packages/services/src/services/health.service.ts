import type { HttpClient } from "../http";
import {
  EnvResponseSchema,
  HealthResponseSchema,
  ReadinessResponseSchema,
  type EnvResponse,
  type HealthResponse,
  type ReadinessResponse
} from "@saas/types";

/**
 * Typed service for the real backend health endpoints (control-plane-api,
 * mounted under the configured /api base as /api/v1/...):
 *   GET /v1/health -> { status }
 *   GET /v1/ready  -> { ready }
 */
export interface HealthService {
  getHealth(): Promise<HealthResponse>;
  getReady(): Promise<ReadinessResponse>;
  getEnv(): Promise<EnvResponse>;
  /** Check both health and readiness, returning a composite status. */
  check(): Promise<{ health: HealthResponse; ready: ReadinessResponse }>;
}

export function createHealthService(http: HttpClient): HealthService {
  return {
    getHealth: () => http.get<HealthResponse>("/v1/health", { schema: HealthResponseSchema }),
    getReady: () => http.get<ReadinessResponse>("/v1/ready", { schema: ReadinessResponseSchema }),
    getEnv: () => http.get<EnvResponse>("/env", { schema: EnvResponseSchema }),
    check: async () => {
      const [health, ready] = await Promise.all([
        http.get<HealthResponse>("/v1/health"),
        http.get<ReadinessResponse>("/v1/ready")
      ]);
      return { health, ready };
    }
  };
}
