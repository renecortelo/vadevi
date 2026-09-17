import { BootstrapResponseSchema, DeletionJobResponseSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

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
