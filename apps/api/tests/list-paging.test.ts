import {
  BootstrapResponseSchema,
  BottleListResponseSchema,
  CreateWineResponseSchema,
  PriceObservationListResponseSchema,
  TastingSessionListResponseSchema,
  WishlistListResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const token = emulatorIdToken({
  email: "list-paging@example.test",
  name: "Paging Owner",
  sub: "firebase-emulator-user-list-paging",
});
const reading = { Authorization: `Bearer ${token}` };
const writing = () => ({
  ...reading,
  "Content-Type": "application/json",
  "Idempotency-Key": randomOpaqueToken(),
});

async function post(path: string, body: unknown) {
  const response = await SELF.fetch(`https://vadevi.test${path}`, {
    body: JSON.stringify(body),
    headers: writing(),
    method: "POST",
  });
  expect(response.status).toBe(201);
  return response;
}

async function space() {
  const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: reading,
  });
  return BootstrapResponseSchema.parse(await response.json()).data.user.activeSpaceId!;
}

async function wine(spaceId: string, displayName: string) {
  const response = await post(`/api/v1/spaces/${spaceId}/wines`, {
    displayName,
    identityStatus: "confirmed",
    nonVintage: false,
    producerName: "Paging Producer",
    vintageYear: 2023,
    wineType: "red",
  });
  return CreateWineResponseSchema.parse(await response.json()).data.wine;
}

/** Every page of a list, two rows at a time: each row's id, in order. */
async function walk(
  path: string,
  page: (body: unknown) => { ids: string[]; nextCursor: string | null },
) {
  const ids: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const separator = path.includes("?") ? "&" : "?";
    const query: string = `limit=2${cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`}`;
    const response: Response = await SELF.fetch(`https://vadevi.test${path}${separator}${query}`, {
      headers: reading,
    });
    expect(response.status).toBe(200);
    const read = page(await response.json());
    expect(read.ids.length).toBeLessThanOrEqual(2);
    ids.push(...read.ids);
    cursor = read.nextCursor;
    pages += 1;
  } while (cursor !== null && pages < 20);
  return { ids, pages };
}

describe("lists a page at a time", () => {
  it("walks every list to its end, each row once and in order", async () => {
    const spaceId = await space();
    const first = await wine(spaceId, "Paging Wine");
    // The same date on two rows: the id alone has to separate them.
    for (const day of ["01", "02", "02", "03", "04"]) {
      await post(`/api/v1/spaces/${spaceId}/bottles`, {
        acquiredAt: `2026-08-${day}T09:00:00.000Z`,
        wineId: first.id,
      });
      await post(`/api/v1/spaces/${spaceId}/wines/${first.id}/prices`, {
        amountMinor: 1200,
        channel: "physical",
        currency: "EUR",
        observedAt: `2026-08-${day}T09:00:00.000Z`,
        sourceType: "shelf",
        vintageMatch: "yes",
      });
      await post(`/api/v1/spaces/${spaceId}/sessions`, {
        name: `Paging session ${day}`,
        startsAt: `2026-08-${day}T19:00:00.000Z`,
      });
    }
    for (const priority of [1, 2, 2, 3]) {
      const other = await wine(spaceId, `Wished Wine ${priority} ${randomOpaqueToken()}`);
      await post(`/api/v1/spaces/${spaceId}/wishlist`, {
        priority,
        reason: "Paging",
        wineId: other.id,
      });
    }

    const bottles = await walk(`/api/v1/spaces/${spaceId}/bottles`, (body) => {
      const { data } = BottleListResponseSchema.parse(body);
      expect(data.bottles.every((bottle) => bottle.wine?.displayName === "Paging Wine")).toBe(true);
      return { ids: data.bottles.map((bottle) => bottle.id), nextCursor: data.nextCursor };
    });
    const prices = await walk(`/api/v1/spaces/${spaceId}/wines/${first.id}/prices`, (body) => {
      const { data } = PriceObservationListResponseSchema.parse(body);
      return { ids: data.observations.map((price) => price.id), nextCursor: data.nextCursor };
    });
    const sessions = await walk(`/api/v1/spaces/${spaceId}/sessions`, (body) => {
      const response = TastingSessionListResponseSchema.parse(body);
      return { ids: response.data.map((session) => session.id), nextCursor: response.nextCursor };
    });
    const priorities: number[] = [];
    const wishlist = await walk(`/api/v1/spaces/${spaceId}/wishlist`, (body) => {
      const response = WishlistListResponseSchema.parse(body);
      priorities.push(...response.data.map((item) => item.priority));
      return { ids: response.data.map((item) => item.id), nextCursor: response.nextCursor };
    });

    for (const [list, total] of [
      [bottles, 5],
      [prices, 5],
      [sessions, 5],
      [wishlist, 4],
    ] as const) {
      expect(list.ids).toHaveLength(total);
      expect(new Set(list.ids).size).toBe(total);
      expect(list.pages).toBe(Math.ceil(total / 2));
    }
    expect(priorities).toEqual([3, 2, 2, 1]);
  });

  it("refuses a cursor that is not one", async () => {
    const spaceId = await space();
    for (const list of ["bottles", "wishlist", "sessions"]) {
      const response = await SELF.fetch(
        `https://vadevi.test/api/v1/spaces/${spaceId}/${list}?cursor=bm90LWEtY3Vyc29y`,
        { headers: reading },
      );
      expect(response.status).toBe(404);
    }
  });
});
