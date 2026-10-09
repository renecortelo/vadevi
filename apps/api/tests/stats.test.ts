import { BootstrapResponseSchema, WineStatsResponseSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { ulid } from "ulid";
import { beforeAll, describe, expect, it } from "vitest";

import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const token = (name: string) =>
  emulatorIdToken({
    email: `stats-${name}@example.test`,
    name,
    sub: `firebase-emulator-user-stats-${name}`,
  });
const ownerToken = token("Rene");
const peerToken = token("Ana");
const outsiderToken = token("Outsider");

async function bootstrap(bearer: string) {
  const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  return BootstrapResponseSchema.parse(await response.json());
}

async function stats(bearer: string, path: string) {
  const response = await SELF.fetch(`https://vadevi.test${path}`, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  return { body: await response.json(), status: response.status };
}

describe("a reader's numbers", () => {
  it("counts the reader's own records everywhere, and everyone's in one Space", async () => {
    const owner = await bootstrap(ownerToken);
    const peer = await bootstrap(peerToken);
    await bootstrap(outsiderToken);
    const ownerId = owner.data.user.id;
    const peerId = peer.data.user.id;
    const personal = owner.data.user.activeSpaceId;
    const couple = ulid();
    const now = "2026-05-01T12:00:00.000Z";
    const wine = (id: string, space: string, type: string, region: string) =>
      env.DB.prepare(
        `INSERT INTO wine_records (
          id, space_id, display_name, normalized_name, producer_name, normalized_producer_name,
          non_vintage, wine_type_free, country_code, region, identity_status, version,
          created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'Bodega', 'bodega', 0, ?, 'ES', ?, 'confirmed', 1, ?, ?, ?)`,
      ).bind(id, space, `Wine ${id.slice(-4)}`, `wine ${id}`, type, region, ownerId, now, now);
    const note = (space: string, wineId: string, author: string, score: number, extra = {}) => {
      const fields = { memorable: null, would_buy: null, ...extra };
      return env.DB.prepare(
        `INSERT INTO tasting_notes
          (id, space_id, wine_id, author_user_id, mode, state, tasted_at, score_100,
           would_buy, memorable, version, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'quick', 'submitted', ?, ?, ?, ?, 1, ?, ?)`,
      ).bind(
        ulid(),
        space,
        wineId,
        author,
        now,
        score,
        fields.would_buy,
        fields.memorable,
        now,
        now,
      );
    };
    const purchase = (
      space: string,
      wineId: string,
      buyer: string,
      unit: number,
      currency: string,
      quantity: number,
    ) =>
      env.DB.prepare(
        `INSERT INTO purchases (
          id, space_id, wine_id, purchaser_user_id, merchant_name, purchased_at,
          unit_amount_minor, currency, quantity, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'Lavinia', ?, ?, ?, ?, 1, ?, ?)`,
      ).bind(ulid(), space, wineId, buyer, now, unit, currency, quantity, now, now);
    const bottle = (
      space: string,
      wineId: string,
      by: string,
      state: string,
      opened: string | null,
    ) =>
      env.DB.prepare(
        `INSERT INTO bottles (
          id, space_id, wine_id, created_by_user_id, state, acquired_at, opened_at,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).bind(ulid(), space, wineId, by, state, now, opened, now, now);

    const [rioja, white, third] = [ulid(), ulid(), ulid()];
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO spaces (id, type, name, default_locale, created_by_user_id, version,
          created_at, updated_at) VALUES (?, 'couple', 'Casa', 'es', ?, 1, ?, ?)`,
      ).bind(couple, ownerId, now, now),
      ...[ownerId, peerId].map((member) =>
        env.DB.prepare(
          `INSERT INTO space_memberships (
            space_id, user_id, role, status, joined_at, version, created_at, updated_at
          ) VALUES (?, ?, 'member', 'active', ?, 1, ?, ?)`,
        ).bind(couple, member, now, now, now),
      ),
      wine(rioja, personal, "red", "Rioja"),
      wine(white, couple, "white", "Rías Baixas"),
      wine(third, couple, "red", "Rioja"),
      note(personal, rioja, ownerId, 92, { would_buy: "yes" }),
      note(couple, white, ownerId, 84),
      note(couple, white, peerId, 95, { memorable: 1 }),
      purchase(personal, rioja, ownerId, 1_500, "EUR", 2),
      purchase(couple, white, peerId, 3_000, "EUR", 1),
      purchase(couple, third, ownerId, 1_000, "USD", 1),
      bottle(couple, white, peerId, "owned", null),
      bottle(couple, third, ownerId, "opened", "2026-05-11T12:00:00.000Z"),
      env.DB.prepare(
        `INSERT INTO wine_grapes (id, space_id, wine_id, name_snapshot, position, created_at, updated_at)
          VALUES (?, ?, ?, 'Tempranillo', 0, ?, ?)`,
      ).bind(ulid(), personal, rioja, now, now),
    ]);

    // Mine, wherever they are: two notes, my purchases, my bottle.
    const mine = await stats(ownerToken, "/api/v1/me/stats");
    expect(mine.status).toBe(200);
    const me = WineStatsResponseSchema.parse(mine.body).data;
    expect(me.scope).toBe("personal");
    expect(me.wines.total).toBe(3);
    expect(me.wines.byType).toEqual([
      { count: 2, key: "red" },
      { count: 1, key: "white" },
    ]);
    expect(me.wines.byRegion[0]).toEqual({ count: 2, key: "Rioja" });
    expect(me.tastings).toMatchObject({ atOrAbove90: 1, averageScore: 88, scored: 2, total: 2 });
    expect(me.tastings.wouldBuy.yes).toBe(1);
    expect(me.tastings.topWines[0]).toMatchObject({ score: 92, wineId: rioja });
    // Never one total across currencies.
    expect(me.spending.map((row) => [row.currency, row.totalMinor, row.bottles])).toEqual([
      ["EUR", 3_000, 2],
      ["USD", 1_000, 1],
    ]);
    // Value among wines at or above my average: the Rioja, 15.00 for 92 points.
    expect(me.bestValue).toEqual([
      expect.objectContaining({
        currency: "EUR",
        score: 92,
        unitAmountMinor: 1_500,
        wineId: rioja,
      }),
    ]);
    expect(me.cellar).toMatchObject({ averageDaysToOpen: 10, opened: 1, owned: 0 });

    // The couple's Space: both of us, only there.
    const ours = await stats(ownerToken, `/api/v1/spaces/${couple}/stats`);
    expect(ours.status).toBe(200);
    const space = WineStatsResponseSchema.parse(ours.body).data;
    expect(space.wines.total).toBe(2);
    expect(space.tastings).toMatchObject({ memorable: 1, scored: 2, total: 2 });
    expect(space.tastings.averageScore).toBe(89.5);
    // The best scored, with the ones someone marked memorable said to be.
    expect(space.tastings.topWines[0]).toMatchObject({ memorable: true, score: 95, wineId: white });
    expect(space.spending.map((row) => [row.currency, row.totalMinor])).toEqual([
      ["EUR", 3_000],
      ["USD", 1_000],
    ]);
    expect(space.cellar).toMatchObject({ opened: 1, owned: 1 });

    // A wine recorded without a country is placed by its region where the
    // region says which; a misspelt one stays unknown rather than guessed.
    const [emporda, typo] = [ulid(), ulid()];
    await env.DB.batch(
      [
        [emporda, "DO Empordà"],
        [typo, "La Mancga"],
      ].map(([id, region]) =>
        env.DB.prepare(
          `INSERT INTO wine_records (
            id, space_id, display_name, normalized_name, producer_name, normalized_producer_name,
            non_vintage, region, identity_status, version, created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'Celler', 'celler', 0, ?, 'confirmed', 1, ?, ?, ?)`,
        ).bind(id, personal, `Wine ${region}`, `wine ${id}`, region, ownerId, now, now),
      ),
    );
    const placed = WineStatsResponseSchema.parse(
      (await stats(ownerToken, "/api/v1/me/stats")).body,
    ).data;
    expect(placed.wines.byCountry).toEqual([
      { count: 4, key: "ES" },
      { count: 1, key: "unknown" },
    ]);
    expect(placed.wines.countriesInferred).toBe(1);
    const spain = WineStatsResponseSchema.parse(
      (await stats(ownerToken, "/api/v1/me/stats?country=ES")).body,
    ).data;
    expect(spain.wines.total).toBe(4);

    // what it can be narrowed to stays whole.
    const tempranillo = WineStatsResponseSchema.parse(
      (await stats(ownerToken, "/api/v1/me/stats?grape=tempranillo")).body,
    ).data;
    expect(tempranillo.wines.total).toBe(1);
    expect(tempranillo.tastings).toMatchObject({ averageScore: 92, total: 1 });
    expect(tempranillo.spending.map((row) => row.currency)).toEqual(["EUR"]);
    expect(tempranillo.filters.grape).toBe("tempranillo");
    expect(tempranillo.facets).toEqual({
      countries: ["ES"],
      grapes: ["Tempranillo"],
      regions: ["DO Empordà", "La Mancga", "Rioja", "Rías Baixas"],
      types: ["red", "white"],
    });
    const whites = WineStatsResponseSchema.parse(
      (await stats(ownerToken, `/api/v1/spaces/${couple}/stats?type=white&country=ES`)).body,
    ).data;
    expect(whites.wines.total).toBe(1);
    expect(whites.tastings.total).toBe(2);
    expect(whites.cellar).toMatchObject({ opened: 0, owned: 1 });

    // A period with nothing in it counts nothing.
    const later = WineStatsResponseSchema.parse(
      (await stats(ownerToken, "/api/v1/me/stats?from=2027-01-01")).body,
    ).data;
    expect(later.tastings.total).toBe(0);
    expect(later.spending).toEqual([]);

    // Someone outside the Space learns nothing about it.
    expect((await stats(outsiderToken, `/api/v1/spaces/${couple}/stats`)).status).toBe(404);
  });
});
