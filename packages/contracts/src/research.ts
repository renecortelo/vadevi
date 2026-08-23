import { z } from "@hono/zod-openapi";

import { SupportedLocaleSchema } from "./session";
import { ResourceIdSchema, ResourceTimestampSchema } from "./wine-memory";

export const ResearchTopicSchema = z.enum([
  "identity",
  "grapes",
  "region",
  "producer",
  "production",
  "curiosities",
  "further_reading",
]);

const UniqueTopicsSchema = z
  .array(ResearchTopicSchema)
  .min(1)
  .max(7)
  .refine((topics: string[]) => new Set(topics).size === topics.length, "Topics must be unique.");

export const CreateResearchJobRequestSchema = z
  .object({
    locale: SupportedLocaleSchema,
    maxSources: z.number().int().min(1).max(8).default(4),
    topics: UniqueTopicsSchema,
  })
  .strict()
  .openapi("CreateResearchJobRequest");

export const ResearchAttemptSchema = z
  .object({
    cached: z.boolean().nullable(),
    provider: z.enum(["open_food_facts", "web_search", "wikidata"]),
    reason: z
      .enum([
        "invalid_input",
        "not_found",
        "provider_error",
        "rate_limited",
        "timeout",
        "unsafe_redirect",
      ])
      .nullable(),
    retryAfterSeconds: z.number().int().nonnegative().nullable(),
    status: z.enum(["success", "unavailable"]),
  })
  .strict();

export const ResearchJobWarningSchema = z.enum([
  "provider_disabled",
  "missing_barcode",
  "missing_wikidata_entity",
  "no_results",
  "partial_results",
  "source_limit_reached",
]);

export const ResearchJobSchema = z
  .object({
    attempts: z.array(ResearchAttemptSchema).max(16),
    completedAt: ResourceTimestampSchema.nullable(),
    createdAt: ResourceTimestampSchema,
    factIds: z.array(ResourceIdSchema),
    id: ResourceIdSchema,
    locale: SupportedLocaleSchema,
    providerMode: z.enum(["none", "open_data"]),
    sourceIds: z.array(ResourceIdSchema),
    status: z.enum(["running", "completed", "degraded", "failed"]),
    topics: UniqueTopicsSchema,
    warnings: z.array(ResearchJobWarningSchema).max(6),
    wineId: ResourceIdSchema,
  })
  .strict();

export const ResearchJobResponseSchema = z
  .object({ data: ResearchJobSchema })
  .strict()
  .openapi("ResearchJobResponse");

export const ResearchJobPathSchema = z
  .object({
    jobId: ResourceIdSchema.openapi({ param: { in: "path", name: "jobId" } }),
    spaceId: ResourceIdSchema.openapi({ param: { in: "path", name: "spaceId" } }),
  })
  .strict();

// Rewriting the narrative from the facts that survive is its own small command:
// it needs no body, and answers only whether a fresh paragraph now exists.
export const RegenerateNarrativeRequestSchema = z
  .object({ locale: SupportedLocaleSchema })
  .strict()
  .openapi("RegenerateNarrativeRequest");

export const RegenerateNarrativeResponseSchema = z
  .object({ data: z.object({ status: z.enum(["regenerated", "no_material"]) }).strict() })
  .strict()
  .openapi("RegenerateNarrativeResponse");

export type CreateResearchJobRequest = z.infer<typeof CreateResearchJobRequestSchema>;
export type RegenerateNarrativeRequest = z.infer<typeof RegenerateNarrativeRequestSchema>;
export type RegenerateNarrativeResponse = z.infer<typeof RegenerateNarrativeResponseSchema>;
export type ResearchAttempt = z.infer<typeof ResearchAttemptSchema>;
export type ResearchJob = z.infer<typeof ResearchJobSchema>;
export type ResearchJobResponse = z.infer<typeof ResearchJobResponseSchema>;
export type ResearchJobWarning = z.infer<typeof ResearchJobWarningSchema>;
