import { BootstrapResponseSchema, CreateWineResponseSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { type DatabaseUsage, meteredDatabase } from "../src/middleware/request-metrics";
import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const token = emulatorIdToken({
  email: "metrics-owner@example.test",
  sub: "firebase-emulator-user-metrics-owner",
});

type MetricsLine = {
  d1: DatabaseUsage;
  message: string;
  method: string;
  ms: number;
  requestId: string;
  route: string;
  status: number;
};

/** The metrics lines written while `act` runs. */
async function linesDuring(act: () => Promise<unknown>): Promise<MetricsLine[]> {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  await act();
  const lines = log.mock.calls
    .map(([first]) => (typeof first === "string" ? first : ""))
    .filter((text) => text.startsWith("{"))
    .map((text) => JSON.parse(text) as MetricsLine)
    .filter((line) => line.message === "request");
  log.mockRestore();
  return lines;
}

describe("one line of metrics per request", () => {
  it("names the route's pattern and what the request cost D1", async () => {
    let spaceId = "";
    let wineId = "";
    const writes = await linesDuring(async () => {
      const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
        headers: { Authorization: `Bearer ${token}` },
      });
      spaceId = BootstrapResponseSchema.parse(await response.json()).data.user.activeSpaceId;
      const created = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
        body: JSON.stringify({
          displayName: "Metrics Negre",
          identityStatus: "confirmed",
          nonVintage: false,
          producerName: "Celler Mesura",
          vintageYear: 2020,
          wineType: "red",
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": randomOpaqueToken(),
        },
        method: "POST",
      });
      expect(created.status).toBe(201);
      wineId = CreateWineResponseSchema.parse(await created.json()).data.wine.id;
    });
    const create = writes.find((line) => line.method === "POST");
    expect(create).toMatchObject({
      route: "/api/v1/spaces/:spaceId/wines",
      status: 201,
    });
    expect(create!.d1.queries).toBeGreaterThan(0);
    expect(create!.d1.rowsWritten).toBeGreaterThan(0);

    let requestId: string | null = null;
    const reads = await linesDuring(async () => {
      const response = await SELF.fetch(
        `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wineId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect(response.status).toBe(200);
      requestId = response.headers.get("X-Request-Id");
    });
    expect(reads).toHaveLength(1);
    const read = reads[0]!;
    expect(read).toMatchObject({
      method: "GET",
      requestId,
      route: "/api/v1/spaces/:spaceId/wines/:wineId",
      status: 200,
    });
    expect(read.d1.rowsRead).toBeGreaterThan(0);
    expect(read.d1.rowsWritten).toBe(0);
    expect(read.ms).toBeGreaterThanOrEqual(0);
    // The pattern only: no id is written down.
    expect(JSON.stringify(reads)).not.toContain(wineId);
    expect(JSON.stringify(reads)).not.toContain(spaceId);
  });

  it("counts every statement a batch runs", async () => {
    const usage: DatabaseUsage = { ms: 0, queries: 0, rowsRead: 0, rowsWritten: 0 };
    const database = meteredDatabase(env.DB, usage);
    await database.batch([
      database.prepare("SELECT 1 AS one"),
      database.prepare("SELECT 2 AS two"),
      database.prepare("SELECT ? AS three").bind(3),
    ]);
    expect(usage.queries).toBe(3);
  });

  it("keeps `first` as it was, missing column and empty result included", async () => {
    const usage: DatabaseUsage = { ms: 0, queries: 0, rowsRead: 0, rowsWritten: 0 };
    const database = meteredDatabase(env.DB, usage);
    const statement = database.prepare("SELECT ? AS value").bind(7);
    expect(await statement.first()).toEqual({ value: 7 });
    expect(await statement.first("value")).toBe(7);
    await expect(statement.first("absent")).rejects.toThrow(/D1_COLUMN_NOTFOUND/);
    const none = database.prepare("SELECT 1 AS value WHERE 0");
    expect(await none.first()).toBeNull();
    expect(await none.first("value")).toBeNull();
    // The unmetered database agrees on each.
    await expect(env.DB.prepare("SELECT 7 AS value").first("absent")).rejects.toThrow(
      /D1_COLUMN_NOTFOUND/,
    );
    expect(await env.DB.prepare("SELECT 1 AS value WHERE 0").first("value")).toBeNull();
    expect(usage.queries).toBe(5);
  });

  it("names no route for a URL that matches none", async () => {
    const lines = await linesDuring(() =>
      SELF.fetch("https://vadevi.test/api/v1/no-such-thing/secret-token"),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ route: "(none)", status: 404 });
  });
});
