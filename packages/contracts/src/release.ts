import { z } from "@hono/zod-openapi";

import { ResourceIdSchema, ResourceTimestampSchema } from "./wine-memory";

/**
 * The export payload carries its own schema version so an archive stays
 * interpretable after the application contract moves on.
 */
export const ExportSchemaVersion = "2026.1";

export const ExportScopeSchema = z.enum(["space", "own"]);

export const ExportCsvDatasetSchema = z.enum([
  "wines",
  "tastings",
  "bottles",
  "purchases",
  "prices",
]);

export const ExportQuerySchema = z
  .object({
    dataset: ExportCsvDatasetSchema.optional(),
    format: z.enum(["json", "csv"]).default("json"),
  })
  .strict()
  .superRefine((value: { dataset?: string; format: string }, context: z.RefinementCtx) => {
    if (value.format === "csv" && value.dataset === undefined) {
      context.addIssue({
        code: "custom",
        message: "A CSV export requires an explicit dataset selection.",
        path: ["dataset"],
      });
    }
  });

const ExportWineSchema = z
  .object({
    appellation: z.string().nullable(),
    countryCode: z.string().nullable(),
    createdAt: ResourceTimestampSchema,
    displayName: z.string(),
    id: ResourceIdSchema,
    identityStatus: z.enum(["draft", "confirmed", "needs_review"]),
    mergedIntoWineId: ResourceIdSchema.nullable(),
    nonVintage: z.boolean(),
    producerName: z.string(),
    region: z.string().nullable(),
    updatedAt: ResourceTimestampSchema,
    vintageYear: z.number().int().nullable(),
    wineType: z.string().nullable(),
  })
  .strict();

const ExportTastingSchema = z
  .object({
    authorUserId: ResourceIdSchema,
    comment: z.string().nullable(),
    descriptorCodes: z.array(z.string()),
    foodText: z.string().nullable(),
    id: ResourceIdSchema,
    mode: z.enum(["quick", "deep"]),
    score100: z.number().int().nullable(),
    sentiment: z.string().nullable(),
    state: z.enum(["draft", "submitted"]),
    tastedAt: ResourceTimestampSchema,
    wineId: ResourceIdSchema,
    wouldBuy: z.string().nullable(),
    wouldDrinkAgain: z.string().nullable(),
  })
  .strict();

const ExportBottleSchema = z
  .object({
    acquiredAt: ResourceTimestampSchema,
    id: ResourceIdSchema,
    purchaseId: ResourceIdSchema.nullable(),
    state: z.string(),
    storageLocationText: z.string().nullable(),
    wineId: ResourceIdSchema,
  })
  .strict();

const ExportPurchaseSchema = z
  .object({
    currency: z.string(),
    id: ResourceIdSchema,
    merchantName: z.string(),
    purchasedAt: ResourceTimestampSchema,
    purchaserUserId: ResourceIdSchema,
    quantity: z.number().int(),
    unitAmountMinor: z.number().int(),
    wineId: ResourceIdSchema,
  })
  .strict();

const ExportPriceSchema = z
  .object({
    amountMinor: z.number().int(),
    channel: z.string(),
    currency: z.string(),
    id: ResourceIdSchema,
    merchantName: z.string().nullable(),
    observedAt: ResourceTimestampSchema,
    sourceType: z.string(),
    vintageMatch: z.string(),
    wineId: ResourceIdSchema,
  })
  .strict();

const ExportWishlistSchema = z
  .object({
    id: ResourceIdSchema,
    priority: z.number().int(),
    reason: z.string(),
    state: z.string(),
    targetAmountMinor: z.number().int().nullable(),
    targetCurrency: z.string().nullable(),
    wineId: ResourceIdSchema,
  })
  .strict();

const ExportFactSchema = z
  .object({
    citationSourceIds: z.array(ResourceIdSchema),
    evidenceClass: z.string(),
    id: ResourceIdSchema,
    predicate: z.string(),
    state: z.string(),
    subjectId: ResourceIdSchema,
    valueJson: z.string(),
  })
  .strict();

const ExportSourceSchema = z
  .object({
    id: ResourceIdSchema,
    licenseCode: z.string().nullable(),
    publisher: z.string().nullable(),
    retrievedAt: ResourceTimestampSchema.nullable(),
    sourceType: z.string(),
    title: z.string().nullable(),
    url: z.string().nullable(),
  })
  .strict();

const ExportAuditSchema = z
  .object({
    action: z.string(),
    createdAt: ResourceTimestampSchema,
    id: ResourceIdSchema,
    targetId: z.string().nullable(),
    targetType: z.string().nullable(),
  })
  .strict();

export const ExportDocumentSchema = z
  .object({
    data: z
      .object({
        audit: z.array(ExportAuditSchema),
        bottles: z.array(ExportBottleSchema),
        facts: z.array(ExportFactSchema),
        generatedAt: ResourceTimestampSchema,
        media: z.array(
          z
            .object({
              byteSize: z.number().int().positive(),
              id: ResourceIdSchema,
              kind: z.string(),
              mimeType: z.string(),
              /** Media bytes are exported only through an explicit selection. */
              selectionRequired: z.literal(true),
            })
            .strict(),
        ),
        prices: z.array(ExportPriceSchema),
        purchases: z.array(ExportPurchaseSchema),
        schemaVersion: z.literal(ExportSchemaVersion),
        scope: ExportScopeSchema,
        sources: z.array(ExportSourceSchema),
        space: z
          .object({
            id: ResourceIdSchema,
            name: z.string(),
            type: z.enum(["personal", "couple", "group"]),
          })
          .strict(),
        tastings: z.array(ExportTastingSchema),
        wines: z.array(ExportWineSchema),
        wishlist: z.array(ExportWishlistSchema),
      })
      .strict(),
  })
  .strict()
  .openapi("ExportDocument");

export const ExportMediaRequestSchema = z
  .object({
    confirm: z.literal(true),
    mediaIds: z.array(ResourceIdSchema).min(1).max(200),
  })
  .strict()
  .openapi("ExportMediaRequest");

export const DeleteSpaceRequestSchema = z
  .object({
    confirm: z.literal(true),
    /** Must match the Space name exactly; a typed confirmation is required. */
    confirmationText: z.string().min(1).max(120),
  })
  .strict()
  .openapi("DeleteSpaceRequest");

export const DeleteAccountRequestSchema = z
  .object({
    confirm: z.literal(true),
    confirmationText: z.literal("DELETE"),
  })
  .strict()
  .openapi("DeleteAccountRequest");

export const LeaveSpaceRequestSchema = z
  .object({
    confirm: z.literal(true),
    pseudonymizeAuthorship: z.boolean().default(false),
  })
  .strict()
  .openapi("LeaveSpaceRequest");

export const DeletionJobSchema = z
  .object({
    canceledAt: ResourceTimestampSchema.nullable(),
    completedAt: ResourceTimestampSchema.nullable(),
    createdAt: ResourceTimestampSchema,
    gracePeriodSeconds: z.number().int().nonnegative(),
    id: ResourceIdSchema,
    mediaObjectsRemoved: z.number().int().nonnegative(),
    purgeAfter: ResourceTimestampSchema,
    rowsRemoved: z.number().int().nonnegative(),
    state: z.enum(["scheduled", "canceled", "completed"]),
    targetId: ResourceIdSchema,
    targetType: z.enum(["space", "account"]),
  })
  .strict();

export const DeletionJobResponseSchema = z
  .object({ data: DeletionJobSchema })
  .strict()
  .openapi("DeletionJobResponse");

export const UsageMetricSchema = z.enum([
  "ai_language_calls",
  "research_lookups",
  "barcode_lookups",
  "price_lookups",
]);

export const UsageReportResponseSchema = z
  .object({
    data: z
      .object({
        /** Aggregate counters only; no wine, note, chat, or account content. */
        counters: z.array(
          z
            .object({
              limit: z.number().int().positive(),
              metric: UsageMetricSchema,
              /** `ok` below 70%, `warning` at 70%, `critical` at 90%, `capped` at 100%. */
              status: z.enum(["ok", "warning", "critical", "capped"]),
              scope: z.enum(["global", "space", "user"]),
              used: z.number().int().nonnegative(),
            })
            .strict(),
        ),
        providers: z
          .object({
            aiProvider: z.enum(["none", "cloudflare"]),
            researchProvider: z.enum(["none", "open_data"]),
          })
          .strict(),
        resetsAt: ResourceTimestampSchema,
        thresholds: z
          .object({
            critical: z.number(),
            warning: z.number(),
          })
          .strict(),
        usageDate: z.string().length(10),
      })
      .strict(),
  })
  .strict()
  .openapi("UsageReportResponse");

export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;
export type DeleteSpaceRequest = z.infer<typeof DeleteSpaceRequestSchema>;
export type DeletionJob = z.infer<typeof DeletionJobSchema>;
export type DeletionJobResponse = z.infer<typeof DeletionJobResponseSchema>;
export type ExportCsvDataset = z.infer<typeof ExportCsvDatasetSchema>;
export type ExportDocument = z.infer<typeof ExportDocumentSchema>;
export type ExportMediaRequest = z.infer<typeof ExportMediaRequestSchema>;
export type ExportScope = z.infer<typeof ExportScopeSchema>;
export type LeaveSpaceRequest = z.infer<typeof LeaveSpaceRequestSchema>;
export type UsageMetric = z.infer<typeof UsageMetricSchema>;
export type UsageReportResponse = z.infer<typeof UsageReportResponseSchema>;
