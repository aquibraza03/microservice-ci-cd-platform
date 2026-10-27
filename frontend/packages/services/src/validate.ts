import type { z } from "zod";

/**
 * Validate an unknown payload against a Zod schema.
 * Used by typed services to keep the backend boundary honest.
 *
 * The schema is widened to `ZodType<Output, any, any>` so schemas whose input
 * shape differs from their output shape (e.g. defaults applied on parse)
 * are accepted — only the parsed OUTPUT is asserted against `T`.
 */
export function validateResponse<T>(schema: z.ZodType<T, any, any>, data: unknown): T {
  return schema.parse(data);
}

export function safeValidateResponse<T>(
  schema: z.ZodType<T, any, any>,
  data: unknown
): { ok: true; data: T } | { ok: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error };
}
