import {
  BootstrapResponseSchema,
  CreateWineResponseSchema,
  TastingSessionResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { librarySql } from "../../../scripts/kb/library-sql";
import { getBootstrapResponse } from "../src/repositories/bootstrap";
import { listBottles, listPriceObservations, listWishlist } from "../src/repositories/cellar";
import {
  getLibraryGrape,
  getLibraryRegion,
  getLibraryTopic,
  libraryAromaCounts,
  libraryAtlasCoverage,
  libraryPairings,
  libraryRegionNames,
  listLibraryTopics,
  searchLibraryGrapes,
  searchLibraryRegions,
  searchLibraryWineries,
} from "../src/repositories/library";
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
const accepted: Record<string, string> = {
  // The answer is the whole table: the library's list of grapes (213 in
  // November 2026), each once.
  "grapes | SCAN grape": "lists every grape",
  "pairings | SCAN grape": "lists every grape with what it goes with",
  // The answer is the whole table: 41 topics.
  "topics | SCAN kb_topics": "lists every topic",
  // A name matched anywhere inside it, which no ordinary index serves, over
  // 1,897 wineries. The app's producer field does not call it: it searches a
  // static file in the browser (`/library/wineries.json`).
  "wineries search | SCAN kb_wineries": "substring search, off the app's paths",
  "wineries search | USE TEMP B-TREE FOR ORDER BY": "orders its few matches, prefix first",
};

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

/** Each recorded statement's plan, and the costly lines not accepted. */
async function costlyPlans(ran: readonly Recorded[]): Promise<string[]> {
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
  return found;
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

    const found = await costlyPlans(ran);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("read no library table whole when a reader browses the library", async () => {
    // A small library with something behind every page: two grapes with
    // aromas, pairings, synonyms, a summary and a region; a registered name
    // linked to them; a topic; wineries.
    const grape = (id: string, name: string, aromas: string[], pairings: string[]) => ({
      acidity: "low" as const,
      alcohol: null,
      aromas,
      body: "high" as const,
      color: "red" as const,
      evidence: [{ field: "aromas", quote: `${name} smells of ${aromas[0]}`, value: aromas[0]! }],
      id,
      names: { en: name, es: name },
      origin: "ES",
      pairings,
      prominence: 30,
      regions: [{ country: "ES", name: "Rioja" }],
      styles: ["blending"],
      summaries: {
        en: { text: `${name} is a grape.`, url: `https://en.wikipedia.org/wiki/${id}` },
      },
      sweetness: null,
      synonyms: [{ name: `${name} Fino`, source: "article" as const }],
      tannin: null,
      wikidataId: `Q${id.length}`,
      wikipediaUrl: `https://en.wikipedia.org/wiki/${id}`,
    });
    const rioja = {
      countryCode: "ES",
      eambrosiaId: "PDO-ES-A0117",
      giType: "PDO" as const,
      grapes: [
        {
          grapeId: "tempranillo",
          quote: "It is the main grape of Rioja wine",
          sourceUrl: "https://en.wikipedia.org/wiki/Tempranillo",
        },
      ],
      id: "es-rioja",
      latitude: 42.4,
      legalUrl: null,
      longitude: -2.6,
      name: "Rioja",
      names: [{ locale: "*", name: "Rioja", source: "register" as const }],
      prominence: 40,
      registeredOn: null,
      summaries: {},
      wikidataId: null,
    };
    for (const statement of librarySql(
      [
        grape("tempranillo", "Tempranillo", ["plum", "tobacco"], ["lamb"]),
        grape("garnacha", "Garnacha", ["strawberry"], ["lamb"]),
      ],
      "plans",
      {
        aroma: {
          terms: {
            plum: { en: "plum", es: "ciruela" },
            strawberry: { en: "strawberry", es: "fresa" },
            tobacco: { en: "tobacco", es: "tabaco" },
          },
          variants: {},
        },
        pairing: { terms: { lamb: { en: "lamb", es: "cordero" } }, variants: {} },
      },
      [rioja],
      {
        topics: [
          {
            aliases: [{ locale: "*", name: "MLF" }],
            category: "method",
            id: "malolactic-fermentation",
            names: { en: "Malolactic fermentation" },
            prominence: 20,
            summaries: {
              en: {
                text: "Malolactic fermentation turns malic acid into lactic acid.",
                url: "https://en.wikipedia.org/wiki/Malolactic_fermentation",
              },
            },
            wikidataId: "Q654005",
          },
        ],
        wineries: [
          {
            countryCode: "ES",
            id: "Q2",
            latitude: null,
            longitude: null,
            name: "Bodegas Lafuente",
          },
        ],
      },
    )) {
      await env.DB.prepare(statement).run();
    }

    let route = "";
    const { database, ran } = recordingDatabase(env.DB, () => route);
    const asked: string[] = [];
    const read = async (name: string, run: () => Promise<unknown>) => {
      route = name;
      asked.push(name);
      const answer = await run();
      expect(answer, name).not.toBeNull();
      if (Array.isArray(answer)) expect(answer.length, name).toBeGreaterThan(0);
    };
    await read("grape", () => getLibraryGrape(database, "tempranillo", "es"));
    await read("grapes", () => searchLibraryGrapes(database, undefined, "es"));
    await read("grapes search", () => searchLibraryGrapes(database, "tempr", "es"));
    await read("grapes by aroma", () => searchLibraryGrapes(database, undefined, "es", "plum"));
    await read("pairings", () => libraryPairings(database, "es"));
    await read("aromas", () => libraryAromaCounts(database, "es"));
    await read("regions search", () => searchLibraryRegions(database, "rio", null));
    await read("region", () => getLibraryRegion(database, "es-rioja", "es"));
    await read("region names", () => libraryRegionNames(database, ["es-rioja"]));
    await read("atlas coverage", () => libraryAtlasCoverage(database, "es"));
    await read("topics", () => listLibraryTopics(database, "en"));
    await read("topic", () => getLibraryTopic(database, "malolactic-fermentation", "en"));
    await read("wineries search", () => searchLibraryWineries(database, "lafu", null));
    expect([...new Set(ran.map((entry) => entry.route))]).toEqual(asked);

    const found = await costlyPlans(ran);
    expect(found, found.join("\n")).toEqual([]);
  });
});
