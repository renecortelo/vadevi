import {
  ActionDraftResponseSchema,
  BootstrapResponseSchema,
  type Bottle,
  BottleListResponseSchema,
  BottleResponseSchema,
  CreateWineResponseSchema,
  ErrorEnvelopeSchema,
  PriceObservationListResponseSchema,
  PriceObservationResponseSchema,
  PurchaseResponseSchema,
  WishlistItemResponseSchema,
  type WishlistItem,
  WishlistListResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const ownerToken = emulatorIdToken({
  email: "cellar-owner@example.test",
  name: "Cellar Owner",
  sub: "firebase-emulator-user-phase-5-owner",
});
const outsiderToken = emulatorIdToken({
  email: "cellar-outsider@example.test",
  name: "Cellar Outsider",
  sub: "firebase-emulator-user-phase-5-outsider",
});

function headers(token: string, idempotencyKey?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(idempotencyKey === undefined ? {} : { "Idempotency-Key": idempotencyKey }),
  };
}

async function bootstrap(token: string) {
  const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  return BootstrapResponseSchema.parse(await response.json());
}

async function createWine(spaceId: string, displayName = "Cellar Wine") {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
    body: JSON.stringify({
      displayName,
      identityStatus: "confirmed",
      nonVintage: false,
      producerName: "Synthetic Cellar Producer",
      vintageYear: 2023,
      wineType: "red",
    }),
    headers: headers(ownerToken, randomOpaqueToken()),
    method: "POST",
  });
  expect(response.status).toBe(201);
  return CreateWineResponseSchema.parse(await response.json()).data.wine;
}

describe("Cellar, wishlist, purchases, and prices", () => {
  it("creates a purchase, bottles, price, and wishlist transition exactly once", async () => {
    const owner = await bootstrap(ownerToken);
    await bootstrap(outsiderToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId);

    const wishlistResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wishlist`,
      {
        body: JSON.stringify({
          priority: 3,
          reason: "Bring it to the next synthetic tasting.",
          targetAmountMinor: 1800,
          targetCurrency: "EUR",
          wineId: wine.id,
        }),
        headers: headers(ownerToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    expect(wishlistResponse.status).toBe(201);
    const wishlist = WishlistItemResponseSchema.parse(await wishlistResponse.json()).data;
    expect(wishlist.state).toBe("active");

    const key = randomOpaqueToken();
    const purchaseRequest = {
      createBottles: true,
      currency: "EUR",
      locationText: "Synthetic shop",
      merchantName: "Example Merchant",
      purchasedAt: "2026-08-14T08:30:00.000Z",
      quantity: 2,
      unitAmountMinor: 1495,
      wineId: wine.id,
    };
    const purchase = () =>
      SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/purchases`, {
        body: JSON.stringify(purchaseRequest),
        headers: headers(ownerToken, key),
        method: "POST",
      });

    const firstResponse = await purchase();
    expect(firstResponse.status).toBe(201);
    expect(firstResponse.headers.get("Idempotency-Replayed")).toBe("false");
    const first = PurchaseResponseSchema.parse(await firstResponse.json());
    expect(first.data.bottles).toHaveLength(2);
    expect(first.data.inventory).toMatchObject({ opened: 0, owned: 2, totalAvailable: 2 });

    const replayResponse = await purchase();
    expect(replayResponse.status).toBe(201);
    expect(replayResponse.headers.get("Idempotency-Replayed")).toBe("true");
    const replay = PurchaseResponseSchema.parse(await replayResponse.json());
    expect(replay.data.purchase.id).toBe(first.data.purchase.id);
    expect(replay.data.bottles.map((bottle: Bottle) => bottle.id)).toEqual(
      first.data.bottles.map((bottle: Bottle) => bottle.id),
    );

    const counts = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM purchases WHERE id = ?) AS purchases,
        (SELECT COUNT(*) FROM bottles WHERE purchase_id = ?) AS bottles,
        (SELECT COUNT(*) FROM price_observations WHERE purchase_id = ?) AS prices`,
    )
      .bind(first.data.purchase.id, first.data.purchase.id, first.data.purchase.id)
      .first<{ bottles: number; prices: number; purchases: number }>();
    expect(counts).toEqual({ bottles: 2, prices: 1, purchases: 1 });

    const otherWine = await createWine(spaceId, "Other Purchase Wine");
    const mismatchedBottle = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/bottles`,
      {
        body: JSON.stringify({
          acquiredAt: purchaseRequest.purchasedAt,
          purchaseId: first.data.purchase.id,
          wineId: otherWine.id,
        }),
        headers: headers(ownerToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    expect(mismatchedBottle.status).toBe(404);

    const wishlistListResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wishlist`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    const wishlistList = WishlistListResponseSchema.parse(await wishlistListResponse.json());
    expect(wishlistList.data.find((item: WishlistItem) => item.id === wishlist.id)?.state).toBe(
      "purchased",
    );

    const priceResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}/prices`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    const prices = PriceObservationListResponseSchema.parse(await priceResponse.json());
    expect(prices.data.observations).toEqual([
      expect.objectContaining({
        amountMinor: 1495,
        observedAt: purchaseRequest.purchasedAt,
        purchaseId: first.data.purchase.id,
        sourceType: "purchase",
      }),
    ]);

    const outsiderList = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/bottles`, {
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    const outsiderPurchase = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/purchases`,
      {
        body: JSON.stringify(purchaseRequest),
        headers: headers(outsiderToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    expect(outsiderList.status).toBe(404);
    expect(outsiderPurchase.status).toBe(404);
  });

  it("derives inventory from valid bottle lifecycle transitions", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId, "Lifecycle Wine");
    const createdResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/bottles`,
      {
        body: JSON.stringify({
          acquiredAt: "2026-08-14T09:00:00.000Z",
          storageLocation: "Synthetic rack A",
          wineId: wine.id,
        }),
        headers: headers(ownerToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    expect(createdResponse.status).toBe(201);
    const created = BottleResponseSchema.parse(await createdResponse.json()).data;

    const openedResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/bottles/${created.id}`,
      {
        body: JSON.stringify({
          occurredAt: "2026-08-14T10:00:00.000Z",
          state: "opened",
          version: created.version,
        }),
        headers: headers(ownerToken),
        method: "PATCH",
      },
    );
    const opened = BottleResponseSchema.parse(await openedResponse.json()).data;
    expect(opened).toMatchObject({ openedAt: "2026-08-14T10:00:00.000Z", state: "opened" });

    const finishedResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/bottles/${created.id}`,
      {
        body: JSON.stringify({
          occurredAt: "2026-08-14T11:00:00.000Z",
          state: "finished",
          version: opened.version,
        }),
        headers: headers(ownerToken),
        method: "PATCH",
      },
    );
    const finished = BottleResponseSchema.parse(await finishedResponse.json()).data;
    expect(finished).toMatchObject({ finishedAt: "2026-08-14T11:00:00.000Z", state: "finished" });

    const invalidResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/bottles/${created.id}`,
      {
        body: JSON.stringify({
          occurredAt: "2026-08-14T12:00:00.000Z",
          state: "owned",
          version: finished.version,
        }),
        headers: headers(ownerToken),
        method: "PATCH",
      },
    );
    expect(invalidResponse.status).toBe(409);
    expect(
      ErrorEnvelopeSchema.parse(await invalidResponse.json()).error.details?.current,
    ).toMatchObject({
      state: "finished",
    });

    const listResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/bottles?wineId=${wine.id}`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    const list = BottleListResponseSchema.parse(await listResponse.json());
    expect(list.data.bottles).toEqual([
      expect.objectContaining({ id: created.id, state: "finished" }),
    ]);
    expect(list.data.inventory.finished).toBeGreaterThanOrEqual(1);
    expect(list.data.inventory.totalAvailable).toBeGreaterThanOrEqual(0);
  });

  it("requires timestamped source types and marks old manual prices stale", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId, "Observed Price Wine");
    const key = randomOpaqueToken();
    const request = {
      amountMinor: 999,
      channel: "physical",
      currency: "EUR",
      locationText: "Synthetic shelf",
      merchantName: "Example Shelf Merchant",
      observedAt: "2025-01-15T12:00:00.000Z",
      sourceType: "shelf",
      vintageMatch: "yes",
    };
    const create = () =>
      SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}/prices`, {
        body: JSON.stringify(request),
        headers: headers(ownerToken, key),
        method: "POST",
      });
    const firstResponse = await create();
    expect(firstResponse.status).toBe(201);
    const first = PriceObservationResponseSchema.parse(await firstResponse.json()).data;
    expect(first).toMatchObject({
      isStale: true,
      observedAt: request.observedAt,
      sourceType: "shelf",
    });
    const replayResponse = await create();
    expect(replayResponse.headers.get("Idempotency-Replayed")).toBe("true");

    const listedResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}/prices?freshnessDays=30`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    const listed = PriceObservationListResponseSchema.parse(await listedResponse.json());
    expect(listed.data.observations).toEqual([
      expect.objectContaining({ id: first.id, isStale: true, sourceType: "shelf" }),
    ]);
    expect(listed.data.warnings).toContain("external_lookup_disabled");

    const missingObservedAt = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}/prices`,
      {
        body: JSON.stringify({ ...request, observedAt: undefined }),
        headers: headers(ownerToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    expect(missingObservedAt.status).toBe(400);

    const unidentifiedMerchant = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}/prices`,
      {
        body: JSON.stringify({ ...request, merchantName: undefined, sourceType: "merchant" }),
        headers: headers(ownerToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    expect(unidentifiedMerchant.status).toBe(400);
  });

  it("cancels action drafts without writes and confirms repeated actions exactly once", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId, "Confirmed Action Wine");

    const canceledDraftResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/action-drafts`,
      {
        body: JSON.stringify({
          action: "add_wishlist_item",
          payload: {
            priority: 2,
            reason: "Review this synthetic wishlist proposal.",
            wineId: wine.id,
          },
          summary: "Add the selected wine to the wishlist",
        }),
        headers: headers(ownerToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    expect(canceledDraftResponse.status).toBe(201);
    const canceledDraft = ActionDraftResponseSchema.parse(await canceledDraftResponse.json()).data;
    expect(canceledDraft.state).toBe("pending");
    const beforeCancel = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM wishlist_items WHERE wine_id = ?",
    )
      .bind(wine.id)
      .first<{ count: number }>();
    expect(beforeCancel?.count).toBe(0);

    const cancelResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/action-drafts/${canceledDraft.id}/cancel`,
      { headers: headers(ownerToken), method: "POST" },
    );
    expect(cancelResponse.status).toBe(200);
    const canceled = ActionDraftResponseSchema.parse(await cancelResponse.json()).data;
    expect(canceled).toMatchObject({ payload: null, state: "canceled", summary: null });
    const afterCancel = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM wishlist_items WHERE wine_id = ?",
    )
      .bind(wine.id)
      .first<{ count: number }>();
    expect(afterCancel?.count).toBe(0);
    const canceledConfirm = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/action-drafts/${canceledDraft.id}/confirm`,
      { headers: headers(ownerToken), method: "POST" },
    );
    expect(canceledConfirm.status).toBe(409);

    const confirmedDraftResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/action-drafts`,
      {
        body: JSON.stringify({
          action: "record_price_observation",
          payload: {
            observation: {
              amountMinor: 1750,
              channel: "online",
              currency: "EUR",
              merchantName: "Example Online Merchant",
              merchantUrl: "https://merchant.example.test/wine",
              observedAt: "2026-08-14T09:30:00.000Z",
              sourceType: "merchant",
              vintageMatch: "yes",
            },
            wineId: wine.id,
          },
          summary: "Record the reviewed merchant price",
        }),
        headers: headers(ownerToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    const confirmedDraft = ActionDraftResponseSchema.parse(
      await confirmedDraftResponse.json(),
    ).data;
    const beforeConfirm = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM price_observations WHERE wine_id = ?",
    )
      .bind(wine.id)
      .first<{ count: number }>();
    expect(beforeConfirm?.count).toBe(0);

    const confirm = () =>
      SELF.fetch(
        `https://vadevi.test/api/v1/spaces/${spaceId}/action-drafts/${confirmedDraft.id}/confirm`,
        { headers: headers(ownerToken), method: "POST" },
      );
    const firstConfirmResponse = await confirm();
    expect(firstConfirmResponse.status).toBe(200);
    expect(firstConfirmResponse.headers.get("Idempotency-Replayed")).toBe("false");
    const firstConfirm = ActionDraftResponseSchema.parse(await firstConfirmResponse.json()).data;
    expect(firstConfirm).toMatchObject({
      confirmation: { resourceType: "price_observation" },
      payload: null,
      state: "confirmed",
      summary: null,
    });
    const replayConfirmResponse = await confirm();
    expect(replayConfirmResponse.status).toBe(200);
    expect(replayConfirmResponse.headers.get("Idempotency-Replayed")).toBe("true");
    const replayConfirm = ActionDraftResponseSchema.parse(await replayConfirmResponse.json()).data;
    expect(replayConfirm.confirmation?.resourceId).toBe(firstConfirm.confirmation?.resourceId);
    const afterConfirm = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM price_observations WHERE wine_id = ?",
    )
      .bind(wine.id)
      .first<{ count: number }>();
    expect(afterConfirm?.count).toBe(1);

    const outsiderRead = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/action-drafts/${confirmedDraft.id}`,
      { headers: { Authorization: `Bearer ${outsiderToken}` } },
    );
    expect(outsiderRead.status).toBe(404);
  });

  it("expires action-draft payloads after 30 minutes without applying their action", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId, "Expired Action Wine");
    const draftResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/action-drafts`,
      {
        body: JSON.stringify({
          action: "add_wishlist_item",
          payload: { priority: 1, reason: "Let this proposal expire.", wineId: wine.id },
          summary: "Propose an expiring wishlist item",
        }),
        headers: headers(ownerToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    const draft = ActionDraftResponseSchema.parse(await draftResponse.json()).data;
    await env.DB.prepare("UPDATE action_drafts SET expires_at = ? WHERE id = ?")
      .bind("2026-08-13T00:00:00.000Z", draft.id)
      .run();

    const expiredResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/action-drafts/${draft.id}`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    const expired = ActionDraftResponseSchema.parse(await expiredResponse.json()).data;
    expect(expired).toMatchObject({ payload: null, state: "expired", summary: null });
    const retained = await env.DB.prepare(
      "SELECT payload_hash, payload_json, summary FROM action_drafts WHERE id = ?",
    )
      .bind(draft.id)
      .first<{ payload_hash: string; payload_json: string | null; summary: string | null }>();
    expect(retained?.payload_hash).toBeTruthy();
    expect(retained?.payload_json).toBeNull();
    expect(retained?.summary).toBeNull();
    const wishlistCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM wishlist_items WHERE wine_id = ?",
    )
      .bind(wine.id)
      .first<{ count: number }>();
    expect(wishlistCount?.count).toBe(0);
  });
});
