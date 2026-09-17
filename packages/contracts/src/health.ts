import { z } from "@hono/zod-openapi";

export const HealthResponseSchema = z
  .object({
    data: z
      .object({
        status: z.literal("ok"),
        service: z.literal("vadevi-api"),
        version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i),
        timestamp: z.string().datetime({ offset: true }),
      })
      .strict(),
  })
  .strict()
  .openapi("HealthResponse");

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
