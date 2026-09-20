import { z } from "@hono/zod-openapi";

import { ResourceIdSchema, ResourceTimestampSchema } from "./wine-memory";

/**
 * The currencies a price may be recorded in — a closed list, chosen by the
 * maintainer. Every amount is stored in minor units (cents), and every one
 * of these has exactly two, so the conversion is the same for all; a
 * currency with none (JPY) or three (KWD) is not on the list rather than
 * silently stored a hundred times off. Adding one means adding its minor
 * units below, and the tests hold the two lists together.
 */
export const supportedCurrencies = ["EUR", "USD", "GBP", "CHF", "MXN"] as const;
export type CurrencyCode = (typeof supportedCurrencies)[number];
export const CurrencyCodeSchema = z.enum(supportedCurrencies);

/** Decimal places of each supported currency's minor unit. */
const minorUnitDigits: Record<CurrencyCode, number> = {
  CHF: 2,
  EUR: 2,
  GBP: 2,
  MXN: 2,
  USD: 2,
};

/** A typed amount ("12.50") to the integer minor units the record keeps. */
export function toMinorUnits(amount: number, currency: CurrencyCode): number {
  return Math.round(amount * 10 ** minorUnitDigits[currency]);
}

/** Integer minor units back to the amount a formatter expects. */
export function fromMinorUnits(amountMinor: number, currency: CurrencyCode): number {
  return amountMinor / 10 ** minorUnitDigits[currency];
}
export const MoneyAmountMinorSchema = z.number().int().min(0).max(2_147_483_647);
export const BottleStateSchema = z.enum(["owned", "opened", "finished", "gifted", "removed"]);
export const WishlistStateSchema = z.enum(["active", "purchased", "dismissed"]);
export const PriceChannelSchema = z.enum(["physical", "online", "unknown"]);
export const VintageMatchSchema = z.enum(["yes", "no", "unknown"]);
export const PriceSourceTypeSchema = z.enum([
  "purchase",
  "receipt",
  "shelf",
  "open_prices",
  "merchant",
  "search",
]);

const OptionalHttpsUrlSchema = z
  .string()
  .url()
  .refine((value: string) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  }, "Use an HTTPS URL without embedded credentials.");

export const InventorySummarySchema = z
  .object({
    finished: z.number().int().nonnegative(),
    gifted: z.number().int().nonnegative(),
    opened: z.number().int().nonnegative(),
    owned: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative(),
    totalAvailable: z.number().int().nonnegative(),
  })
  .strict();

export const BottleSchema = z
  .object({
    acquiredAt: ResourceTimestampSchema,
    createdAt: ResourceTimestampSchema,
    finishedAt: ResourceTimestampSchema.nullable(),
    giftedAt: ResourceTimestampSchema.nullable(),
    id: ResourceIdSchema,
    notes: z.string().nullable(),
    openedAt: ResourceTimestampSchema.nullable(),
    purchaseId: ResourceIdSchema.nullable(),
    removedAt: ResourceTimestampSchema.nullable(),
    state: BottleStateSchema,
    storageLocation: z.string().nullable(),
    updatedAt: ResourceTimestampSchema,
    version: z.number().int().positive(),
    wineId: ResourceIdSchema,
  })
  .strict();

export const CreateBottleRequestSchema = z
  .object({
    acquiredAt: ResourceTimestampSchema,
    clientId: ResourceIdSchema.optional(),
    notes: z.string().trim().max(2_000).optional(),
    purchaseId: ResourceIdSchema.optional(),
    storageLocation: z.string().trim().max(200).optional(),
    wineId: ResourceIdSchema,
  })
  .strict()
  .openapi("CreateBottleRequest");

export const UpdateBottleRequestSchema = z
  .object({
    notes: z.string().trim().max(2_000).nullable().optional(),
    occurredAt: ResourceTimestampSchema,
    state: BottleStateSchema,
    storageLocation: z.string().trim().max(200).nullable().optional(),
    version: z.number().int().positive(),
  })
  .strict()
  .openapi("UpdateBottleRequest");

export const BottleResponseSchema = z
  .object({ data: BottleSchema })
  .strict()
  .openapi("BottleResponse");

export const BottleListQuerySchema = z
  .object({
    state: BottleStateSchema.optional(),
    wineId: ResourceIdSchema.optional(),
  })
  .strict();

/**
 * The lists below stop at a bound and say so: `hasMore` is true when the
 * Space holds more than the page, so a client can tell the reader they are
 * looking at the first N rather than at everything. A cursor to walk past
 * the bound is future work; until then the export carries the whole set.
 */
export const listBound = 250;

export const BottleListResponseSchema = z
  .object({
    data: z
      .object({
        bottles: z.array(BottleSchema).max(listBound),
        hasMore: z.boolean(),
        inventory: InventorySummarySchema,
      })
      .strict(),
  })
  .strict()
  .openapi("BottleListResponse");

export const CreatePurchaseRequestSchema = z
  .object({
    clientId: ResourceIdSchema.optional(),
    createBottles: z.boolean().default(true),
    currency: CurrencyCodeSchema,
    evidenceMediaId: ResourceIdSchema.optional(),
    locationText: z.string().trim().max(300).optional(),
    merchantName: z.string().trim().min(1).max(200),
    merchantUrl: OptionalHttpsUrlSchema.optional(),
    notes: z.string().trim().max(2_000).optional(),
    purchasedAt: ResourceTimestampSchema,
    quantity: z.number().int().min(1).max(100),
    unitAmountMinor: MoneyAmountMinorSchema,
    wineId: ResourceIdSchema,
  })
  .strict()
  .openapi("CreatePurchaseRequest");

export const PurchaseSchema = z
  .object({
    createdAt: ResourceTimestampSchema,
    currency: CurrencyCodeSchema,
    evidenceMediaId: ResourceIdSchema.nullable(),
    id: ResourceIdSchema,
    locationText: z.string().nullable(),
    merchantName: z.string(),
    merchantUrl: z.string().nullable(),
    notes: z.string().nullable(),
    purchasedAt: ResourceTimestampSchema,
    purchaserUserId: ResourceIdSchema,
    quantity: z.number().int().min(1).max(100),
    unitAmountMinor: MoneyAmountMinorSchema,
    updatedAt: ResourceTimestampSchema,
    version: z.number().int().positive(),
    wineId: ResourceIdSchema,
  })
  .strict();

export const PurchaseResponseSchema = z
  .object({
    data: z
      .object({
        bottles: z.array(BottleSchema).max(100),
        inventory: InventorySummarySchema,
        purchase: PurchaseSchema,
        priceObservationId: ResourceIdSchema,
      })
      .strict(),
  })
  .strict()
  .openapi("PurchaseResponse");

const TargetPriceFieldsSchema = z.object({
  targetAmountMinor: MoneyAmountMinorSchema.optional(),
  targetCurrency: CurrencyCodeSchema.optional(),
});

export const CreateWishlistItemRequestSchema = z
  .object({
    clientId: ResourceIdSchema.optional(),
    notes: z.string().trim().max(2_000).optional(),
    priority: z.number().int().min(1).max(3),
    reason: z.string().trim().min(1).max(500),
    referrer: z.string().trim().max(300).optional(),
    sourceId: ResourceIdSchema.optional(),
    targetAmountMinor: MoneyAmountMinorSchema.optional(),
    targetCurrency: CurrencyCodeSchema.optional(),
    wineId: ResourceIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.targetAmountMinor === undefined) !== (value.targetCurrency === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Target amount and currency must be provided together.",
      });
    }
  })
  .openapi("CreateWishlistItemRequest");

export const UpdateWishlistItemRequestSchema = TargetPriceFieldsSchema.extend({
  notes: z.string().trim().max(2_000).nullable().optional(),
  priority: z.number().int().min(1).max(3).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  state: WishlistStateSchema,
  version: z.number().int().positive(),
})
  .strict()
  .superRefine((value, context) => {
    if ((value.targetAmountMinor === undefined) !== (value.targetCurrency === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Target amount and currency must be provided together.",
      });
    }
  })
  .openapi("UpdateWishlistItemRequest");

export const WishlistItemSchema = z
  .object({
    createdAt: ResourceTimestampSchema,
    id: ResourceIdSchema,
    notes: z.string().nullable(),
    priority: z.number().int().min(1).max(3),
    reason: z.string(),
    referrer: z.string().nullable(),
    sourceId: ResourceIdSchema.nullable(),
    state: WishlistStateSchema,
    targetAmountMinor: MoneyAmountMinorSchema.nullable(),
    targetCurrency: CurrencyCodeSchema.nullable(),
    updatedAt: ResourceTimestampSchema,
    version: z.number().int().positive(),
    wineId: ResourceIdSchema,
  })
  .strict();

export const WishlistItemResponseSchema = z
  .object({ data: WishlistItemSchema })
  .strict()
  .openapi("WishlistItemResponse");

export const WishlistListQuerySchema = z.object({ state: WishlistStateSchema.optional() }).strict();

export const WishlistListResponseSchema = z
  .object({ data: z.array(WishlistItemSchema).max(listBound), hasMore: z.boolean() })
  .strict()
  .openapi("WishlistListResponse");

export const CreatePriceObservationRequestSchema = z
  .object({
    amountMinor: MoneyAmountMinorSchema,
    channel: PriceChannelSchema,
    clientId: ResourceIdSchema.optional(),
    currency: CurrencyCodeSchema,
    evidenceMediaId: ResourceIdSchema.optional(),
    locationText: z.string().trim().max(300).optional(),
    merchantName: z.string().trim().max(200).optional(),
    merchantUrl: OptionalHttpsUrlSchema.optional(),
    observedAt: ResourceTimestampSchema,
    sourceId: ResourceIdSchema.optional(),
    sourceType: PriceSourceTypeSchema.exclude(["purchase"]),
    vintageMatch: VintageMatchSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.sourceType === "merchant" &&
      value.merchantName === undefined &&
      value.merchantUrl === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Merchant observations require a merchant name or URL.",
        path: ["merchantName"],
      });
    }
  })
  .openapi("CreatePriceObservationRequest");

export const PriceObservationSchema = z
  .object({
    amountMinor: MoneyAmountMinorSchema,
    channel: PriceChannelSchema,
    createdAt: ResourceTimestampSchema,
    currency: CurrencyCodeSchema,
    evidenceMediaId: ResourceIdSchema.nullable(),
    id: ResourceIdSchema,
    isStale: z.boolean(),
    locationText: z.string().nullable(),
    merchantName: z.string().nullable(),
    merchantUrl: z.string().nullable(),
    observedAt: ResourceTimestampSchema,
    observerUserId: ResourceIdSchema.nullable(),
    purchaseId: ResourceIdSchema.nullable(),
    retrievedAt: ResourceTimestampSchema,
    sourceId: ResourceIdSchema.nullable(),
    sourceType: PriceSourceTypeSchema,
    updatedAt: ResourceTimestampSchema,
    version: z.number().int().positive(),
    vintageMatch: VintageMatchSchema,
    wineId: ResourceIdSchema,
  })
  .strict();

export const PriceObservationResponseSchema = z
  .object({ data: PriceObservationSchema })
  .strict()
  .openapi("PriceObservationResponse");

export const PriceObservationListQuerySchema = z
  .object({
    currency: CurrencyCodeSchema.optional(),
    freshnessDays: z.coerce.number().int().min(1).max(365).default(90),
  })
  .strict();

export const PriceObservationListResponseSchema = z
  .object({
    data: z
      .object({
        hasMore: z.boolean(),
        observations: z.array(PriceObservationSchema).max(listBound),
        warnings: z.array(z.enum(["external_lookup_disabled", "no_observations"])).max(2),
      })
      .strict(),
  })
  .strict()
  .openapi("PriceObservationListResponse");

export const BottleIdPathSchema = z
  .object({
    bottleId: ResourceIdSchema.openapi({ param: { in: "path", name: "bottleId" } }),
    spaceId: ResourceIdSchema.openapi({ param: { in: "path", name: "spaceId" } }),
  })
  .strict();

export const WishlistItemIdPathSchema = z
  .object({
    itemId: ResourceIdSchema.openapi({ param: { in: "path", name: "itemId" } }),
    spaceId: ResourceIdSchema.openapi({ param: { in: "path", name: "spaceId" } }),
  })
  .strict();

export type Bottle = z.infer<typeof BottleSchema>;
export type BottleListResponse = z.infer<typeof BottleListResponseSchema>;
export type BottleResponse = z.infer<typeof BottleResponseSchema>;
export type CreateBottleRequest = z.infer<typeof CreateBottleRequestSchema>;
export type CreatePriceObservationRequest = z.infer<typeof CreatePriceObservationRequestSchema>;
export type CreatePurchaseRequest = z.infer<typeof CreatePurchaseRequestSchema>;
export type CreateWishlistItemRequest = z.infer<typeof CreateWishlistItemRequestSchema>;
export type InventorySummary = z.infer<typeof InventorySummarySchema>;
export type PriceObservation = z.infer<typeof PriceObservationSchema>;
export type PriceObservationListResponse = z.infer<typeof PriceObservationListResponseSchema>;
export type PriceObservationResponse = z.infer<typeof PriceObservationResponseSchema>;
export type PurchaseResponse = z.infer<typeof PurchaseResponseSchema>;
export type UpdateBottleRequest = z.infer<typeof UpdateBottleRequestSchema>;
export type UpdateWishlistItemRequest = z.infer<typeof UpdateWishlistItemRequestSchema>;
export type WishlistItem = z.infer<typeof WishlistItemSchema>;
export type WishlistItemResponse = z.infer<typeof WishlistItemResponseSchema>;
export type WishlistListResponse = z.infer<typeof WishlistListResponseSchema>;
