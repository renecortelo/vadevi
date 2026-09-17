import { z } from "@hono/zod-openapi";

import { CreatePriceObservationRequestSchema, CreateWishlistItemRequestSchema } from "./cellar";
import { ResourceIdSchema, ResourceTimestampSchema } from "./wine-memory";

export const ActionDraftActionSchema = z.enum(["add_wishlist_item", "record_price_observation"]);

export const PriceActionPayloadSchema = z
  .object({
    observation: CreatePriceObservationRequestSchema,
    wineId: ResourceIdSchema,
  })
  .strict();

export const CreateActionDraftRequestSchema = z
  .discriminatedUnion("action", [
    z
      .object({
        action: z.literal("add_wishlist_item"),
        payload: CreateWishlistItemRequestSchema,
        summary: z.string().trim().min(1).max(300),
      })
      .strict(),
    z
      .object({
        action: z.literal("record_price_observation"),
        payload: PriceActionPayloadSchema,
        summary: z.string().trim().min(1).max(300),
      })
      .strict(),
  ])
  .openapi("CreateActionDraftRequest");

export const ActionDraftStateSchema = z.enum(["pending", "confirmed", "canceled", "expired"]);

export const ActionDraftSchema = z
  .object({
    action: ActionDraftActionSchema,
    confirmation: z
      .object({
        resourceId: ResourceIdSchema,
        resourceType: z.enum(["price_observation", "wishlist_item"]),
      })
      .strict()
      .nullable(),
    createdAt: ResourceTimestampSchema,
    expiresAt: ResourceTimestampSchema,
    id: ResourceIdSchema,
    payload: z.union([CreateWishlistItemRequestSchema, PriceActionPayloadSchema]).nullable(),
    state: ActionDraftStateSchema,
    summary: z.string().min(1).max(300).nullable(),
  })
  .strict();

export const ActionDraftResponseSchema = z
  .object({ data: ActionDraftSchema })
  .strict()
  .openapi("ActionDraftResponse");

export const ActionDraftIdPathSchema = z
  .object({
    draftId: ResourceIdSchema.openapi({ param: { in: "path", name: "draftId" } }),
    spaceId: ResourceIdSchema.openapi({ param: { in: "path", name: "spaceId" } }),
  })
  .strict();

export type ActionDraft = z.infer<typeof ActionDraftSchema>;
export type ActionDraftResponse = z.infer<typeof ActionDraftResponseSchema>;
export type CreateActionDraftRequest = z.infer<typeof CreateActionDraftRequestSchema>;
