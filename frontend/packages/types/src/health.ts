import { z } from "zod";

/**
 * Contracts mirroring the existing backend services.
 *
 * These map the REAL backend endpoints (auth-service / platform-smoke-test):
 *   GET /health -> { status: "ok" }
 *   GET /ready  -> { ready: true }
 *   GET /env    -> { service, env }
 *   GET /login  -> { message }
 *   else        -> 404 { error }; non-GET -> 405 { error, allowedMethods }
 */

export const HealthResponseSchema = z.object({
  status: z.string()
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ReadinessResponseSchema = z.object({
  ready: z.boolean()
});

export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;

export const EnvResponseSchema = z.object({
  service: z.string(),
  env: z.string()
});

export type EnvResponse = z.infer<typeof EnvResponseSchema>;

export const LoginStubResponseSchema = z.object({
  message: z.string()
});

export type LoginStubResponse = z.infer<typeof LoginStubResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string()
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const MethodNotAllowedResponseSchema = z.object({
  error: z.string(),
  allowedMethods: z.array(z.string())
});

export type MethodNotAllowedResponse = z.infer<typeof MethodNotAllowedResponseSchema>;

/** Backend service connectivity status. */
export type ServiceHealth = {
  service: string;
  healthy: boolean;
  checkedAt: string;
  latencyMs?: number;
  details?: HealthResponse;
};
