import {
  BootstrapResponseSchema,
  GrapeProposalsResponseSchema,
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
  it("offers what cannot be linked, renames only what is confirmed, and only for members", async () => {
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
      wine("Penedes", "ES"),
      wine("Penedès", "ES"),
      wine("Penedès", "ES"),
    ]);
    const url = `https://vadevi.test/api/v1/spaces/${spaceId}/regions/tidy`;
    const proposals = async () =>
      RegionProposalsResponseSchema.parse(
        await (await SELF.fetch(url, { headers: headers(owner) })).json(),
      ).data;

    const first = await proposals();
    // A registered name reads as one already, linked: nothing to offer.
    expect(first.some((proposal) => proposal.to === "Empordà")).toBe(false);
    // One the register lacks, written two ways, is offered under the spelling used most.
    expect(first).toContainEqual({
      countryCode: "ES",
      from: [{ region: "Penedes", wines: 1 }],
      reason: "variants",
      to: "Penedès",
      unchanged: 2,
    });
    expect(first).toContainEqual(
      expect.objectContaining({
        from: [{ region: "La Mancga", wines: 1 }],
        reason: "typo",
        to: "La Mancha",
      }),
    );

    // Confirmed: the misspelt wine is renamed, and linked to the registered name.
    const renamed = await SELF.fetch(url, {
      body: JSON.stringify({ from: ["La Mancga"], to: "La Mancha" }),
      headers: headers(owner),
      method: "POST",
    });
    expect(RenameRegionsResponseSchema.parse(await renamed.json()).data.renamed).toBe(1);
    const row = await env.DB.prepare(
      `SELECT region, region_ref, country_code FROM wine_records WHERE space_id = ? AND region = 'La Mancha'`,
    )
      .bind(spaceId)
      .first<{ country_code: string | null; region: string; region_ref: string | null }>();
    expect(row).toEqual({ country_code: "ES", region: "La Mancha", region_ref: "tidy-la-mancha" });
    // The Penedès spellings wait for their own yes.
    const second = await proposals();
    expect(second.some((proposal) => proposal.to === "La Mancha")).toBe(false);
    expect(second.some((proposal) => proposal.to === "Penedès")).toBe(true);

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

  it("offers only grapes the library cannot link, and renames them on confirming", async () => {
    const me = BootstrapResponseSchema.parse(
      await (
        await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers: headers(owner) })
      ).json(),
    );
    const spaceId = me.data.user.activeSpaceId;
    const now = new Date().toISOString();
    const statements = [
      env.DB.prepare(
        `INSERT OR IGNORE INTO kb_grapes (id, wikidata_id, prominence) VALUES ('tidy-carignan', 'Q-tidy-1', 5)`,
      ),
      ...[
        ["es", "Cariñena", "cariñena", "primary"],
        ["en", "Carignan", "carignan", "primary"],
        ["*", "Samsó", "samso", "synonym"],
      ].map(([locale, name, normalized, kind]) =>
        env.DB.prepare(
          `INSERT OR IGNORE INTO kb_names
            (entity_type, entity_id, locale, name, normalized_name, kind, source)
            VALUES ('grape', 'tidy-carignan', ?, ?, ?, ?, 'wikidata')`,
        ).bind(locale, name, normalized!.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""), kind),
      ),
    ];
    const wineIds: string[] = [];
    for (const grape of ["Carignan", "Samsó", "Sumoll", "Sumoll", "sumoll"]) {
      const id = ulid();
      wineIds.push(id);
      statements.push(
        env.DB.prepare(
          `INSERT INTO wine_records (
            id, space_id, display_name, normalized_name, producer_name, normalized_producer_name,
            non_vintage, identity_status, version, created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, 'Negre', ?, 'Celler', 'celler', 0, 'confirmed', 1, ?, ?, ?)`,
        ).bind(id, spaceId, `negre ${id}`, me.data.user.id, now, now),
        env.DB.prepare(
          `INSERT INTO wine_grapes (id, space_id, wine_id, name_snapshot, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, ?, ?)`,
        ).bind(ulid(), spaceId, id, grape, now, now),
      );
    }
    await env.DB.batch(statements);
    const url = `https://vadevi.test/api/v1/spaces/${spaceId}/grapes/tidy`;
    const proposals = GrapeProposalsResponseSchema.parse(
      await (await SELF.fetch(`${url}?locale=es`, { headers: headers(owner) })).json(),
    ).data;
    // Carignan and Samsó are one library grape: linked, they read as Cariñena
    // already, in every language, so they are not offered.
    expect(proposals.some((proposal) => proposal.to === "Cariñena")).toBe(false);
    // A grape the library does not know, written two ways, is.
    expect(proposals).toContainEqual({
      from: [{ grape: "sumoll", wines: 1 }],
      to: "Sumoll",
      unchanged: 2,
    });
    const renamed = await SELF.fetch(url, {
      body: JSON.stringify({ from: ["sumoll"], to: "Sumoll" }),
      headers: headers(owner),
      method: "POST",
    });
    expect(RenameRegionsResponseSchema.parse(await renamed.json()).data.renamed).toBe(1);
    const grapes = await env.DB.prepare(
      `SELECT DISTINCT name_snapshot FROM wine_grapes WHERE wine_id IN (?, ?, ?, ?, ?) ORDER BY 1`,
    )
      .bind(...wineIds)
      .all<{ name_snapshot: string }>();
    expect(grapes.results.map((row) => row.name_snapshot)).toEqual(["Carignan", "Samsó", "Sumoll"]);
    // The renamed wine is a new version, for the devices that sync it.
    const versions = await env.DB.prepare(
      `SELECT MAX(version) AS top FROM wine_records WHERE id IN (?, ?, ?, ?, ?)`,
    )
      .bind(...wineIds)
      .first<{ top: number }>();
    expect(versions?.top).toBe(2);
  });
});
