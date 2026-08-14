import {
  ActionDraftResponseSchema,
  BottleListResponseSchema,
  BottleResponseSchema,
  CreateActionDraftRequestSchema,
  CreatePriceObservationRequestSchema,
  CreatePurchaseRequestSchema,
  CreateWishlistItemRequestSchema,
  PriceObservationListResponseSchema,
  PriceObservationResponseSchema,
  PurchaseResponseSchema,
  UpdateBottleRequestSchema,
  UpdateWishlistItemRequestSchema,
  WishlistItemResponseSchema,
  WishlistListResponseSchema,
  type ActionDraftResponse,
  type BottleListResponse,
  type BottleResponse,
  type CreateActionDraftRequest,
  type CreatePriceObservationRequest,
  type CreatePurchaseRequest,
  type CreateWishlistItemRequest,
  type PriceObservationListResponse,
  type PriceObservationResponse,
  type PurchaseResponse,
  type UpdateBottleRequest,
  type UpdateWishlistItemRequest,
  type WishlistItemResponse,
  type WishlistListResponse,
} from "@vadevi/contracts";

import { apiError, authenticatedFetch, type TokenSource } from "./api";

/**
 * Cellar, wishlist, price, and confirmed-action clients. Only lazy routes reach
 * these, so their contract schemas stay out of the initial bundle.
 */

export async function getBottles(
  tokenSource: TokenSource,
  spaceId: string,
  options: { state?: string; wineId?: string } = {},
  signal?: AbortSignal,
): Promise<BottleListResponse> {
  const parameters = new URLSearchParams();
  if (options.state !== undefined) parameters.set("state", options.state);
  if (options.wineId !== undefined) parameters.set("wineId", options.wineId);
  const query = parameters.size === 0 ? "" : `?${parameters.toString()}`;
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/bottles${query}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return BottleListResponseSchema.parse(await response.json());
}

export async function updateBottle(
  tokenSource: TokenSource,
  spaceId: string,
  bottleId: string,
  request: UpdateBottleRequest,
): Promise<BottleResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/bottles/${bottleId}`,
    {
      body: JSON.stringify(UpdateBottleRequestSchema.parse(request)),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
  );
  if (!response.ok) throw await apiError(response);
  return BottleResponseSchema.parse(await response.json());
}

export async function createPurchase(
  tokenSource: TokenSource,
  spaceId: string,
  request: CreatePurchaseRequest,
  idempotencyKey: string,
): Promise<PurchaseResponse> {
  const response = await authenticatedFetch(tokenSource, `/api/v1/spaces/${spaceId}/purchases`, {
    body: JSON.stringify(CreatePurchaseRequestSchema.parse(request)),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    method: "POST",
  });
  if (!response.ok) throw await apiError(response);
  return PurchaseResponseSchema.parse(await response.json());
}

export async function getWishlist(
  tokenSource: TokenSource,
  spaceId: string,
  state?: string,
  signal?: AbortSignal,
): Promise<WishlistListResponse> {
  const query = state === undefined ? "" : `?state=${encodeURIComponent(state)}`;
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wishlist${query}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return WishlistListResponseSchema.parse(await response.json());
}

export async function createWishlistItem(
  tokenSource: TokenSource,
  spaceId: string,
  request: CreateWishlistItemRequest,
  idempotencyKey: string,
): Promise<WishlistItemResponse> {
  const response = await authenticatedFetch(tokenSource, `/api/v1/spaces/${spaceId}/wishlist`, {
    body: JSON.stringify(CreateWishlistItemRequestSchema.parse(request)),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    method: "POST",
  });
  if (!response.ok) throw await apiError(response);
  return WishlistItemResponseSchema.parse(await response.json());
}

export async function updateWishlistItem(
  tokenSource: TokenSource,
  spaceId: string,
  itemId: string,
  request: UpdateWishlistItemRequest,
): Promise<WishlistItemResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wishlist/${itemId}`,
    {
      body: JSON.stringify(UpdateWishlistItemRequestSchema.parse(request)),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
  );
  if (!response.ok) throw await apiError(response);
  return WishlistItemResponseSchema.parse(await response.json());
}

export async function getPriceObservations(
  tokenSource: TokenSource,
  spaceId: string,
  wineId: string,
  options: { currency?: string; freshnessDays?: number } = {},
  signal?: AbortSignal,
): Promise<PriceObservationListResponse> {
  const parameters = new URLSearchParams();
  if (options.currency !== undefined) parameters.set("currency", options.currency);
  if (options.freshnessDays !== undefined) {
    parameters.set("freshnessDays", String(options.freshnessDays));
  }
  const query = parameters.size === 0 ? "" : `?${parameters.toString()}`;
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wines/${wineId}/prices${query}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return PriceObservationListResponseSchema.parse(await response.json());
}

export async function createPriceObservation(
  tokenSource: TokenSource,
  spaceId: string,
  wineId: string,
  request: CreatePriceObservationRequest,
  idempotencyKey: string,
): Promise<PriceObservationResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wines/${wineId}/prices`,
    {
      body: JSON.stringify(CreatePriceObservationRequestSchema.parse(request)),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return PriceObservationResponseSchema.parse(await response.json());
}

export async function createActionDraft(
  tokenSource: TokenSource,
  spaceId: string,
  request: CreateActionDraftRequest,
  idempotencyKey: string,
): Promise<ActionDraftResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/action-drafts`,
    {
      body: JSON.stringify(CreateActionDraftRequestSchema.parse(request)),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return ActionDraftResponseSchema.parse(await response.json());
}

export async function confirmActionDraft(
  tokenSource: TokenSource,
  spaceId: string,
  draftId: string,
): Promise<ActionDraftResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/action-drafts/${draftId}/confirm`,
    { method: "POST" },
  );
  if (!response.ok) throw await apiError(response);
  return ActionDraftResponseSchema.parse(await response.json());
}

export async function cancelActionDraft(
  tokenSource: TokenSource,
  spaceId: string,
  draftId: string,
): Promise<ActionDraftResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/action-drafts/${draftId}/cancel`,
    { method: "POST" },
  );
  if (!response.ok) throw await apiError(response);
  return ActionDraftResponseSchema.parse(await response.json());
}
