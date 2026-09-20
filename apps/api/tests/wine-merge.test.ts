import {
  BootstrapResponseSchema,
  CreateWineResponseSchema,
  MergeWinesResponseSchema,
  TastingSessionDetailResponseSchema,
  TastingSessionResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { mergeWines } from "../src/repositories/wine-merge";
import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * A confirmed merge, in the shapes the acceptance script never tried.
 *
 * Two real records of the same wine both list their grapes, both have been
 * poured at an event, and one of them was confirmed through identification.
 * The merge used to fail outright on the first (the grape rows collide on
 * their position), and to leave the other two pointing at the tombstone.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const token = emulatorIdToken({
  email: "merge-owner@example.test",
  name: "Merge Owner",
  sub: "firebase-emulator-user-merge-owner",
});

function headers(idempotent = false): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(idempotent ? { "Idempotency-Key": randomOpaqueToken() } : {}),
  };
}

async function spaceId(): Promise<string> {
  const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: headers(),
  });
  return BootstrapResponseSchema.parse(await response.json()).data.user.activeSpaceId;
}

async function createWine(space: string, displayName: string, grapes: { name: string }[]) {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${space}/wines`, {
    body: JSON.stringify({
      displayName,
      grapes,
      identityStatus: "confirmed",
      nonVintage: false,
      producerName: "Merge Producer",
      vintageYear: 2018,
      wineType: "red",
    }),
    headers: headers(true),
    method: "POST",
  });
  expect(response.status).toBe(201);
  return CreateWineResponseSchema.parse(await response.json()).data.wine;
}

async function merge(space: string, targetId: string, body: Record<string, unknown>) {
  return SELF.fetch(`https://vadevi.test/api/v1/spaces/${space}/wines/${targetId}/merge`, {
    body: JSON.stringify({ confirm: true, ...body }),
    headers: headers(),
    method: "POST",
  });
}

async function grapeNames(wineId: string): Promise<string[]> {
  const rows = await env.DB.prepare(
    `SELECT name_snapshot FROM wine_grapes WHERE wine_id = ? ORDER BY position`,
  )
    .bind(wineId)
    .all<{ name_snapshot: string }>();
  return rows.results.map((row) => row.name_snapshot);
}

describe("merging two wines that both have grapes, flights and a draft", () => {
  it("combines the grapes, moves the flight and the draft, and tombstones the source", async () => {
    const space = await spaceId();
    const target = await createWine(space, "Survivor", [
      { name: "Tempranillo" },
      { name: "Graciano" },
    ]);
    const source = await createWine(space, "Duplicate", [
      { name: "tempranillo " }, // the same grape, typed differently
      { name: "Mazuelo" },
    ]);

    // The source was poured at an event…
    const created = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${space}/sessions`, {
      body: JSON.stringify({ name: "Merge night", startsAt: "2026-08-13T18:00:00.000Z" }),
      headers: headers(true),
      method: "POST",
    });
    const session = TastingSessionResponseSchema.parse(await created.json()).data;
    const added = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${space}/sessions/${session.id}/wines`,
      {
        body: JSON.stringify({ entries: [{ wineId: source.id }] }),
        headers: headers(true),
        method: "POST",
      },
    );
    expect(added.status).toBe(200);

    // …and confirmed through identification.
    const draftId = randomOpaqueToken();
    await env.DB.prepare(
      `INSERT INTO identification_drafts (
        id, space_id, user_id, status, candidates_json, warnings_json, barcode, media_id,
        confirmed_wine_id, confirmed_at, expires_at, created_at, updated_at
      ) SELECT ?, ?, id, 'needs_confirmation', '[]', '[]', NULL, NULL, ?,
        '2026-08-14T00:10:00.000Z', '2026-08-14T00:30:00.000Z',
        '2026-08-14T00:00:00.000Z', '2026-08-14T00:10:00.000Z'
      FROM users WHERE firebase_uid = 'firebase-emulator-user-merge-owner'`,
    )
      .bind(draftId, space, source.id)
      .run();

    const response = await merge(space, target.id, {
      sourceVersion: source.version,
      sourceWineId: source.id,
      targetVersion: target.version,
    });
    expect(response.status).toBe(200);
    const merged = MergeWinesResponseSchema.parse(await response.json()).data;
    expect(merged.replayed).toBe(false);

    // The target's grapes first, in their order; the source's new one appended;
    // the duplicate dropped.
    expect(await grapeNames(target.id)).toEqual(["Tempranillo", "Graciano", "Mazuelo"]);
    expect(await grapeNames(source.id)).toEqual([]);

    // The flight now pours the survivor.
    const detail = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${space}/sessions/${session.id}`,
      { headers: headers() },
    );
    const flight = TastingSessionDetailResponseSchema.parse(await detail.json());
    expect(flight.data.wines.map((entry: { wine: { id: string } }) => entry.wine.id)).toEqual([
      target.id,
    ]);

    // The draft confirms the survivor.
    const draft = await env.DB.prepare(
      `SELECT confirmed_wine_id FROM identification_drafts WHERE id = ?`,
    )
      .bind(draftId)
      .first<{ confirmed_wine_id: string }>();
    expect(draft?.confirmed_wine_id).toBe(target.id);

    const tombstone = await env.DB.prepare(
      `SELECT merged_into_wine_id, deleted_at FROM wine_records WHERE id = ?`,
    )
      .bind(source.id)
      .first<{ deleted_at: string | null; merged_into_wine_id: string | null }>();
    expect(tombstone).toEqual({ deleted_at: expect.any(String), merged_into_wine_id: target.id });
  });

  it("moves nothing at all when the confirmation is stale", async () => {
    const space = await spaceId();
    const target = await createWine(space, "Stale Survivor", [{ name: "Garnacha" }]);
    const source = await createWine(space, "Stale Duplicate", [{ name: "Cariñena" }]);
    await SELF.fetch(`https://vadevi.test/api/v1/spaces/${space}/tasting-notes`, {
      body: JSON.stringify({
        descriptorCodes: [],
        mode: "quick",
        score100: 80,
        state: "submitted",
        tastedAt: "2026-08-03T19:00:00.000Z",
        wineId: source.id,
      }),
      headers: headers(true),
      method: "POST",
    });

    // The target moved on since the confirmation was read.
    const edited = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${space}/wines/${target.id}`,
      {
        body: JSON.stringify({ region: "Priorat", version: target.version }),
        headers: headers(true),
        method: "PATCH",
      },
    );
    expect(edited.status).toBe(200);

    const response = await merge(space, target.id, {
      sourceVersion: source.version,
      sourceWineId: source.id,
      targetVersion: target.version,
    });
    expect(response.status).toBe(409);

    // Not one row moved: the note, the grapes and the alias are where they were.
    const note = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM tasting_notes WHERE wine_id = ?`,
    )
      .bind(source.id)
      .first<{ total: number }>();
    expect(note?.total).toBe(1);
    expect(await grapeNames(source.id)).toEqual(["Cariñena"]);
    expect(await grapeNames(target.id)).toEqual(["Garnacha"]);
    const aliases = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM wine_aliases WHERE wine_id = ? AND kind = 'merge'`,
    )
      .bind(target.id)
      .first<{ total: number }>();
    expect(aliases?.total).toBe(0);
    const untouched = await env.DB.prepare(
      `SELECT merged_into_wine_id, deleted_at FROM wine_records WHERE id = ?`,
    )
      .bind(source.id)
      .first<{ deleted_at: string | null; merged_into_wine_id: string | null }>();
    expect(untouched).toEqual({ deleted_at: null, merged_into_wine_id: null });
  });

  it("moves nothing when the target changes between the check and the batch", async () => {
    // The race the early version check cannot see: another request edits the
    // target after the versions were read and before the batch runs. Every
    // statement in the batch is guarded on both versions, so the batch as a
    // whole is a no-op and the caller gets a 409 for a database it did not
    // change — not a source whose rows moved and whose tombstone did not.
    const space = await spaceId();
    const target = await createWine(space, "Raced Survivor", [{ name: "Xarel·lo" }]);
    const source = await createWine(space, "Raced Duplicate", [{ name: "Macabeu" }]);

    const racing = new Proxy(env.DB, {
      get(database, property, receiver) {
        if (property !== "batch") return Reflect.get(database, property, receiver);
        return async (statements: D1PreparedStatement[]) => {
          await database
            .prepare(`UPDATE wine_records SET version = version + 1 WHERE id = ?`)
            .bind(target.id)
            .run();
          return database.batch(statements);
        };
      },
    });
    const result = await mergeWines(racing, {
      principal: {
        authTime: Math.floor(Date.now() / 1_000),
        emailVerified: true,
        displayName: "Merge Owner",
        email: "merge-owner@example.test",
        firebaseUid: "firebase-emulator-user-merge-owner",
      },
      request: {
        confirm: true,
        sourceVersion: source.version,
        sourceWineId: source.id,
        targetVersion: target.version,
      },
      requestId: randomOpaqueToken(),
      spaceId: space,
      targetWineId: target.id,
    });
    expect(result.kind).toBe("conflict");
    expect(await grapeNames(source.id)).toEqual(["Macabeu"]);
    expect(await grapeNames(target.id)).toEqual(["Xarel·lo"]);
    const untouched = await env.DB.prepare(
      `SELECT merged_into_wine_id, deleted_at FROM wine_records WHERE id = ?`,
    )
      .bind(source.id)
      .first<{ deleted_at: string | null; merged_into_wine_id: string | null }>();
    expect(untouched).toEqual({ deleted_at: null, merged_into_wine_id: null });
  });
});
