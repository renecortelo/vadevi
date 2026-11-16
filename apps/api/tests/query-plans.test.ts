import {
  BootstrapResponseSchema,
  CreateWineResponseSchema,
  TastingSessionResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { getBootstrapResponse } from "../src/repositories/bootstrap";
import { listBottles, listPriceObservations, listWishlist } from "../src/repositories/cellar";
import { getPersonalStats } from "../src/repositories/stats";
import {
  getTastingSessionDetail,
  listTastingSessions,
  listWineTastings,
} from "../src/repositories/tasting-sessions";
import { getWineSummary, listWines, lookupWines } from "../src/repositories/wine-memory";
import { randomOpaqueToken } from "../src/security/opaque-token";
import type { FirebasePrincipal } from "../src/types";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * The query plans of the routes a reader uses most (Q-03.1).
 *
 * A missing or unusable index does not make a query wrong, only slower as the
 * Space grows, so no other test notices. This one runs the repositories behind
 * those routes against a recording database, which keeps every statement they
 * execute with its parameters, and asks SQLite for each statement's plan. A
 * table read whole (`SCAN` without an index) or a page sorted after the fact
 * (`USE TEMP B-TREE`) fails it, unless it is listed in `accepted` below with
 * the reason it is fine. A new query, or a change to one, is checked without
 * copying its SQL here: what is planned is what the code ran.
 */

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

type Recorded = { binds: unknown[]; route: string; sql: string };

/** A D1Database that runs everything on `database` and keeps what it ran. */
function recordingDatabase(database: D1Database, route: () => string) {
  const ran: Recorded[] = [];
  const statements = new WeakMap<
    object,
    { binds: unknown[]; real: D1PreparedStatement; sql: string }
  >();
  const wrap = (sql: string, real: D1PreparedStatement, binds: unknown[]): D1PreparedStatement => {
    const record = () => ran.push({ binds, route: route(), sql });
    const statement = {
      all: (...args: []) => (record(), real.all(...args)),
      bind: (...values: unknown[]) => wrap(sql, real.bind(...values), values),
      first: (...args: [string?]) => (record(), real.first(...(args as [string]))),
      raw: (...args: []) => (record(), real.raw(...args)),
      run: (...args: []) => (record(), real.run(...args)),
    } as unknown as D1PreparedStatement;
    statements.set(statement, { binds, real, sql });
    return statement;
  };
  const recording = {
    batch: (list: D1PreparedStatement[]) =>
      database.batch(
        list.map((statement) => {
          const known = statements.get(statement);
          if (known === undefined) return statement;
          ran.push({ binds: known.binds, route: route(), sql: known.sql });
          return known.real;
        }),
      ),
    prepare: (sql: string) => wrap(sql, database.prepare(sql), []),
  } as unknown as D1Database;
  return { database: recording, ran };
}

/**
 * Plan lines that are fine, each with why. Keyed by the route and the exact
 * line SQLite prints, so accepting one scan never hides another.
 */
const accepted: Record<string, string> = {};

/**
 * The lines of a plan that read a whole table, or that sort a page after
 * reading everything it could hold.
 *
 * - `SCAN x` without an index is a whole table, unless `x` is not a table: a
 *   subquery SQLite materialized first (named by a `MATERIALIZE` or
 *   `CO-ROUTINE` line of the same plan), a virtual table such as `json_each`
 *   over a bound list, or a constant row.
 * - A temporary B-tree for ORDER BY matters where the statement is a page
 *   (`LIMIT`) of rows, not of groups: a list sorted after the fact reads all
 *   it could ever show to return the first few. Sorting the handful of groups
 *   an aggregate produces (GROUP BY, DISTINCT) is what aggregating is.
 */
function costly(sql: string, details: string[]): string[] {
  const derived = new Set(
    details.flatMap((detail) => {
      const named = /^(?:MATERIALIZE|CO-ROUTINE) (\S+)/.exec(detail);
      return named === null ? [] : [named[1]];
    }),
  );
  const paged = /\bLIMIT\b/i.test(sql) && !/\bGROUP BY\b|\bDISTINCT\b/i.test(sql);
  return details.filter((detail) => {
    if (/^USE TEMP B-TREE FOR (LAST TERM OF )?ORDER BY$/.test(detail)) return paged;
    const scan = /^SCAN (\S+)(.*)$/.exec(detail);
    if (scan === null) return false;
    const [, name, rest] = scan;
    if (/USING (COVERING )?INDEX|USING INTEGER PRIMARY KEY|VIRTUAL TABLE/.test(rest ?? "")) {
      return false;
    }
    return !derived.has(name ?? "") && !["json_each", "CONSTANT"].includes(name ?? "");
  });
}

describe("the plans of the routes a reader uses most", () => {
  it("read no table whole and sort no page after reading it", async () => {
    const token = emulatorIdToken({
      email: "plans@example.test",
      sub: "firebase-emulator-user-plans",
    });
    const principal: FirebasePrincipal = {
      authTime: Math.floor(Date.now() / 1000),
      email: "plans@example.test",
      emailVerified: true,
      firebaseUid: "firebase-emulator-user-plans",
    };
    const call = async (path: string, method: string, body?: unknown) =>
      SELF.fetch(`https://vadevi.test${path}`, {
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": randomOpaqueToken(),
        },
        method,
      });

    // A small Space with something in every list, so each repository goes
    // the whole way rather than returning early on an empty answer.
    const me = BootstrapResponseSchema.parse(
      await (await call("/api/v1/me/bootstrap", "GET")).json(),
    );
    const spaceId = me.data.user.activeSpaceId;
    const base = `/api/v1/spaces/${spaceId}`;
    const wineIds: string[] = [];
    for (const [index, name] of ["Pla Negre", "Pla Blanc", "Pla Rosat"].entries()) {
      const created = await call(`${base}/wines`, "POST", {
        displayName: name,
        grapes: [{ name: "Garnatxa", percentage: 100 }],
        identityStatus: "confirmed",
        nonVintage: false,
        producerName: "Celler dels Plans",
        region: "Priorat",
        vintageYear: 2019 + index,
        wineType: "red",
      });
      expect(created.status).toBe(201);
      wineIds.push(CreateWineResponseSchema.parse(await created.json()).data.wine.id);
    }
    const [wineId] = wineIds as [string];
    expect(
      (
        await call(`${base}/tasting-notes`, "POST", {
          comment: "Fresc",
          descriptorCodes: ["fruit.red.strawberry"],
          mode: "quick",
          score100: 88,
          state: "submitted",
          tastedAt: "2026-10-01T20:00:00.000Z",
          wineId,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call(`${base}/purchases`, "POST", {
          createBottles: true,
          currency: "EUR",
          merchantName: "Celler de la Plaça",
          purchasedAt: "2026-10-02T10:00:00.000Z",
          quantity: 2,
          unitAmountMinor: 1800,
          wineId,
        })
      ).status,
    ).toBe(201);
    expect(
      (await call(`${base}/wishlist`, "POST", { priority: 2, reason: "Plans", wineId: wineIds[1] }))
        .status,
    ).toBe(201);
    const session = await call(`${base}/sessions`, "POST", {
      name: "Cata dels plans",
      startsAt: "2026-10-03T19:00:00.000Z",
    });
    expect(session.status).toBe(201);
    const sessionId = TastingSessionResponseSchema.parse(await session.json()).data.id;
    expect(
      (await call(`${base}/sessions/${sessionId}/wines`, "POST", { entries: [{ wineId }] })).status,
    ).toBe(200);

    let route = "";
    const { database, ran } = recordingDatabase(env.DB, () => route);
    const asked: string[] = [];
    const read = async (name: string, run: () => Promise<unknown>) => {
      route = name;
      asked.push(name);
      expect(await run(), name).not.toBeNull();
    };
    const options = { bottlePhotoSearch: false, externalResearch: false, mapTiles: false };
    await read("bootstrap", () =>
      getBootstrapResponse(database, {
        ...options,
        accessAdmin: false,
        accessSecondFactor: false,
        aiProvider: "none",
        placeSearch: false,
        principal,
        requestId: "plans",
        voiceInput: false,
      }),
    );
    for (const sort of ["recent", "name", "score", "tasted"] as const) {
      await read(`wines sort=${sort}`, () =>
        listWines(database, { limit: 25, principal, sort, spaceId }),
      );
    }
    await read("wines search", () =>
      listWines(database, { limit: 25, principal, query: "negre", sort: "recent", spaceId }),
    );
    await read("wines filtered", () =>
      listWines(database, {
        grape: "garnatxa",
        limit: 25,
        minScore: 80,
        principal,
        region: "priorat",
        sort: "score",
        spaceId,
        wineType: "red",
      }),
    );
    await read("wines lookup", () => lookupWines(database, { limit: 100, principal, spaceId }));
    await read("wines lookup search", () =>
      lookupWines(database, { limit: 100, principal, query: "plans", spaceId }),
    );
    await read("wine", () => getWineSummary(database, principal, spaceId, wineId));
    await read("bottles", () => listBottles(database, { principal, spaceId }));
    await read("wishlist", () => listWishlist(database, { principal, spaceId }));
    await read("prices", () =>
      listPriceObservations(database, { freshnessDays: 90, principal, spaceId, wineId }),
    );
    await read("sessions", () => listTastingSessions(database, { principal, spaceId }));
    await read("session", () =>
      getTastingSessionDetail(database, { principal, sessionId, spaceId }),
    );
    await read("wine tastings", () => listWineTastings(database, { principal, spaceId, wineId }));
    await read("personal stats", () => getPersonalStats(database, principal, {}));

    // Every route recorded something, or the recorder missed a way in.
    expect([...new Set(ran.map((entry) => entry.route))]).toEqual(asked);

    const found: string[] = [];
    const seen = new Set<string>();
    for (const entry of ran) {
      const key = `${entry.route}\n${entry.sql}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${entry.sql}`)
        .bind(...entry.binds)
        .all<{ detail: string }>();
      for (const detail of costly(
        entry.sql,
        plan.results.map((row) => row.detail),
      )) {
        const line = `${entry.route} | ${detail}`;
        if (accepted[line] === undefined) {
          found.push(`${line}\n    in: ${entry.sql.replace(/\s+/g, " ").slice(0, 160)}`);
        }
      }
    }
    expect(found, found.join("\n")).toEqual([]);
  });
});
