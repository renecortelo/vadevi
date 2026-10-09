import {
  BootstrapResponseSchema,
  ProducerProposalsResponseSchema,
  RegionProposalsResponseSchema,
  RenameRegionsResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { ulid } from "ulid";
import { beforeAll, describe, expect, it } from "vitest";

import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const token = (name: string) =>
  emulatorIdToken({
    email: `tidy-${name}@example.test`,
    name,
    sub: `firebase-emulator-user-tidy-${name}`,
  });
const owner = token("owner");
const outsider = token("outsider");
const headers = (bearer: string) => ({
  Authorization: `Bearer ${bearer}`,
  "Content-Type": "application/json",
});

describe("tidying a Space's regions", () => {
  it("offers each group to confirm, renames only what is confirmed, and only for members", async () => {
    const me = BootstrapResponseSchema.parse(
      await (
        await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers: headers(owner) })
      ).json(),
    );
    await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers: headers(outsider) });
    const spaceId = me.data.user.activeSpaceId;
    const now = new Date().toISOString();
    const wine = (region: string, country: string | null) =>
      env.DB.prepare(
        `INSERT INTO wine_records (
          id, space_id, display_name, normalized_name, producer_name, normalized_producer_name,
          non_vintage, region, country_code, identity_status, version, created_by_user_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'Celler', 'celler', 0, ?, ?, 'confirmed', 1, ?, ?, ?)`,
      ).bind(
        ulid(),
        spaceId,
        `Vi ${region}`,
        `vi ${ulid()}`,
        region,
        country,
        me.data.user.id,
        now,
        now,
      );
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO kb_regions (id, eambrosia_id, name, country_code, gi_type) VALUES
          ('tidy-emporda', 'PDO-TIDY-1', 'Empordà', 'ES', 'PDO'),
          ('tidy-la-mancha', 'PDO-TIDY-2', 'La Mancha', 'ES', 'PDO')`,
      ),
      env.DB.prepare(
        `INSERT OR IGNORE INTO kb_names
          (entity_type, entity_id, locale, name, normalized_name, kind, source) VALUES
          ('region', 'tidy-emporda', '*', 'Empordà', 'emporda', 'primary', 'register'),
          ('region', 'tidy-la-mancha', '*', 'La Mancha', 'la mancha', 'primary', 'register')`,
      ),
      wine("DO Empordà", null),
      wine("Emporda", "ES"),
      wine("Empordà", "ES"),
      wine("Empordà", "ES"),
      wine("La Mancga", "ES"),
    ]);
    const url = `https://vadevi.test/api/v1/spaces/${spaceId}/regions/tidy`;
    const proposals = async () =>
      RegionProposalsResponseSchema.parse(
        await (await SELF.fetch(url, { headers: headers(owner) })).json(),
      ).data;

    const first = await proposals();
    expect(first).toContainEqual({
      countryCode: "ES",
      from: [
        { region: "DO Empordà", wines: 1 },
        { region: "Emporda", wines: 1 },
      ],
      reason: "variants",
      to: "Empordà",
      unchanged: 2,
    });
    expect(first).toContainEqual(
      expect.objectContaining({
        from: [{ region: "La Mancga", wines: 1 }],
        reason: "typo",
        to: "La Mancha",
      }),
    );

    // Confirmed: those wines are renamed, and the one without a country gets it.
    const renamed = await SELF.fetch(url, {
      body: JSON.stringify({ from: ["DO Empordà", "Emporda"], to: "Empordà" }),
      headers: headers(owner),
      method: "POST",
    });
    expect(RenameRegionsResponseSchema.parse(await renamed.json()).data.renamed).toBe(2);
    const rows = await env.DB.prepare(
      `SELECT region, country_code FROM wine_records WHERE space_id = ? AND region = 'Empordà'`,
    )
      .bind(spaceId)
      .all<{ country_code: string | null; region: string }>();
    expect(rows.results).toHaveLength(4);
    expect(rows.results.every((row) => row.country_code === "ES")).toBe(true);
    // Nothing left to tidy there; the misspelling waits for its own yes.
    const second = await proposals();
    expect(second.some((proposal) => proposal.to === "Empordà")).toBe(false);
    expect(second.some((proposal) => proposal.to === "La Mancha")).toBe(true);

    // Someone outside the Space learns nothing of it.
    expect((await SELF.fetch(url, { headers: headers(outsider) })).status).toBe(404);
  });

  it("offers producers written several ways, and renames only what is confirmed", async () => {
    const me = BootstrapResponseSchema.parse(
      await (
        await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers: headers(owner) })
      ).json(),
    );
    const spaceId = me.data.user.activeSpaceId;
    const now = new Date().toISOString();
    const wine = (producer: string) =>
      env.DB.prepare(
        `INSERT INTO wine_records (
          id, space_id, display_name, normalized_name, producer_name, normalized_producer_name,
          non_vintage, identity_status, version, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, 'Brut', ?, ?, ?, 0, 'confirmed', 1, ?, ?, ?)`,
      ).bind(
        ulid(),
        spaceId,
        `brut ${ulid()}`,
        producer,
        producer.toLowerCase(),
        me.data.user.id,
        now,
        now,
      );
    await env.DB.batch([
      wine("Bodegas Sumarroca"),
      wine("Bodegas Sumarroca"),
      wine("Sumarroca"),
      wine("Muga"),
    ]);
    const url = `https://vadevi.test/api/v1/spaces/${spaceId}/producers/tidy`;
    const proposals = ProducerProposalsResponseSchema.parse(
      await (await SELF.fetch(url, { headers: headers(owner) })).json(),
    ).data;
    expect(proposals).toContainEqual({
      from: [{ producer: "Sumarroca", wines: 1 }],
      to: "Bodegas Sumarroca",
      unchanged: 2,
    });
    expect(proposals.some((proposal) => proposal.to === "Muga")).toBe(false);
    const renamed = await SELF.fetch(url, {
      body: JSON.stringify({ from: ["Sumarroca"], to: "Bodegas Sumarroca" }),
      headers: headers(owner),
      method: "POST",
    });
    expect(RenameRegionsResponseSchema.parse(await renamed.json()).data.renamed).toBe(1);
  });
});
