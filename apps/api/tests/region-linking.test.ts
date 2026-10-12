import { BootstrapResponseSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { ulid } from "ulid";
import { beforeAll, describe, expect, it } from "vitest";

import { linkWineRegions } from "../src/repositories/region-linking";
import { regionRefOf } from "../src/repositories/region-names";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * Wines recorded before the library knew their region are linked on the
 * schedule, in their own country, once per build of the library.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const owner = emulatorIdToken({
  email: "link-owner@example.test",
  name: "Owner",
  sub: "firebase-emulator-user-link-owner",
});

describe("linking wines to the library on the schedule", () => {
  it("links what now reads as one name, in the wine's country, and leaves the rest", async () => {
    const me = BootstrapResponseSchema.parse(
      await (
        await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
          headers: { Authorization: `Bearer ${owner}` },
        })
      ).json(),
    );
    const spaceId = me.data.user.activeSpaceId;
    const now = new Date().toISOString();
    const ids: Record<string, string> = {};
    const wine = (key: string, region: string, country: string | null, regionRef?: string) => {
      ids[key] = ulid();
      return env.DB.prepare(
        `INSERT INTO wine_records (
          id, space_id, display_name, normalized_name, producer_name, normalized_producer_name,
          non_vintage, region, region_ref, country_code, identity_status, version,
          created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'Bodega', 'bodega', 0, ?, ?, ?, 'confirmed', 3, ?, ?, ?)`,
      ).bind(
        ids[key],
        spaceId,
        `Vino ${key}`,
        `vino ${key}`,
        region,
        regionRef ?? null,
        country,
        me.data.user.id,
        now,
        now,
      );
    };
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO kb_regions (id, eambrosia_id, name, country_code, gi_type) VALUES
          ('link-victoria', NULL, 'Victoria', 'AU', 'GI'),
          ('link-marlborough', NULL, 'Marlborough', 'NZ', 'GI'),
          ('link-maipo', NULL, 'Valle del Maipo', 'CL', 'DO')`,
      ),
      env.DB.prepare(
        `INSERT OR IGNORE INTO kb_names
          (entity_type, entity_id, locale, name, normalized_name, kind, source) VALUES
          ('region', 'link-victoria', '*', 'Victoria', 'victoria', 'primary', 'register'),
          ('region', 'link-marlborough', '*', 'Marlborough', 'marlborough', 'primary', 'register'),
          ('region', 'link-maipo', '*', 'Valle del Maipo', 'valle del maipo', 'primary', 'register')`,
      ),
      env.DB.prepare(
        `INSERT INTO kb_meta (key, value) VALUES ('version', 'build-1')
        ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      ),
      wine("marlborough", "New Zealand Marlborough", "NZ"),
      wine("maipo", "Maipo Valley", "CL"),
      wine("victoria-au", "Victoria", "AU"),
      // An Argentine wine from Victoria (Entre Ríos) is not the Australian state.
      wine("victoria-ar", "Victoria", "AR"),
      wine("nowhere", "Somewhere unregistered", "ES"),
      wine("kept", "Marlborough", "NZ", "link-maipo"),
    ]);

    const first = await linkWineRegions(env.DB);
    expect(first.linked).toBe(3);
    const ref = async (key: string) =>
      (await env.DB.prepare("SELECT region_ref, version FROM wine_records WHERE id = ?")
        .bind(ids[key])
        .first<{ region_ref: string | null; version: number }>())!;
    expect((await ref("marlborough")).region_ref).toBe("link-marlborough");
    expect((await ref("maipo")).region_ref).toBe("link-maipo");
    expect((await ref("victoria-au")).region_ref).toBe("link-victoria");
    expect((await ref("victoria-ar")).region_ref).toBeNull();
    expect((await ref("nowhere")).region_ref).toBeNull();
    // A link already made stays; the wine's own version is not touched.
    expect((await ref("kept")).region_ref).toBe("link-maipo");
    expect((await ref("marlborough")).version).toBe(3);

    // Read once per build: nothing left to read until the library changes.
    expect((await linkWineRegions(env.DB)).checked).toBe(0);
    await env.DB.prepare("UPDATE kb_meta SET value = 'build-2' WHERE key = 'version'").run();
    expect((await linkWineRegions(env.DB)).checked).toBeGreaterThanOrEqual(2);
  });

  it("reads a region within the wine's country when recording it", async () => {
    expect(await regionRefOf(env.DB, "Victoria", "AU")).toBe("link-victoria");
    expect(await regionRefOf(env.DB, "Victoria", "AR")).toBeNull();
    expect(await regionRefOf(env.DB, "Victoria")).toBe("link-victoria");
  });
});
