import { z } from "@hono/zod-openapi";

import {
  ResourceIdSchema,
  ResourceTimestampSchema,
  TernaryChoiceSchema,
  WineSummarySchema,
} from "./wine-memory";

export const TastingOntologyVersionSchema = z.literal("2026.1");
export const TastingScaleSchema = z.number().int().min(1).max(5);
export const SessionStatusSchema = z.enum(["draft", "active", "completed"]);

export const TastingDescriptorInputSchema = z
  .object({
    code: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
    intensity: TastingScaleSchema.optional(),
    phase: z.enum(["appearance", "nose", "palate"]),
  })
  .strict();

export const TastingContextSchema = z
  .object({
    aerationMinutes: z.number().int().min(0).max(10_080).optional(),
    ambientSmellLevel: TastingScaleSchema.optional(),
    bottleCondition: z.string().trim().min(1).max(160).optional(),
    decanted: z.boolean().optional(),
    environment: z
      .enum(["home", "restaurant", "bar", "winery", "class", "event", "outdoors", "other"])
      .optional(),
    foodText: z.string().trim().max(500).optional(),
    glass: z
      .enum([
        "tulip",
        "bordeaux",
        "burgundy",
        "flute",
        "small_wine",
        "tumbler",
        "restaurant_generic",
        "other",
      ])
      .optional(),
    lightLevel: TastingScaleSchema.optional(),
    minutesOpen: z.number().int().min(0).max(10_080).optional(),
    noiseLevel: TastingScaleSchema.optional(),
    openedState: z.enum(["just_opened", "open", "preserved", "unknown"]).optional(),
    palateCleanser: z.string().trim().max(160).optional(),
    preservationMethod: z.string().trim().min(1).max(160).optional(),
    previousSessionWineId: ResourceIdSchema.optional(),
    roomTemperatureTenthsC: z.number().int().min(-100).max(600).optional(),
    servingTemperatureTenthsC: z.number().int().min(-100).max(500).optional(),
  })
  .strict();

export const DeepTastingFieldsSchema = z
  .object({
    acidity: TastingScaleSchema.optional(),
    alcoholPerception: TastingScaleSchema.optional(),
    appearanceClarity: z.enum(["clear", "hazy"]).optional(),
    appearanceColorFamily: z.enum(["white", "rose", "red", "orange", "brown"]).optional(),
    appearanceHue: z.string().trim().min(1).max(80).optional(),
    appearanceIntensity: TastingScaleSchema.optional(),
    appearanceText: z.string().trim().max(2_000).optional(),
    balance: TastingScaleSchema.optional(),
    body: TastingScaleSchema.optional(),
    clientId: ResourceIdSchema.optional(),
    complexity: TastingScaleSchema.optional(),
    conclusionText: z.string().trim().max(2_000).optional(),
    context: TastingContextSchema.optional(),
    descriptors: z.array(TastingDescriptorInputSchema).max(60).default([]),
    expectationResult: z.enum(["below", "met", "above", "unknown"]).optional(),
    finishLength: TastingScaleSchema.optional(),
    flavorIntensity: TastingScaleSchema.optional(),
    memorable: z.boolean().optional(),
    mode: z.literal("deep"),
    noseCondition: z.enum(["clean", "possible_fault"]).optional(),
    noseDevelopment: TastingScaleSchema.optional(),
    noseFreshness: TastingScaleSchema.optional(),
    noseIntensity: TastingScaleSchema.optional(),
    noseText: z.string().trim().max(2_000).optional(),
    pairingSuccess: TastingScaleSchema.optional(),
    palateText: z.string().trim().max(2_000).optional(),
    palateTexture: z.enum(["lean", "round", "creamy", "oily", "other"]).optional(),
    perceivedValue: TastingScaleSchema.optional(),
    rimEvolution: TastingScaleSchema.optional(),
    score100: z.number().int().min(0).max(100).optional(),
    sentiment: z.enum(["dislike", "neutral", "like"]).optional(),
    sessionWineId: ResourceIdSchema.nullable().optional(),
    state: z.enum(["draft", "submitted"]),
    sweetness: TastingScaleSchema.optional(),
    tanninLevel: TastingScaleSchema.optional(),
    tanninTexture: z.enum(["silky", "fine", "grippy", "coarse"]).optional(),
    tastedAt: ResourceTimestampSchema,
    tastingConfidence: TastingScaleSchema.optional(),
    viscosity: TastingScaleSchema.optional(),
    wineId: ResourceIdSchema,
    wouldBuy: TernaryChoiceSchema.optional(),
    wouldDrinkAgain: TernaryChoiceSchema.optional(),
  })
  .strict();

export const DeepTastingRequestSchema = DeepTastingFieldsSchema.openapi("DeepTastingRequest");

export const DeepTastingNoteSchema = DeepTastingFieldsSchema.omit({ clientId: true })
  .extend({
    authorUserId: ResourceIdSchema,
    context: TastingContextSchema.nullable(),
    createdAt: ResourceTimestampSchema,
    id: ResourceIdSchema,
    ontologyVersion: TastingOntologyVersionSchema,
    sessionWineId: ResourceIdSchema.nullable(),
    updatedAt: ResourceTimestampSchema,
    version: z.number().int().positive(),
  })
  .strict();

export const DeepTastingResponseSchema = z
  .object({ data: DeepTastingNoteSchema })
  .strict()
  .openapi("DeepTastingResponse");

export const UpdateDeepTastingRequestSchema = DeepTastingFieldsSchema.omit({
  clientId: true,
  context: true,
  descriptors: true,
  mode: true,
  sessionWineId: true,
  state: true,
  wineId: true,
})
  .partial()
  .extend({
    context: TastingContextSchema.optional(),
    descriptors: z.array(TastingDescriptorInputSchema).max(60).optional(),
    version: z.number().int().positive(),
  })
  .strict()
  .openapi("UpdateDeepTastingRequest");

export const SubmitTastingRequestSchema = z
  .object({ version: z.number().int().positive() })
  .strict()
  .openapi("SubmitTastingRequest");

export const CreateTastingSessionRequestSchema = z
  .object({
    clientId: ResourceIdSchema.optional(),
    description: z.string().trim().max(2_000).optional(),
    endsAt: ResourceTimestampSchema.optional(),
    name: z.string().trim().min(1).max(160),
    startsAt: ResourceTimestampSchema,
    status: SessionStatusSchema.default("draft"),
    venueText: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine(
    (value: { endsAt?: string; startsAt: string }) =>
      value.endsAt === undefined || value.endsAt >= value.startsAt,
    {
      message: "The session end must not precede its start.",
      path: ["endsAt"],
    },
  )
  .openapi("CreateTastingSessionRequest");

export const TastingSessionSchema = z
  .object({
    createdAt: ResourceTimestampSchema,
    createdByUserId: ResourceIdSchema,
    description: z.string().nullable(),
    endsAt: ResourceTimestampSchema.nullable(),
    id: ResourceIdSchema,
    name: z.string(),
    startsAt: ResourceTimestampSchema,
    status: SessionStatusSchema,
    submittedNoteCount: z.number().int().nonnegative(),
    venueText: z.string().nullable(),
    version: z.number().int().positive(),
    wineCount: z.number().int().nonnegative(),
  })
  .strict();

export const TastingSessionResponseSchema = z
  .object({ data: TastingSessionSchema })
  .strict()
  .openapi("TastingSessionResponse");

export const TastingSessionListResponseSchema = z
  .object({ data: z.array(TastingSessionSchema) })
  .strict()
  .openapi("TastingSessionListResponse");

export const AddSessionWinesRequestSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            clientId: ResourceIdSchema.optional(),
            servingLabel: z.string().trim().min(1).max(160).optional(),
            wineId: ResourceIdSchema,
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .openapi("AddSessionWinesRequest");

export const ReorderSessionWinesRequestSchema = z
  .object({ orderedSessionWineIds: z.array(ResourceIdSchema).min(1).max(50) })
  .strict()
  .openapi("ReorderSessionWinesRequest");

export const SessionWineSchema = z
  .object({
    id: ResourceIdSchema,
    ownNoteId: ResourceIdSchema.nullable(),
    ownNoteState: z.enum(["draft", "submitted"]).nullable(),
    position: z.number().int().nonnegative(),
    servingLabel: z.string().nullable(),
    submittedNoteCount: z.number().int().nonnegative(),
    version: z.number().int().positive(),
    wine: WineSummarySchema,
  })
  .strict();

export const TastingSessionDetailResponseSchema = z
  .object({
    data: z.object({ session: TastingSessionSchema, wines: z.array(SessionWineSchema) }).strict(),
  })
  .strict()
  .openapi("TastingSessionDetailResponse");

export const SessionComparisonParticipantSchema = z
  .object({
    authorUserId: ResourceIdSchema,
    displayName: z.string(),
    score100: z.number().int().min(0).max(100).nullable(),
    wouldBuy: TernaryChoiceSchema.nullable(),
  })
  .strict();

export const SessionWineComparisonSchema = z
  .object({
    buyAgainCount: z.number().int().nonnegative(),
    descriptorOverlap: z.array(z.string()),
    dispersion: z.number().nonnegative().nullable(),
    groupScore: z.number().min(0).max(100).nullable(),
    noteCount: z.number().int().nonnegative(),
    participants: z.array(SessionComparisonParticipantSchema),
    rank: z.number().int().positive().nullable(),
    sessionWineId: ResourceIdSchema,
    wineId: ResourceIdSchema,
  })
  .strict();

export const SessionComparisonResponseSchema = z
  .object({
    data: z
      .object({
        algorithmVersion: TastingOntologyVersionSchema,
        mostDivisiveSessionWineId: ResourceIdSchema.nullable(),
        sessionId: ResourceIdSchema,
        wines: z.array(SessionWineComparisonSchema),
      })
      .strict(),
  })
  .strict()
  .openapi("SessionComparisonResponse");

export const SessionIdPathSchema = z
  .object({
    sessionId: ResourceIdSchema.openapi({ param: { in: "path", name: "sessionId" } }),
    spaceId: ResourceIdSchema.openapi({ param: { in: "path", name: "spaceId" } }),
  })
  .strict();

export const TastingNoteIdPathSchema = z
  .object({
    noteId: ResourceIdSchema.openapi({ param: { in: "path", name: "noteId" } }),
    spaceId: ResourceIdSchema.openapi({ param: { in: "path", name: "spaceId" } }),
  })
  .strict();

export type AddSessionWinesRequest = z.infer<typeof AddSessionWinesRequestSchema>;
export type CreateTastingSessionRequest = z.infer<typeof CreateTastingSessionRequestSchema>;
export type DeepTastingNote = z.infer<typeof DeepTastingNoteSchema>;
export type DeepTastingRequest = z.infer<typeof DeepTastingRequestSchema>;
export type SessionComparisonResponse = z.infer<typeof SessionComparisonResponseSchema>;
export type TastingSessionDetailResponse = z.infer<typeof TastingSessionDetailResponseSchema>;
export type TastingSessionResponse = z.infer<typeof TastingSessionResponseSchema>;
export type UpdateDeepTastingRequest = z.infer<typeof UpdateDeepTastingRequestSchema>;
