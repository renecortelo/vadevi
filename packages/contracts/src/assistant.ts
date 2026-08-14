import { z } from "@hono/zod-openapi";

import { EvidenceClassSchema, FactConflictSchema, FactSchema, SourceSchema } from "./provenance";
import { SupportedLocaleSchema } from "./session";
import { ResourceIdSchema, WineSummarySchema } from "./wine-memory";

const UniqueSpaceIdsSchema = z
  .array(ResourceIdSchema)
  .max(8)
  .refine((ids: string[]) => new Set(ids).size === ids.length, "Space IDs must be unique.");

export const AssistantTurnRequestSchema = z
  .object({
    context: z
      .object({
        allowedCrossSpaceIds: UniqueSpaceIdsSchema,
        visibleWineId: ResourceIdSchema.nullable(),
      })
      .strict(),
    locale: SupportedLocaleSchema,
    message: z.string().trim().min(1).max(500),
    saveHistory: z.literal(false),
    threadId: z.null(),
  })
  .strict()
  .openapi("AssistantTurnRequest");

export const AssistantEvidenceChipSchema = z
  .object({
    evidenceClass: EvidenceClassSchema,
    label: z.string().min(1).max(200),
    sampleSize: z.number().int().nonnegative().nullable(),
    sourceIds: z.array(ResourceIdSchema).max(8),
  })
  .strict();

export const AssistantRenderedClaimSchema = z
  .object({
    evidenceClass: EvidenceClassSchema,
    sampleSize: z.number().int().nonnegative().nullable(),
    sourceIds: z.array(ResourceIdSchema).max(8),
    text: z.string().min(1).max(500),
  })
  .strict();

export const AssistantSearchResultSchema = z
  .object({
    spaceId: ResourceIdSchema,
    spaceName: z.string().min(1).max(120),
    wine: WineSummarySchema,
  })
  .strict();

export const AssistantWineContextSchema = z
  .object({
    conflicts: z.array(FactConflictSchema).max(25),
    facts: z.array(FactSchema).max(50),
    spaceId: ResourceIdSchema,
    wineId: ResourceIdSchema,
  })
  .strict();

export const AssistantTasteProfileSchema = z
  .object({
    averageScore: z.number().min(0).max(100).nullable(),
    confidence: z.enum(["insufficient", "low", "medium", "high"]),
    descriptorCodes: z.array(z.string().min(1).max(100)).max(10),
    minimumSubmittedNotes: z.literal(3),
    sampleSize: z.number().int().nonnegative(),
    subject: z.literal("current_user"),
    wouldBuyYesCount: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const AssistantWineComparisonSchema = z
  .object({
    factual: z
      .object({
        noteCount: z.number().int().nonnegative(),
        region: z.string().nullable(),
        score100: z.number().int().min(0).max(100).nullable(),
        vintageYear: z.number().int().min(1800).max(2200).nullable(),
        wineType: z.string().nullable(),
      })
      .strict(),
    personal: z
      .object({
        averageScore: z.number().min(0).max(100).nullable(),
        confidence: z.enum(["insufficient", "low", "medium", "high"]),
        sampleSize: z.number().int().nonnegative(),
      })
      .strict(),
    spaceId: ResourceIdSchema,
    wineId: ResourceIdSchema,
    wineName: z.string().min(1).max(200),
  })
  .strict();

const ToolStatusSchema = z.enum(["available", "disabled", "unavailable"]);

export const AssistantTurnResponseSchema = z
  .object({
    data: z
      .object({
        citations: z.array(SourceSchema).max(8),
        comparisons: z.array(AssistantWineComparisonSchema).max(6),
        evidence: z.array(AssistantEvidenceChipSchema).max(8),
        mode: z.enum(["deterministic", "provider"]),
        renderedClaims: z.array(AssistantRenderedClaimSchema).max(8),
        renderedText: z.string().min(1).max(2_000),
        results: z.array(AssistantSearchResultSchema).max(25),
        tasteProfile: AssistantTasteProfileSchema.nullable(),
        threadId: ResourceIdSchema.nullable(),
        toolAvailability: z
          .object({
            ai: ToolStatusSchema,
            externalResearch: ToolStatusSchema,
            compareWines: ToolStatusSchema,
            getTasteProfile: ToolStatusSchema,
            getWineContext: ToolStatusSchema,
            researchWine: ToolStatusSchema,
            searchMemory: ToolStatusSchema,
          })
          .strict(),
        turnId: ResourceIdSchema,
        usage: z
          .object({
            externalResearchCalls: z.number().int().min(0).max(2),
            maxExternalResearchCalls: z.literal(2),
            maxToolCalls: z.literal(6),
            toolCalls: z.number().int().min(0).max(6),
          })
          .strict(),
        warnings: z
          .array(
            z.enum(["ai_disabled", "deterministic_search", "no_matches", "provider_unavailable"]),
          )
          .max(4),
        wineContext: AssistantWineContextSchema.nullable(),
      })
      .strict(),
  })
  .strict()
  .openapi("AssistantTurnResponse");

export type AssistantTurnRequest = z.infer<typeof AssistantTurnRequestSchema>;
export type AssistantTurnResponse = z.infer<typeof AssistantTurnResponseSchema>;
export type AssistantEvidenceChip = z.infer<typeof AssistantEvidenceChipSchema>;
export type AssistantRenderedClaim = z.infer<typeof AssistantRenderedClaimSchema>;
export type AssistantSearchResult = z.infer<typeof AssistantSearchResultSchema>;
export type AssistantTasteProfile = z.infer<typeof AssistantTasteProfileSchema>;
export type AssistantWineComparison = z.infer<typeof AssistantWineComparisonSchema>;
export type AssistantWineContext = z.infer<typeof AssistantWineContextSchema>;
