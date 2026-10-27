import { z } from "zod";

/**
 * Unified API error contract.
 * Every failing request is normalized into this shape by the API client.
 */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  status: z.number().int().min(100).max(599).nullable().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  cause: z.unknown().optional()
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Well-known machine-readable error codes. */
export const ApiErrorCode = {
  NETWORK: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT_ERROR",
  ABORTED: "REQUEST_ABORTED",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION_ERROR",
  CONFLICT: "CONFLICT",
  SERVER: "SERVER_ERROR",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_REFRESH_FAILED: "TOKEN_REFRESH_FAILED",
  UNAVAILABLE: "UNAVAILABLE",
  UNKNOWN: "UNKNOWN_ERROR"
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
} as const;

export type HttpStatus = (typeof HttpStatus)[keyof typeof HttpStatus];

/** HTTP methods supported by the API client. */
export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "head" | "options";

/** Standard pagination envelope the backend is expected to return. */
export const PaginationSchema = z.object({
  page: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative()
});

export type Pagination = z.infer<typeof PaginationSchema>;

export const PageSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    pagination: PaginationSchema
  });

export type Page<T> = {
  items: T[];
  pagination: Pagination;
};

/** Discriminated async request state used across UI. */
export type RequestStatus = "idle" | "pending" | "success" | "error";

export type AsyncState<T> =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; data: T }
  | { status: "error"; error: ApiError };
