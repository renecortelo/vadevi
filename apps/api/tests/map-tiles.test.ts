import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createApi } from "../src/app";
import { tileFetchesPerMinute, validTile } from "../src/routes/map-tiles";

describe("map tile bounds", () => {
  it("accepts a coordinate inside its zoom and rejects one outside", () => {
    expect(validTile(0, 0, 0)).toBe(true);
    expect(validTile(2, 3, 3)).toBe(true); // 2^2 - 1 = 3, the corner
    expect(validTile(2, 4, 0)).toBe(false); // x past the edge
    expect(validTile(2, 0, 4)).toBe(false); // y past the edge
    expect(validTile(-1, 0, 0)).toBe(false); // zoom below range
    expect(validTile(20, 0, 0)).toBe(false); // zoom above range
    expect(validTile(3, 1.5, 0)).toBe(false); // not an integer
  });
});

describe("the map tile route", () => {
  it("answers 503 when no map background is enabled", async () => {
    // The test deployment ships MAP_TILES_PROVIDER unset, so no tile is ever
    // fetched from OpenStreetMap and the map falls back to its schematic form.
    const response = await SELF.fetch("https://vadevi.test/api/v1/map-tiles/2/1/1");
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FEATURE_UNAVAILABLE");
  });
});

describe("the map tile budget", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  });

  /**
   * The route answers without a session, so the ceiling is what stands between a
   * stranger walking coordinates and OpenStreetMap seeing the traffic under this
   * deployment's name. Proved by filling the minute's window directly and asking
   * for one more tile: nothing reaches OSM, because the refusal happens before
   * the fetch rather than after it.
   */
  it("refuses a tile once the deployment is over its minute, before any upstream call", async () => {
    const windowStartedAt = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
    await env.DB.prepare(
      `INSERT INTO external_rate_windows (provider, window_started_at, request_count, updated_at)
       VALUES ('map_tiles', ?, ?, ?)
       ON CONFLICT(provider, window_started_at) DO UPDATE SET request_count = excluded.request_count`,
    )
      .bind(windowStartedAt, tileFetchesPerMinute, new Date().toISOString())
      .run();

    const response = await createApi().request(
      "/api/v1/map-tiles/2/1/1",
      {},
      {
        DB: env.DB,
        EXTERNAL_API_USER_AGENT: "VaDeVi/0.1 (https://example.invalid/vadevi)",
        MAP_TILES_PROVIDER: "openstreetmap",
      },
    );

    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    // A caller that waits needs to know how long, and a cache has to not store this.
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
