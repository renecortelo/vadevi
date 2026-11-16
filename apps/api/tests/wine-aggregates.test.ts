import {
  BootstrapResponseSchema,
  CreateWineResponseSchema,
  DeepTastingResponseSchema,
  SyncResponseSchema,
  WineMemoryResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { ulid } from "ulid";
import { beforeAll, describe, expect, it } from "vitest";

import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * A wine's tasting figures — how many notes, the last tasting, the average
 * submitted score — are stored on the wine (migration 0053) and refreshed by
 * every write that can change them (`wine-figures.ts`). Stored figures can
 * drift from the notes only if some path forgets that refresh, so this writes
 * notes by every path there is and, after each, checks the stored figures of
 * every wine in the Space against the notes themselves.
 */

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const token = emulatorIdToken({
  email: "figures@example.test",
  sub: "firebase-emulator-user-figures",
});

function headers(idempotencyKey?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(idempotencyKey === undefined ? {} : { "Idempotency-Key": idempotencyKey }),
  };
}

async function call(path: string, method: string, body: unknown, key = true) {
  return SELF.fetch(`https://vadevi.test${path}`, {
    body: JSON.stringify(body),
    headers: headers(key ? randomOpaqueToken() : undefined),
    method,
  });
}

/** Wines whose stored figures disagree with their notes; empty when all agree. */
async function drift(spaceId: string) {
  const rows = await env.DB.prepare(
    `SELECT wine.id, wine.note_count, wine.last_tasted_at, wine.score_100,
      (SELECT COUNT(*) FROM tasting_notes note
        WHERE note.space_id = wine.space_id AND note.wine_id = wine.id
          AND note.deleted_at IS NULL) AS count_now,
      (SELECT MAX(note.tasted_at) FROM tasting_notes note
        WHERE note.space_id = wine.space_id AND note.wine_id = wine.id
          AND note.deleted_at IS NULL) AS last_now,
      (SELECT CAST(ROUND(AVG(note.score_100)) AS INTEGER) FROM tasting_notes note
        WHERE note.space_id = wine.space_id AND note.wine_id = wine.id
          AND note.deleted_at IS NULL AND note.state = 'submitted'
          AND note.score_100 IS NOT NULL) AS score_now
    FROM wine_records wine WHERE wine.space_id = ?`,
  )
    .bind(spaceId)
    .all<{
      count_now: number;
      id: string;
      last_now: string | null;
      last_tasted_at: string | null;
      note_count: number;
      score_100: number | null;
      score_now: number | null;
    }>();
  return rows.results.filter(
    (row) =>
      row.note_count !== row.count_now ||
      row.last_tasted_at !== row.last_now ||
      row.score_100 !== row.score_now,
  );
}

async function figures(wineId: string) {
  return env.DB.prepare(
    `SELECT note_count AS count, last_tasted_at AS last, score_100 AS score, version, updated_at
    FROM wine_records WHERE id = ?`,
  )
    .bind(wineId)
    .first<{
      count: number;
      last: string | null;
      score: number | null;
      updated_at: string;
      version: number;
    }>();
}

describe("a wine's stored tasting figures", () => {
  it("agree with its notes after every way a note is written", async () => {
    const me = BootstrapResponseSchema.parse(
      await (
        await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers: headers() })
      ).json(),
    );
    const spaceId = me.data.user.activeSpaceId;
    const base = `/api/v1/spaces/${spaceId}`;

    const wine = async (displayName: string) => {
      const response = await call(`${base}/wines`, "POST", {
        displayName,
        identityStatus: "confirmed",
        nonVintage: false,
        producerName: "Celler de les Xifres",
        vintageYear: 2020,
        wineType: "red",
      });
      expect(response.status).toBe(201);
      return CreateWineResponseSchema.parse(await response.json()).data.wine;
    };
    const target = await wine("Xifra Alfa");
    const source = await wine("Xifra Beta");
    const untouched = await figures(target.id);

    // Quick Log: one submitted and scored, one draft with a higher score that
    // must count as a note and a date but not towards the average.
    for (const [state, score100, tastedAt] of [
      ["submitted", 80, "2026-10-01T20:00:00.000Z"],
      ["draft", 100, "2026-10-05T20:00:00.000Z"],
    ] as const) {
      const response = await call(`${base}/tasting-notes`, "POST", {
        descriptorCodes: [],
        mode: "quick",
        score100,
        state,
        tastedAt,
        wineId: target.id,
      });
      expect(response.status).toBe(201);
    }
    expect(await drift(spaceId)).toEqual([]);
    expect(await figures(target.id)).toMatchObject({
      count: 2,
      last: "2026-10-05T20:00:00.000Z",
      score: 80,
      // A tasting is not an edit of the wine.
      updated_at: untouched?.updated_at,
      version: untouched?.version,
    });

    // A deep note, created as a draft, edited, then submitted.
    const created = await call(`${base}/tasting-notes`, "POST", {
      mode: "deep",
      score100: 60,
      state: "draft",
      tastedAt: "2026-10-03T20:00:00.000Z",
      wineId: source.id,
    });
    expect(created.status).toBe(201);
    const deep = DeepTastingResponseSchema.parse(await created.json()).data;
    expect(await drift(spaceId)).toEqual([]);
    expect(await figures(source.id)).toMatchObject({ count: 1, score: null });

    const edited = await call(
      `${base}/tasting-notes/${deep.id}`,
      "PATCH",
      { score100: 70, version: deep.version },
      false,
    );
    expect(edited.status).toBe(200);
    expect(await drift(spaceId)).toEqual([]);

    const submitted = await call(
      `${base}/tasting-notes/${deep.id}/submit`,
      "POST",
      { version: deep.version + 1 },
      false,
    );
    expect(submitted.status).toBe(200);
    expect(await drift(spaceId)).toEqual([]);
    expect(await figures(source.id)).toMatchObject({ count: 1, score: 70 });

    // Editing a submitted note's score moves the average.
    const rescored = await call(
      `${base}/tasting-notes/${deep.id}`,
      "PATCH",
      { score100: 76, version: deep.version + 2 },
      false,
    );
    expect(rescored.status).toBe(200);
    expect(await drift(spaceId)).toEqual([]);
    expect(await figures(source.id)).toMatchObject({ count: 1, score: 76 });

    // The offline queue, replayed through /sync.
    const synced = await call(
      `${base}/sync`,
      "POST",
      {
        cursor: null,
        deviceId: ulid(),
        mutations: [
          {
            baseVersion: null,
            mutationId: ulid(),
            occurredAt: "2026-10-07T20:00:00.000Z",
            operation: "create",
            payload: {
              descriptorCodes: [],
              mode: "quick",
              score100: 91,
              state: "submitted",
              tastedAt: "2026-10-07T20:00:00.000Z",
              wineId: source.id,
            },
            resourceId: ulid(),
            resourceType: "tasting_note",
          },
        ],
      },
      false,
    );
    expect(SyncResponseSchema.parse(await synced.json()).data.mutationResults[0]?.status).toBe(
      "applied",
    );
    expect(await drift(spaceId)).toEqual([]);
    expect(await figures(source.id)).toMatchObject({
      count: 2,
      last: "2026-10-07T20:00:00.000Z",
      // (76 + 91) / 2 = 83.5, rounded half away from zero.
      score: 84,
    });

    // A merge moves the source's notes to the target.
    const sourceNow = await figures(source.id);
    const targetNow = await figures(target.id);
    const merged = await call(`${base}/wines/${target.id}/merge`, "POST", {
      confirm: true,
      sourceVersion: sourceNow?.version,
      sourceWineId: source.id,
      targetVersion: targetNow?.version,
    });
    expect(merged.status).toBe(200);
    expect(await drift(spaceId)).toEqual([]);
    expect(await figures(target.id)).toMatchObject({
      count: 4,
      last: "2026-10-07T20:00:00.000Z",
      // (80 + 76 + 91) / 3 = 82.3, the draft's 100 left out.
      score: 82,
    });
    expect(await figures(source.id)).toMatchObject({ count: 0, last: null, score: null });

    // And the list shows what is stored.
    const list = WineMemoryResponseSchema.parse(
      await (
        await SELF.fetch(`https://vadevi.test${base}/wines?sort=score`, { headers: headers() })
      ).json(),
    );
    expect(list.data.find((entry) => entry.id === target.id)).toMatchObject({
      lastTastedAt: "2026-10-07T20:00:00.000Z",
      noteCount: 4,
      score100: 82,
    });
  });
});
