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

const WikidataEntityIdsSchema = z
  .object({
    producer: z
      .string()
      .regex(/^Q[1-9]\d{0,11}$/)
      .optional(),
    region: z
      .string()
      .regex(/^Q[1-9]\d{0,11}$/)
      .optional(),
    wine: z
      .string()
      .regex(/^Q[1-9]\d{0,11}$/)
      .optional(),
  })
  .strict();

export const CreateResearchJobRequestSchema = z
  .object({
    locale: SupportedLocaleSchema,
    maxSources: z.number().int().min(1).max(8).default(4),
    topics: UniqueTopicsSchema,
    wikidataEntityIds: WikidataEntityIdsSchema.default({}),
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

// Disambiguation: before any fact is fetched, the reader is offered the
// matching Wikidata entities for the wine's producer and region, each with its
// description, so "Rioja" the wine region can be told apart from "Rioja" the
// arachnid genus. The reader picks one (or none); only then is it researched.
export const ResearchCandidateSchema = z
  .object({
    description: z.string().max(2_000).nullable(),
    id: z.string().regex(/^Q[1-9]\d{0,11}$/),
    label: z.string().max(300),
  })
  .strict();

export const ResearchCandidateSubjectSchema = z
  .object({
    candidates: z.array(ResearchCandidateSchema).max(5),
    term: z.string().max(300),
  })
  .strict();

export const ResearchCandidatesDataSchema = z
  .object({
    producer: ResearchCandidateSubjectSchema.nullable(),
    region: ResearchCandidateSubjectSchema.nullable(),
  })
  .strict();

export const ResearchCandidatesResponseSchema = z
  .object({ data: ResearchCandidatesDataSchema })
  .strict()
  .openapi("ResearchCandidatesResponse");

export const ResearchCandidatesQuerySchema = z.object({ locale: SupportedLocaleSchema }).strict();

export type CreateResearchJobRequest = z.infer<typeof CreateResearchJobRequestSchema>;
export type ResearchAttempt = z.infer<typeof ResearchAttemptSchema>;
export type ResearchCandidate = z.infer<typeof ResearchCandidateSchema>;
export type ResearchCandidateSubject = z.infer<typeof ResearchCandidateSubjectSchema>;
export type ResearchCandidatesResponse = z.infer<typeof ResearchCandidatesResponseSchema>;
export type ResearchJob = z.infer<typeof ResearchJobSchema>;
export type ResearchJobResponse = z.infer<typeof ResearchJobResponseSchema>;
export type ResearchJobWarning = z.infer<typeof ResearchJobWarningSchema>;
