import { z } from "@hono/zod-openapi";

export const ErrorCodeSchema = z
  .enum([
    "AUTH_REQUIRED",
    "AUTH_INVALID",
    "FORBIDDEN",
    "NOT_FOUND",
    "VALIDATION_FAILED",
    "VERSION_CONFLICT",
    "IDEMPOTENCY_CONFLICT",
    "RATE_LIMITED",
    "QUOTA_EXHAUSTED",
    "FEATURE_UNAVAILABLE",
    "EXTERNAL_SOURCE_UNAVAILABLE",
    "MEDIA_REJECTED",
    "SYNC_CURSOR_EXPIRED",
    "INVITE_INVALID",
    "INVITE_EXPIRED",
    "INTERNAL_ERROR",
  ])
  .openapi("ErrorCode");

export const ErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: ErrorCodeSchema,
        message: z.string().min(1),
        requestId: z.string().min(1),
        details: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  })
  .strict()
  .openapi("ErrorEnvelope");

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
