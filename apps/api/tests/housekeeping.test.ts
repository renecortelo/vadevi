import { BootstrapResponseSchema, MediaReservationResponseSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { runHousekeeping } from "../src/repositories/housekeeping";
import { randomOpaqueToken } from "../src/security/opaque-token";
import worker from "../src/worker";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * What expires, expired. Every table with a window was filtered on read and
 * kept on disk for ever — a reverse-geocode "cached for 30 days" was cached
 * for good. The scheduled handler now removes what has passed its window,
 * and only that.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const token = emulatorIdToken({
  email: "housekeeping@example.test",
  name: "Housekeeper",
  sub: "firebase-emulator-user-housekeeping",
});

const past = "2026-01-01T00:00:00.000Z";
const future = "2030-01-01T00:00:00.000Z";
const now = "2026-08-14T00:00:00.000Z";

async function count(table: string, where: string, ...binds: unknown[]): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE ${where}`)
    .bind(...binds)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

describe("housekeeping", () => {
  it("removes expired cache, windows, keys and counters, and keeps what is live", async () => {
    const me = BootstrapResponseSchema.parse(
      await (
        await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).json(),
    );
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO external_adapter_cache (provider, cache_key, response_json, expires_at, created_at, updated_at)
         VALUES ('nominatim', 'hk-old', '{}', ?, ?, ?), ('nominatim', 'hk-live', '{}', ?, ?, ?)`,
      ).bind(past, past, past, future, past, past),
      env.DB.prepare(
        `INSERT INTO external_rate_windows (provider, window_started_at, request_count, updated_at)
         VALUES ('nominatim', 'hk-old', 1, ?), ('nominatim', 'hk-live', 1, ?)`,
      ).bind(past, now),
      env.DB.prepare(
        `INSERT INTO idempotency_keys (user_id, route_scope, key_hash, request_hash, response_status, response_body_hash, resource_id, expires_at, created_at)
         VALUES (?, 'hk', 'old', 'h', 200, 'b', 'r', ?, ?), (?, 'hk', 'live', 'h', 200, 'b', 'r', ?, ?)`,
      ).bind(me.data.user.id, past, past, me.data.user.id, future, past),
      env.DB.prepare(
        `INSERT INTO usage_counters (usage_date, scope, scope_id, metric, used, created_at, updated_at)
         VALUES ('2026-01-01', 'user', 'hk', 'ai_language_calls', 1, ?, ?),
                ('2026-08-10', 'user', 'hk', 'ai_language_calls', 1, ?, ?)`,
      ).bind(past, past, now, now),
    ]);

    const removed = await runHousekeeping(env.DB, env.MEDIA, now);
    expect(removed).toMatchObject({
      external_adapter_cache: expect.any(Number),
      external_rate_windows: expect.any(Number),
      idempotency_keys: expect.any(Number),
      usage_counters: expect.any(Number),
    });
    expect(await count("external_adapter_cache", "cache_key = 'hk-old'")).toBe(0);
    expect(await count("external_adapter_cache", "cache_key = 'hk-live'")).toBe(1);
    expect(await count("external_rate_windows", "window_started_at = 'hk-old'")).toBe(0);
    expect(await count("external_rate_windows", "window_started_at = 'hk-live'")).toBe(1);
    expect(await count("idempotency_keys", "route_scope = 'hk' AND key_hash = 'old'")).toBe(0);
    expect(await count("idempotency_keys", "route_scope = 'hk' AND key_hash = 'live'")).toBe(1);
    expect(await count("usage_counters", "scope_id = 'hk' AND usage_date = '2026-01-01'")).toBe(0);
    expect(await count("usage_counters", "scope_id = 'hk' AND usage_date = '2026-08-10'")).toBe(1);
  });

  it("drops a reservation nobody uploaded to once its window closes, and refuses a late upload", async () => {
    const me = BootstrapResponseSchema.parse(
      await (
        await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).json(),
    );
    const spaceId = me.data.user.activeSpaceId;
    const reserved = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/media`, {
      body: JSON.stringify({
        byteSize: 3,
        height: 1,
        kind: "label",
        mimeType: "image/jpeg",
        sha256: "a".repeat(43),
        width: 1,
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": randomOpaqueToken(),
      },
      method: "POST",
    });
    expect(reserved.status).toBe(201);
    const reservation = MediaReservationResponseSchema.parse(await reserved.json());
    const mediaId = reservation.data.media.id;

    // Still open: left alone.
    await runHousekeeping(env.DB, env.MEDIA, now);
    expect(await count("media_assets", "id = ?", mediaId)).toBe(1);

    // Its window closes, unused. The upload is refused…
    await env.DB.prepare(`UPDATE media_assets SET expires_at = ? WHERE id = ?`)
      .bind(past, mediaId)
      .run();
    const late = await SELF.fetch(`https://vadevi.test${reservation.data.uploadPath}`, {
      body: new Uint8Array([1, 2, 3]),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
      method: "PUT",
    });
    expect(late.status).toBe(404);
    // …and the scheduled handler, run as Cloudflare would, removes the row.
    await worker.scheduled(
      { cron: "*/5 * * * *", noRetry: () => undefined, scheduledTime: Date.parse(now) },
      env,
    );
    expect(await count("media_assets", "id = ?", mediaId)).toBe(0);
  });
});
