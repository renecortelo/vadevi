import {
  BootstrapResponseSchema,
  BottleListResponseSchema,
  CreateWineResponseSchema,
  PriceObservationListResponseSchema,
  TastingSessionListResponseSchema,
  WishlistListResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { ulid } from "ulid";
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

  it("pages past a hundred rows, each naming its own wine", async () => {
    // D1 binds at most 100 parameters to a statement, and each row of the
    // cellar and the wishlist carries its wine's name, looked up for the whole
    // page at once. A page of 250 rows, each of a different wine, is where
    // that would break, so 260 are seeded directly: through the API it would
    // be slow and prove nothing more.
    const owner = emulatorIdToken({
      email: "list-paging-many@example.test",
      sub: "firebase-emulator-user-list-paging-many",
    });
    const headers = { Authorization: `Bearer ${owner}` };
    const me = BootstrapResponseSchema.parse(
      await (await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers })).json(),
    );
    const spaceId = me.data.user.activeSpaceId;
    const now = new Date().toISOString();
    const total = 260;
    const statements = [];
    for (let index = 0; index < total; index += 1) {
      const wineId = ulid();
      const name = `Many Wine ${String(index).padStart(3, "0")}`;
      statements.push(
        env.DB.prepare(
          `INSERT INTO wine_records (
            id, space_id, display_name, normalized_name, producer_name, normalized_producer_name,
            non_vintage, identity_status, version, created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'Many Producer', 'many producer', 0, 'confirmed', 1, ?, ?, ?)`,
        ).bind(wineId, spaceId, name, name.toLowerCase(), me.data.user.id, now, now),
        env.DB.prepare(
          `INSERT INTO bottles (
            id, space_id, wine_id, created_by_user_id, state, acquired_at, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'owned', ?, 1, ?, ?)`,
        ).bind(ulid(), spaceId, wineId, me.data.user.id, now, now, now),
        env.DB.prepare(
          `INSERT INTO wishlist_items (
            id, space_id, wine_id, created_by_user_id, reason, priority, state, version,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'Many', 2, 'active', 1, ?, ?)`,
        ).bind(ulid(), spaceId, wineId, me.data.user.id, now, now),
      );
    }
    await env.DB.batch(statements);

    const read = async (list: "bottles" | "wishlist", limit: number | null) => {
      const names: string[] = [];
      const pages: number[] = [];
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams();
        if (limit !== null) query.set("limit", String(limit));
        if (cursor !== null) query.set("cursor", cursor);
        const response = await SELF.fetch(
          `https://vadevi.test/api/v1/spaces/${spaceId}/${list}?${query.toString()}`,
          { headers },
        );
        expect(response.status).toBe(200);
        const body: unknown = await response.json();
        if (list === "bottles") {
          const { data } = BottleListResponseSchema.parse(body);
          names.push(...data.bottles.map((bottle) => bottle.wine?.displayName ?? ""));
          pages.push(data.bottles.length);
          cursor = data.nextCursor;
        } else {
          const response = WishlistListResponseSchema.parse(body);
          names.push(...response.data.map((item) => item.wine?.displayName ?? ""));
          pages.push(response.data.length);
          cursor = response.nextCursor;
        }
      } while (cursor !== null && pages.length < 20);
      return { names, pages };
    };

    for (const list of ["bottles", "wishlist"] as const) {
      const full = await read(list, 250);
      expect(full.pages).toEqual([250, 10]);
      expect(new Set(full.names).size).toBe(total);
      expect(full.names.every((name) => name.startsWith("Many Wine "))).toBe(true);

      const byDefault = await read(list, null);
      expect(byDefault.pages.reduce((sum, rows) => sum + rows, 0)).toBe(total);
      expect(new Set(byDefault.names).size).toBe(total);
    }
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
