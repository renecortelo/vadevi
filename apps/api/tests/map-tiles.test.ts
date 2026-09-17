import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { validTile } from "../src/routes/map-tiles";

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
