import { BootstrapResponseSchema, DeletionJobResponseSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { purgeSpace, spaceScopedTables } from "../src/repositories/deletion";
import { randomOpaqueToken } from "../src/security/opaque-token";
import worker from "../src/worker";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * The two halves of deletion that nothing was watching.
 *
 * The Space purge is covered elsewhere, but by calling the executor directly.
 * In a deployment nothing calls it directly: the scheduled handler does, once a
 * day. If that wiring were dropped, every existing test would still pass and no
 * account or Space would ever actually be purged — the failure nobody notices
 * because its symptom is that nothing happens.
 *
 * And account deletion was covered only as far as scheduling it. What the purge
 * then does to a shared Space is the part worth being sure about: a member
 * leaving must not take other people's bottles with them.
 */

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

function headers(token: string, idempotencyKey?: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    ...(idempotencyKey === undefined ? {} : { "idempotency-key": idempotencyKey }),
  };
}

/** Headers for a mutation, which the API requires an idempotency key for. */
function mutate(token: string): Record<string, string> {
  return headers(token, randomOpaqueToken());
}

async function bootstrap(token: string) {
  const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: headers(token),
  });
  expect(response.status).toBe(200);
  return BootstrapResponseSchema.parse(await response.json());
}

/** Runs the Worker's own scheduled handler, the way Cloudflare would. */
async function runCron(atIso: string): Promise<void> {
  await worker.scheduled(
    { cron: "0 3 * * *", noRetry: () => undefined, scheduledTime: Date.parse(atIso) },
    env,
  );
}

describe("the scheduled handler purges (AC-064)", () => {
  it("completes a due Space job without anything calling the executor directly", async () => {
    const token = emulatorIdToken({
      email: "cron-owner@example.test",
      name: "Cron Owner",
      sub: "firebase-emulator-user-cron-owner",
    });
    const me = await bootstrap(token);

    const created = await SELF.fetch("https://vadevi.test/api/v1/spaces", {
      body: JSON.stringify({ defaultLocale: "en", name: "Cron Purge Space", type: "group" }),
      headers: mutate(token),
      method: "POST",
    });
    expect(created.status).toBe(201);
    const spaceId = (await created.json<{ data: { space: { id: string } } }>()).data.space.id;

    // Real bytes in R2, so "the object is gone" means something.
    const mediaId = "01JMEDIA00000000000000CRON";
    const r2Key = `private/${mediaId}`;
    await env.MEDIA.put(r2Key, new Uint8Array([9, 9, 9]));
    await env.DB.prepare(
      `INSERT INTO media_assets (
        id, space_id, owner_user_id, kind, r2_key, mime_type, byte_size, sha256,
        width, height, processing_status, expires_at, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, 'label', ?, 'image/jpeg', 3, 'synthetic-hash', 10, 10, 'ready',
        '2030-01-01T00:00:00.000Z', '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z', NULL)`,
    )
      .bind(mediaId, spaceId, me.data.user.id, r2Key)
      .run();

    // A bottle confirmed through identification leaves a draft behind as a
    // tombstone, with no expiry, pointing at the Space, the photo and the wine.
    // The purge used to skip that table, so every Space with one failed its
    // purge on the FOREIGN KEY — every five minutes, for ever.
    const wine = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
      body: JSON.stringify({
        displayName: "Confirmed Through Identification",
        identityStatus: "confirmed",
        nonVintage: false,
        producerName: "Cron Producer",
        vintageYear: 2020,
        wineType: "red",
      }),
      headers: mutate(token),
      method: "POST",
    });
    expect(wine.status).toBe(201);
    const wineId = (await wine.json<{ data: { wine: { id: string } } }>()).data.wine.id;
    await env.DB.prepare(
      `INSERT INTO identification_drafts (
        id, space_id, user_id, status, candidates_json, warnings_json, barcode, media_id,
        confirmed_wine_id, confirmed_at, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'needs_confirmation', '[]', '[]', NULL, ?, ?,
        '2026-08-14T00:10:00.000Z', '2026-08-14T00:30:00.000Z',
        '2026-08-14T00:00:00.000Z', '2026-08-14T00:10:00.000Z')`,
    )
      .bind("01JDRAFT000000000000000CRON", spaceId, me.data.user.id, mediaId, wineId)
      .run();

    const scheduled = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/deletion`, {
      body: JSON.stringify({ confirm: true, confirmationText: "Cron Purge Space" }),
      headers: headers(token),
      method: "POST",
    });
    expect(scheduled.status).toBe(202);
    const job = DeletionJobResponseSchema.parse(await scheduled.json()).data;

    // Before the grace period the cron must leave it alone. A purge that runs
    // early is worse than one that never runs.
    await runCron("2026-08-14T03:00:00.000Z");
    expect(await env.MEDIA.get(r2Key)).not.toBeNull();

    await runCron(new Date(Date.parse(job.purgeAfter) + 1_000).toISOString());
    expect(await env.MEDIA.get(r2Key)).toBeNull();

    const remaining = await env.DB.prepare(`SELECT COUNT(*) AS total FROM spaces WHERE id = ?`)
      .bind(spaceId)
      .first<{ total: number }>();
    expect(remaining?.total).toBe(0);
    const drafts = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM identification_drafts WHERE space_id = ?`,
    )
      .bind(spaceId)
      .first<{ total: number }>();
    expect(drafts?.total).toBe(0);
    const completed = await env.DB.prepare(`SELECT state FROM deletion_jobs WHERE id = ?`)
      .bind(job.id)
      .first<{ state: string }>();
    expect(completed?.state).toBe("completed");
  });

  it("tells the note index which vectors to forget before their rows go", async () => {
    const token = emulatorIdToken({
      email: "index-owner@example.test",
      name: "Index Owner",
      sub: "firebase-emulator-user-index-owner",
    });
    const me = await bootstrap(token);
    const created = await SELF.fetch("https://vadevi.test/api/v1/spaces", {
      body: JSON.stringify({ defaultLocale: "en", name: "Indexed Space", type: "group" }),
      headers: mutate(token),
      method: "POST",
    });
    const spaceId = (await created.json<{ data: { space: { id: string } } }>()).data.space.id;
    const wine = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
      body: JSON.stringify({
        displayName: "Indexed Wine",
        identityStatus: "confirmed",
        nonVintage: false,
        producerName: "Index Producer",
        vintageYear: 2020,
        wineType: "red",
      }),
      headers: mutate(token),
      method: "POST",
    });
    const wineId = (await wine.json<{ data: { wine: { id: string } } }>()).data.wine.id;
    const now = "2026-08-14T00:00:00.000Z";
    // One note the index holds, one it never received.
    const embeddedId = randomOpaqueToken();
    const pendingId = randomOpaqueToken();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO tasting_notes
          (id, space_id, wine_id, author_user_id, mode, state, tasted_at, comment, embedded_at, version, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'quick', 'submitted', ?, 'indexed', ?, 1, ?, ?)`,
      ).bind(embeddedId, spaceId, wineId, me.data.user.id, now, now, now, now),
      env.DB.prepare(
        `INSERT INTO tasting_notes
          (id, space_id, wine_id, author_user_id, mode, state, tasted_at, comment, embedded_at, version, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'quick', 'submitted', ?, 'pending', NULL, 1, ?, ?)`,
      ).bind(pendingId, spaceId, wineId, me.data.user.id, now, now, now),
    ]);

    const forgotten: string[] = [];
    const port = {
      index: async () => true,
      remove: async (ids: readonly string[]) => {
        forgotten.push(...ids);
      },
      search: async () => [],
    };
    // An index that cannot be told stops the purge: the rows stay, the job retries.
    const refusing = {
      ...port,
      remove: async () => {
        throw new Error("index unavailable");
      },
    };
    await expect(purgeSpace(env.DB, env.MEDIA, spaceId, refusing)).rejects.toThrow(/unavailable/);
    const stillThere = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM tasting_notes WHERE space_id = ?`,
    )
      .bind(spaceId)
      .first<{ total: number }>();
    expect(stillThere?.total).toBe(2);

    await purgeSpace(env.DB, env.MEDIA, spaceId, port);
    expect(forgotten).toEqual([embeddedId]);
    const gone = await env.DB.prepare(`SELECT COUNT(*) AS total FROM spaces WHERE id = ?`)
      .bind(spaceId)
      .first<{ total: number }>();
    expect(gone?.total).toBe(0);
  });

  it("purges every table that carries a space_id", async () => {
    // The purge list is written by hand, and a table added later with a
    // space_id and a foreign key onto spaces is exactly what makes a purge
    // throw for ever. So the schema is the oracle: every table with that
    // column is either on the list, or named here with the reason it is not.
    const exempt = new Set([
      // Not Space-scoped rows: a user's pointer to their active Space.
      "users",
      // The Space row itself, deleted last.
      "spaces",
      // Kept: the record that the purge happened, and its counters.
      "deletion_jobs",
      "usage_counters",
    ]);
    const tables = await env.DB.prepare(
      `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql LIKE '%space_id%'`,
    ).all<{ name: string; sql: string }>();
    const purged = new Set<string>(
      spaceScopedTables.map((table) => table.replace(/_by_space$/, "")),
    );
    const missing = tables.results
      .map((table) => table.name)
      .filter((name) => !exempt.has(name) && !purged.has(name) && !name.startsWith("sqlite_"));
    expect(missing).toEqual([]);
  });
});

describe("account deletion leaves other people's data alone (AC-064)", () => {
  it("purges the leaver's own Space and detaches them, keeping the shared one", async () => {
    const leaverToken = emulatorIdToken({
      email: "leaver@example.test",
      name: "Leaver",
      sub: "firebase-emulator-user-leaver",
    });
    const stayerToken = emulatorIdToken({
      email: "stayer@example.test",
      name: "Stayer",
      sub: "firebase-emulator-user-stayer",
    });
    const leaver = await bootstrap(leaverToken);
    const stayer = await bootstrap(stayerToken);

    // A Space the stayer owns, which the leaver joins.
    const shared = await SELF.fetch("https://vadevi.test/api/v1/spaces", {
      body: JSON.stringify({ defaultLocale: "en", name: "Shared After Leaving", type: "group" }),
      headers: mutate(stayerToken),
      method: "POST",
    });
    expect(shared.status).toBe(201);
    const sharedId = (await shared.json<{ data: { space: { id: string } } }>()).data.space.id;

    // Joined through the real invitation flow, so the membership row is the one
    // the application would actually have written.
    const invitation = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${sharedId}/invitations`,
      {
        body: JSON.stringify({ intendedRole: "member" }),
        headers: mutate(stayerToken),
        method: "POST",
      },
    );
    expect(invitation.status).toBe(201);
    const inviteToken = invitation.headers.get("Location")!.split("/").at(-1)!;
    const accepted = await SELF.fetch(
      `https://vadevi.test/api/v1/invitations/${inviteToken}/accept`,
      { headers: mutate(leaverToken), method: "POST" },
    );
    expect(accepted.status).toBe(200);

    // A bottle in the shared Space that belongs to the Space, not the leaver.
    const wine = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${sharedId}/wines`, {
      body: JSON.stringify({
        displayName: "Stayer's Bottle",
        identityStatus: "confirmed",
        nonVintage: false,
        producerName: "Synthetic Stayer Producer",
        wineType: "red",
      }),
      headers: mutate(stayerToken),
      method: "POST",
    });
    expect(wine.status).toBe(201);

    const requested = await SELF.fetch("https://vadevi.test/api/v1/me/deletion", {
      body: JSON.stringify({ confirm: true, confirmationText: "DELETE" }),
      headers: mutate(leaverToken),
      method: "POST",
    });
    expect(requested.status).toBe(202);
    const job = DeletionJobResponseSchema.parse(await requested.json()).data;

    await runCron(new Date(Date.parse(job.purgeAfter) + 1_000).toISOString());

    // The leaver's own personal Space is gone.
    const personal = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM spaces WHERE type = 'personal' AND created_by_user_id = ?`,
    )
      .bind(leaver.data.user.id)
      .first<{ total: number }>();
    expect(personal?.total).toBe(0);

    // They are no longer a member of the shared Space.
    const membership = await env.DB.prepare(
      `SELECT status FROM space_memberships WHERE space_id = ? AND user_id = ?`,
    )
      .bind(sharedId, leaver.data.user.id)
      .first<{ status: string }>();
    expect(membership?.status).toBe("left");

    // And the record is anonymised rather than left carrying an address.
    const user = await env.DB.prepare(
      `SELECT display_name, email_normalized, deleted_at FROM users WHERE id = ?`,
    )
      .bind(leaver.data.user.id)
      .first<{
        deleted_at: string | null;
        display_name: string;
        email_normalized: string | null;
      }>();
    expect(user?.email_normalized).toBeNull();
    expect(user?.deleted_at).not.toBeNull();

    // The Space survives, and so does the bottle that was never theirs.
    const stillThere = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${sharedId}/wines`, {
      headers: headers(stayerToken),
    });
    expect(stillThere.status).toBe(200);
    const listed = await stillThere.json<{ data: { displayName: string }[] }>();
    expect(listed.data.map((entry) => entry.displayName)).toContain("Stayer's Bottle");
    expect(stayer.data.user.id).not.toBe(leaver.data.user.id);
  });
});
