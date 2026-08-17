import { z } from "@hono/zod-openapi";

import { SupportedLocaleSchema } from "./session";

export const ResourceIdSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
export const ResourceTimestampSchema = z.string().datetime({ offset: true });
export const WineTypeSchema = z.enum([
  "red",
  "white",
  "rose",
  "sparkling",
  "fortified",
  "orange",
  "other",
]);
export const TernaryChoiceSchema = z.enum(["yes", "no", "unsure"]);

const CreateWineFieldsSchema = z
  .object({
    appellation: z.string().trim().min(1).max(160).optional(),
    barcode: z
      .string()
      .regex(/^\d{8,14}$/)
      .optional(),
    bottleSizeMl: z.number().int().min(50).max(20_000).optional(),
    clientId: ResourceIdSchema.optional(),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    displayName: z.string().trim().min(1).max(160),
    identityStatus: z.enum(["draft", "confirmed", "needs_review"]),
    mediaId: ResourceIdSchema.optional(),
    nonVintage: z.boolean().default(false),
    producerName: z.string().trim().min(1).max(160),
    region: z.string().trim().min(1).max(160).optional(),
    styleText: z.string().trim().min(1).max(500).optional(),
    vintageYear: z.number().int().min(1000).max(2100).nullable().optional(),
    wineType: WineTypeSchema.optional(),
  })
  .strict();

function validateVintage(
  value: { nonVintage: boolean; vintageYear?: number | null },
  context: z.RefinementCtx,
) {
  if (value.nonVintage && value.vintageYear != null) {
    context.addIssue({ code: "custom", message: "A non-vintage wine cannot have a vintage year." });
  }
}

export const CreateWineRequestSchema = CreateWineFieldsSchema.superRefine(
  (value: { nonVintage: boolean; vintageYear?: number | null }, context: z.RefinementCtx) => {
    validateVintage(value, context);
  },
).openapi("CreateWineRequest");

/**
 * Correcting a wine after it exists.
 *
 * A bottle logged in a restaurant is logged in a hurry: the vintage guessed, the
 * producer half-read, no photograph. Until now the only way to change any of
 * that was to log it again, which leaves two wines where there is one bottle.
 *
 * Every field is optional and `undefined` means "leave it": a screen that edits
 * one field must not silently clear the four it did not show. `version` is the
 * same optimistic lock the bottle and wishlist updates use, so two people
 * editing the same wine get a conflict rather than one of them winning quietly.
 */
export const UpdateWineRequestSchema = z
  .object({
    appellation: z.string().trim().min(1).max(160).nullable().optional(),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .nullable()
      .optional(),
    displayName: z.string().trim().min(1).max(160).optional(),
    identityStatus: z.enum(["draft", "confirmed", "needs_review"]).optional(),
    /** The label photograph, which a hurried entry rarely has. */
    mediaId: ResourceIdSchema.nullable().optional(),
    nonVintage: z.boolean().optional(),
    producerName: z.string().trim().min(1).max(160).optional(),
    region: z.string().trim().min(1).max(160).nullable().optional(),
    styleText: z.string().trim().min(1).max(500).nullable().optional(),
    version: z.number().int().positive(),
    vintageYear: z.number().int().min(1000).max(2100).nullable().optional(),
    wineType: WineTypeSchema.nullable().optional(),
  })
  .strict()
  .superRefine(
    (value: { nonVintage?: boolean; vintageYear?: number | null }, context: z.RefinementCtx) => {
      validateVintage({ nonVintage: value.nonVintage ?? false, ...value }, context);
    },
  )
  .openapi("UpdateWineRequest");

export type UpdateWineRequest = z.infer<typeof UpdateWineRequestSchema>;

export const WineSummarySchema = z
  .object({
    appellation: z.string().nullable(),
    countryCode: z.string().nullable(),
    createdAt: ResourceTimestampSchema,
    displayName: z.string(),
    id: ResourceIdSchema,
    identityStatus: z.enum(["draft", "confirmed", "needs_review"]),
    lastTastedAt: ResourceTimestampSchema.nullable(),
    mediaId: ResourceIdSchema.nullable(),
    noteCount: z.number().int().nonnegative(),
    nonVintage: z.boolean(),
    producerName: z.string(),
    region: z.string().nullable(),
    score100: z.number().int().min(0).max(100).nullable(),
    vintageYear: z.number().int().nullable(),
    version: z.number().int().positive(),
    wineType: WineTypeSchema.nullable(),
  })
  .strict();

export const CreateWineResponseSchema = z
  .object({
    data: z
      .object({
        possibleDuplicates: z.array(WineSummarySchema),
        wine: WineSummarySchema,
      })
      .strict(),
  })
  .strict()
  .openapi("CreateWineResponse");

/**
 * One wine, on its own.
 *
 * Creation answers with the duplicates it noticed; a correction has nothing to
 * propose, so it says so by having a shape of its own rather than sending an
 * empty list to satisfy a schema built for a different question.
 */
export const WineResponseSchema = z
  .object({ data: z.object({ wine: WineSummarySchema }).strict() })
  .strict()
  .openapi("WineResponse");

export type WineResponse = z.infer<typeof WineResponseSchema>;

export const WineMemoryResponseSchema = z
  .object({
    data: z.array(WineSummarySchema),
    page: z
      .object({
        hasMore: z.boolean(),
        nextCursor: z.string().nullable(),
      })
      .strict(),
  })
  .strict()
  .openapi("WineMemoryResponse");

export const WineMemorySortSchema = z.enum(["recent", "tasted", "score", "name"]);

export const WineMemoryQuerySchema = z
  .object({
    countryCode: z
      .string()
      .regex(/^[A-Za-z]{2}$/)
      .optional(),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    grape: z.string().trim().max(120).optional(),
    hasMedia: z.enum(["true", "false"]).optional(),
    identityStatus: z.enum(["draft", "confirmed", "needs_review"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    maxScore: z.coerce.number().int().min(0).max(100).optional(),
    minScore: z.coerce.number().int().min(0).max(100).optional(),
    query: z.string().trim().max(120).optional(),
    region: z.string().trim().max(160).optional(),
    sentiment: z.enum(["dislike", "neutral", "like"]).optional(),
    sort: WineMemorySortSchema.default("recent"),
    tastedFrom: ResourceTimestampSchema.optional(),
    tastedTo: ResourceTimestampSchema.optional(),
    vintageFrom: z.coerce.number().int().min(1000).max(2100).optional(),
    vintageTo: z.coerce.number().int().min(1000).max(2100).optional(),
    wineType: WineTypeSchema.optional(),
  })
  .strict()
  .superRefine(
    (
      value: {
        maxScore?: number;
        minScore?: number;
        tastedFrom?: string;
        tastedTo?: string;
        vintageFrom?: number;
        vintageTo?: number;
      },
      context: z.RefinementCtx,
    ) => {
      if (
        value.minScore !== undefined &&
        value.maxScore !== undefined &&
        value.minScore > value.maxScore
      ) {
        context.addIssue({
          code: "custom",
          message: "minScore cannot exceed maxScore.",
          path: ["minScore"],
        });
      }
      if (
        value.vintageFrom !== undefined &&
        value.vintageTo !== undefined &&
        value.vintageFrom > value.vintageTo
      ) {
        context.addIssue({
          code: "custom",
          message: "vintageFrom cannot exceed vintageTo.",
          path: ["vintageFrom"],
        });
      }
      if (
        value.tastedFrom !== undefined &&
        value.tastedTo !== undefined &&
        Date.parse(value.tastedFrom) > Date.parse(value.tastedTo)
      ) {
        context.addIssue({
          code: "custom",
          message: "tastedFrom cannot be later than tastedTo.",
          path: ["tastedFrom"],
        });
      }
    },
  );

export const MergeWinesRequestSchema = z
  .object({
    confirm: z.literal(true),
    sourceWineId: ResourceIdSchema,
    sourceVersion: z.number().int().positive(),
    targetVersion: z.number().int().positive(),
  })
  .strict()
  .openapi("MergeWinesRequest");

export const MergeWinesResponseSchema = z
  .object({
    data: z
      .object({
        merged: z
          .object({
            aliasesAdded: z.number().int().nonnegative(),
            bottles: z.number().int().nonnegative(),
            facts: z.number().int().nonnegative(),
            mediaLinks: z.number().int().nonnegative(),
            priceObservations: z.number().int().nonnegative(),
            purchases: z.number().int().nonnegative(),
            tastingNotes: z.number().int().nonnegative(),
            wishlistItems: z.number().int().nonnegative(),
          })
          .strict(),
        replayed: z.boolean(),
        sourceWineId: ResourceIdSchema,
        wine: WineSummarySchema,
      })
      .strict(),
  })
  .strict()
  .openapi("MergeWinesResponse");

export const QuickTastingRequestSchema = z
  .object({
    clientId: ResourceIdSchema.optional(),
    comment: z.string().trim().max(2_000).optional(),
    descriptorCodes: z
      .array(z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/))
      .max(3)
      .default([]),
    foodText: z.string().trim().max(500).optional(),
    mode: z.literal("quick"),
    score100: z.number().int().min(0).max(100).optional(),
    sentiment: z.enum(["dislike", "neutral", "like"]).optional(),
    state: z.enum(["draft", "submitted"]),
    tastedAt: ResourceTimestampSchema,
    wineId: ResourceIdSchema,
    wouldBuy: TernaryChoiceSchema.optional(),
    wouldDrinkAgain: TernaryChoiceSchema.optional(),
  })
  .strict()
  .openapi("QuickTastingRequest");

export const TastingNoteSchema = z
  .object({
    comment: z.string().nullable(),
    descriptorCodes: z.array(z.string()),
    foodText: z.string().nullable(),
    id: ResourceIdSchema,
    mode: z.literal("quick"),
    score100: z.number().int().min(0).max(100).nullable(),
    sentiment: z.enum(["dislike", "neutral", "like"]).nullable(),
    state: z.enum(["draft", "submitted"]),
    tastedAt: ResourceTimestampSchema,
    version: z.number().int().positive(),
    wineId: ResourceIdSchema,
    wouldBuy: TernaryChoiceSchema.nullable(),
    wouldDrinkAgain: TernaryChoiceSchema.nullable(),
  })
  .strict();

export const TastingNoteResponseSchema = z
  .object({ data: TastingNoteSchema })
  .strict()
  .openapi("TastingNoteResponse");

export const MediaReservationRequestSchema = z
  .object({
    byteSize: z
      .number()
      .int()
      .min(1)
      .max(5 * 1024 * 1024),
    height: z.number().int().min(1).max(2048),
    kind: z.enum(["label", "receipt", "shelf", "avatar", "other"]),
    mimeType: z.enum(["image/jpeg", "image/webp"]),
    sha256: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    width: z.number().int().min(1).max(2048),
  })
  .strict()
  .openapi("MediaReservationRequest");

export const MediaAssetSchema = z
  .object({
    byteSize: z.number().int().positive(),
    createdAt: ResourceTimestampSchema,
    height: z.number().int().positive(),
    id: ResourceIdSchema,
    kind: z.enum(["label", "receipt", "shelf", "avatar", "other"]),
    mimeType: z.enum(["image/jpeg", "image/webp"]),
    processingStatus: z.enum(["reserved", "ready", "rejected"]),
    width: z.number().int().positive(),
  })
  .strict();

export const MediaReservationResponseSchema = z
  .object({
    data: z
      .object({
        media: MediaAssetSchema,
        uploadPath: z
          .string()
          .regex(
            /^\/api\/v1\/spaces\/[0-9A-HJKMNP-TV-Z]{26}\/media\/[0-9A-HJKMNP-TV-Z]{26}\/content$/,
          ),
      })
      .strict(),
  })
  .strict()
  .openapi("MediaReservationResponse");

export const MediaUploadResponseSchema = z
  .object({ data: z.object({ media: MediaAssetSchema }).strict() })
  .strict()
  .openapi("MediaUploadResponse");

export const IdentificationRequestSchema = z
  .object({
    barcode: z
      .string()
      .regex(/^\d{8,14}$/)
      .optional(),
    locale: SupportedLocaleSchema,
    manualHint: z.string().trim().max(500).optional(),
    mediaId: ResourceIdSchema.optional(),
    /** Text a client-side reader lifted off the label. Never a raw image. */
    scannedText: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .refine(
    (value: { barcode?: string; manualHint?: string; mediaId?: string; scannedText?: string }) =>
      value.barcode !== undefined ||
      value.mediaId !== undefined ||
      value.manualHint !== undefined ||
      value.scannedText !== undefined,
    { message: "Provide a barcode, a processed photo, scanned text, or a manual hint." },
  )
  .openapi("IdentificationRequest");

/**
 * How much the application trusts a proposed field. These are deliberately
 * qualitative: §21 rules out presenting an uncalibrated numeric match score.
 */
export const CandidateConfidenceSchema = z.enum(["high", "medium", "low"]);

/**
 * Where a proposed field came from, reusing the evidence vocabulary the rest of
 * the application already displays.
 */
export const CandidateEvidenceSchema = z.enum(["observed", "researched", "inferred", "personal"]);

const CandidateFieldSchema = <T extends z.ZodTypeAny>(value: T) =>
  z
    .object({
      confidence: CandidateConfidenceSchema,
      evidence: CandidateEvidenceSchema,
      sourceIds: z.array(ResourceIdSchema).default([]),
      value,
    })
    .strict();

export const IdentificationCandidateSchema = z
  .object({
    candidateId: z.string().min(1).max(100),
    fields: z
      .object({
        countryCode: CandidateFieldSchema(z.string().regex(/^[A-Z]{2}$/)).optional(),
        displayName: CandidateFieldSchema(z.string().min(1).max(160)).optional(),
        producerName: CandidateFieldSchema(z.string().min(1).max(160)).optional(),
        region: CandidateFieldSchema(z.string().min(1).max(160)).optional(),
        vintageYear: CandidateFieldSchema(z.number().int().min(1000).max(2100)).optional(),
        wineType: CandidateFieldSchema(WineTypeSchema).optional(),
      })
      .strict(),
    /** An existing Space wine this candidate came from, when it was a match. */
    matchedWineId: ResourceIdSchema.nullable().default(null),
    origin: z.enum(["space_barcode", "space_text", "open_food_facts", "ocr"]),
    possibleDuplicateWineIds: z.array(ResourceIdSchema).default([]),
  })
  .strict();

/**
 * Why an identification came back thinner than hoped, as codes rather than
 * prose.
 *
 * The server used to send English sentences straight to the screen, which meant
 * a Spanish interface reading an English apology — and one of them repeated a
 * line the client already showed in the reader's own language. A code is
 * translated where the reader is.
 */
export const IdentificationWarningSchema = z
  .enum([
    "label_unreadable",
    "label_reading_disabled",
    "label_text_ignored",
    "product_lookup_empty",
    "product_lookup_disabled",
    "no_candidates",
  ])
  .openapi("IdentificationWarning");

export type IdentificationWarning = z.infer<typeof IdentificationWarningSchema>;

export const IdentificationResponseSchema = z
  .object({
    data: z
      .object({
        candidates: z.array(IdentificationCandidateSchema),
        expiresAt: ResourceTimestampSchema,
        id: ResourceIdSchema,
        /** `manual_required` whenever nothing could be proposed. */
        status: z.enum(["needs_confirmation", "manual_required"]),
        warnings: z.array(IdentificationWarningSchema).max(6),
      })
      .strict(),
  })
  .strict()
  .openapi("IdentificationResponse");

/**
 * Confirmation carries the user's final, possibly edited values. The server
 * revalidates them rather than trusting the candidate it proposed earlier.
 */
export const ConfirmIdentificationRequestSchema = z
  .object({
    candidateId: z.string().min(1).max(100).optional(),
    confirm: z.literal(true),
    wine: CreateWineFieldsSchema.omit({ clientId: true }).superRefine(validateVintage),
  })
  .strict()
  .openapi("ConfirmIdentificationRequest");

export const ConfirmIdentificationResponseSchema = z
  .object({ data: z.object({ wineId: ResourceIdSchema }).strict() })
  .strict()
  .openapi("ConfirmIdentificationResponse");

export const IdentificationPathSchema = z
  .object({
    identificationId: ResourceIdSchema.openapi({
      param: { in: "path", name: "identificationId" },
    }),
    spaceId: ResourceIdSchema.openapi({ param: { in: "path", name: "spaceId" } }),
  })
  .strict();

const SyncMutationBaseSchema = z.object({
  baseVersion: z.null(),
  mutationId: ResourceIdSchema,
  occurredAt: ResourceTimestampSchema,
  operation: z.literal("create"),
  resourceId: ResourceIdSchema,
});

export const SyncMutationSchema = z.discriminatedUnion("resourceType", [
  SyncMutationBaseSchema.extend({
    payload: CreateWineFieldsSchema.omit({ clientId: true }).superRefine(validateVintage),
    resourceType: z.literal("wine_record"),
  }).strict(),
  SyncMutationBaseSchema.extend({
    payload: QuickTastingRequestSchema.omit({ clientId: true }),
    resourceType: z.literal("tasting_note"),
  }).strict(),
]);

export const SyncRequestSchema = z
  .object({
    cursor: z.string().nullable(),
    deviceId: ResourceIdSchema,
    mutations: z.array(SyncMutationSchema).max(50),
  })
  .strict()
  .openapi("SyncRequest");

export const SyncResponseSchema = z
  .object({
    data: z
      .object({
        changes: z.array(
          z
            .object({
              changedAt: ResourceTimestampSchema,
              operation: z.enum(["create", "update", "delete"]),
              resourceId: ResourceIdSchema,
              resourceType: z.string(),
              version: z.number().int().positive(),
            })
            .strict(),
        ),
        hasMore: z.boolean(),
        mutationResults: z.array(
          z
            .object({
              code: z.enum(["IDEMPOTENCY_CONFLICT", "NOT_FOUND", "VERSION_CONFLICT"]).optional(),
              current: z.unknown().optional(),
              mutationId: ResourceIdSchema,
              resourceId: ResourceIdSchema,
              status: z.enum(["applied", "replayed", "conflict", "rejected"]),
              version: z.number().int().positive().optional(),
            })
            .strict(),
        ),
        nextCursor: z.string(),
      })
      .strict(),
  })
  .strict()
  .openapi("SyncResponse");

export const WineIdPathSchema = z
  .object({
    spaceId: ResourceIdSchema.openapi({ param: { in: "path", name: "spaceId" } }),
    wineId: ResourceIdSchema.openapi({ param: { in: "path", name: "wineId" } }),
  })
  .strict();

export const MediaIdPathSchema = z
  .object({
    mediaId: ResourceIdSchema.openapi({ param: { in: "path", name: "mediaId" } }),
    spaceId: ResourceIdSchema.openapi({ param: { in: "path", name: "spaceId" } }),
  })
  .strict();

export type CreateWineRequest = z.infer<typeof CreateWineRequestSchema>;
export type MergeWinesRequest = z.infer<typeof MergeWinesRequestSchema>;
export type MergeWinesResponse = z.infer<typeof MergeWinesResponseSchema>;
export type WineMemoryQuery = z.infer<typeof WineMemoryQuerySchema>;
export type CreateWineResponse = z.infer<typeof CreateWineResponseSchema>;
export type ConfirmIdentificationRequest = z.infer<typeof ConfirmIdentificationRequestSchema>;
export type IdentificationCandidate = z.infer<typeof IdentificationCandidateSchema>;
export type IdentificationRequest = z.infer<typeof IdentificationRequestSchema>;
export type IdentificationResponse = z.infer<typeof IdentificationResponseSchema>;
export type MediaReservationRequest = z.infer<typeof MediaReservationRequestSchema>;
export type MediaReservationResponse = z.infer<typeof MediaReservationResponseSchema>;
export type QuickTastingRequest = z.infer<typeof QuickTastingRequestSchema>;
export type SyncMutation = z.infer<typeof SyncMutationSchema>;
export type SyncRequest = z.infer<typeof SyncRequestSchema>;
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
export type TastingNoteResponse = z.infer<typeof TastingNoteResponseSchema>;
export type WineMemoryResponse = z.infer<typeof WineMemoryResponseSchema>;
export type WineSummary = z.infer<typeof WineSummarySchema>;
