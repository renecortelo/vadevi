import { BootstrapResponseSchema, WineMemoryResponseSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { ulid } from "ulid";
import { beforeAll, describe, expect, it } from "vitest";

import { jsonList } from "../src/services/sql-list";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * D1 binds at most 100 parameters to one statement. The contracts allow lists
 * longer than that leaves room for once the fixed parameters around the list
 * are counted — a page of 100 wines, an archive of 200 photographs — and the
 * queries used to spell each element out as its own `?`. These are the two
 * requests that failed at exactly the maximum the contract permits.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const token = emulatorIdToken({
  email: "d1-limit@example.test",
  name: "Limit Owner",
  sub: "firebase-emulator-user-d1-limit",
});
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

describe("lists longer than D1's parameter budget", () => {
  it("binds a list of any length as one parameter", async () => {
    const ids = Array.from({ length: 500 }, (_, index) => `id-${index}`);
    const list = jsonList(ids);
    const row = await env.DB.prepare(`SELECT COUNT(*) AS total FROM json_each(?)`)
      .bind(list.bind)
      .first<{ total: number }>();
    expect(row?.total).toBe(500);
    expect(list.sql).toBe("(SELECT value FROM json_each(?))");
  });

  it("lists a full page of 100 wines, each with the reader's last venue", async () => {
    const me = BootstrapResponseSchema.parse(
      await (await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers })).json(),
    );
    const spaceId = me.data.user.activeSpaceId;
    const now = new Date().toISOString();
    // Seeded directly: 100 wines through the API is slow and proves nothing more.
    const statements = [];
    for (let index = 0; index < 100; index += 1) {
      const wineId = ulid();
      const noteId = ulid();
      statements.push(
        env.DB.prepare(
          `INSERT INTO wine_records (
            id, space_id, display_name, normalized_name, producer_name, normalized_producer_name,
            non_vintage, identity_status, version, created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'Limit Producer', 'limit producer', 0, 'confirmed', 1, ?, ?, ?)`,
        ).bind(wineId, spaceId, `Wine ${index}`, `wine ${index}`, me.data.user.id, now, now),
        env.DB.prepare(
          `INSERT INTO tasting_notes
            (id, space_id, wine_id, author_user_id, mode, state, tasted_at, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'quick', 'submitted', ?, 1, ?, ?)`,
        ).bind(noteId, spaceId, wineId, me.data.user.id, now, now, now),
        env.DB.prepare(
          `INSERT INTO tasting_contexts (tasting_note_id, space_id, created_at, updated_at, venue_name)
            VALUES (?, ?, ?, ?, 'Bar Limit')`,
        ).bind(noteId, spaceId, now, now),
      );
    }
    await env.DB.batch(statements);

    const response = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines?limit=100`,
      { headers },
    );
    expect(response.status).toBe(200);
    const page = WineMemoryResponseSchema.parse(await response.json());
    expect(page.data).toHaveLength(100);
    expect(page.data.every((wine) => wine.lastVenue?.name === "Bar Limit")).toBe(true);
  });

  it("accepts an archive request for the contract's 200 photographs", async () => {
    const me = BootstrapResponseSchema.parse(
      await (await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers })).json(),
    );
    const spaceId = me.data.user.activeSpaceId;
    const mediaIds = Array.from({ length: 200 }, () => ulid());
    const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/export/media`, {
      body: JSON.stringify({ confirm: true, mediaIds }),
      headers,
      method: "POST",
    });
    // None of the ids exist, so the archive is empty — but the request was
    // answered rather than failed on the statement.
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Media-Count")).toBe("0");
  });

  it("pages by score without losing the unscored wines after the break", async () => {
    // A fresh member so the page is exactly these wines.
    const pagerToken = emulatorIdToken({
      email: "score-pager@example.test",
      name: "Score Pager",
      sub: "firebase-emulator-user-score-pager",
    });
    const pagerHeaders = { Authorization: `Bearer ${pagerToken}` };
    const me = BootstrapResponseSchema.parse(
      await (
        await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers: pagerHeaders })
      ).json(),
    );
    const spaceId = me.data.user.activeSpaceId;
    const now = new Date().toISOString();
    // Scores 90, 50, 0, and five wines never scored: sorting by score puts the
    // unscored ones last, and a page of two breaks inside them.
    const scores: (number | null)[] = [90, 50, 0, null, null, null, null, null];
    const statements = [];
    const seeded: string[] = [];
    for (const [index, score] of scores.entries()) {
      const wineId = ulid();
      seeded.push(wineId);
      statements.push(
        env.DB.prepare(
          `INSERT INTO wine_records (
            id, space_id, display_name, normalized_name, producer_name, normalized_producer_name,
            non_vintage, identity_status, version, created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'Pager Producer', 'pager producer', 0, 'confirmed', 1, ?, ?, ?)`,
        ).bind(wineId, spaceId, `Paged ${index}`, `paged ${index}`, me.data.user.id, now, now),
      );
      if (score !== null) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO tasting_notes
              (id, space_id, wine_id, author_user_id, mode, state, tasted_at, score_100, version, created_at, updated_at)
              VALUES (?, ?, ?, ?, 'quick', 'submitted', ?, ?, 1, ?, ?)`,
          ).bind(ulid(), spaceId, wineId, me.data.user.id, now, score, now, now),
        );
      }
    }
    await env.DB.batch(statements);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const url = `https://vadevi.test/api/v1/spaces/${spaceId}/wines?limit=2&sort=score${
        cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`
      }`;
      const response = await SELF.fetch(url, { headers: pagerHeaders });
      expect(response.status).toBe(200);
      const body = WineMemoryResponseSchema.parse(await response.json());
      seen.push(...body.data.map((wine: { id: string }) => wine.id));
      cursor = body.page.nextCursor;
      if (!body.page.hasMore) break;
    }
    // Every wine once: the scored ones first, then all five unscored ones.
    expect([...seen].sort()).toEqual([...seeded].sort());
    expect(seen.slice(0, 3).map((id) => seeded.indexOf(id))).toEqual([0, 1, 2]);
  });
});
