import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { RegionEntry } from "../../../scripts/kb/appellation-names";
import type { GrapeEntry } from "../../../scripts/kb/grape-validation";
import { libraryDiffSql, librarySql, libraryTables } from "../../../scripts/kb/library-sql";

/**
 * Reloading the library writes only what changed, and what it leaves behind
 * is exactly what a load from scratch would: D1's free plan allows 100,000
 * written rows a day, and a full rewrite of the library spent a third of it.
 */
const grape = (id: string, color: "red" | "white", names: Record<string, string>): GrapeEntry => ({
  acidity: null,
  aromas: ["plum"],
  body: null,
  color,
  evidence: [{ field: "aromas", quote: `${id} smells of plum`, value: "plum" }],
  id,
  names,
  origin: "ES",
  pairings: [],
  prominence: 10,
  regions: [{ country: "ES", name: "Rioja" }],
  styles: [],
  summaries: {},
  synonyms: [],
  tannin: null,
  wikidataId: `Q${id.length}${id.charCodeAt(0)}`,
  wikipediaUrl: `https://en.wikipedia.org/wiki/${id}`,
});
const region = (id: string, grapeIds: string[]): RegionEntry => ({
  countryCode: "ES",
  eambrosiaId: `EUGI-${id}`,
  giType: "PDO",
  grapes: grapeIds.map((grapeId) => ({
    grapeId,
    quote: `${grapeId} is grown in ${id}`,
    sourceUrl: `https://en.wikipedia.org/wiki/${grapeId}`,
  })),
  id,
  latitude: 42.4,
  legalUrl: null,
  longitude: -2.6,
  name: id,
  names: [{ locale: "*", name: id, source: "register" }],
  prominence: 1,
  registeredOn: null,
  summaries: {},
  wikidataId: null,
});

async function snapshot(tables: ReturnType<typeof libraryTables>) {
  const result: Record<string, Record<string, string | number | null>[]> = {};
  for (const { columns, key, table } of tables) {
    const rows = await env.DB.prepare(
      `SELECT ${columns.join(", ")} FROM ${table} ORDER BY ${key.join(", ")}`,
    ).all<Record<string, string | number | null>>();
    result[table] = rows.results;
  }
  return result;
}

async function run(statements: string[]) {
  for (const statement of statements) await env.DB.prepare(statement).run();
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe("reloading the wine library", () => {
  it("writes only the changed rows and ends where a fresh load would", async () => {
    const before = libraryTables(
      [
        grape("tempranillo", "red", { en: "Tempranillo" }),
        grape("garnacha", "red", { en: "Garnacha" }),
      ],
      "v1",
      undefined,
      [region("es-rioja", ["tempranillo", "garnacha"]), region("es-toro", ["tempranillo"])],
    );
    await run(
      librarySql(
        [
          grape("tempranillo", "red", { en: "Tempranillo" }),
          grape("garnacha", "red", { en: "Garnacha" }),
        ],
        "v1",
        undefined,
        [region("es-rioja", ["tempranillo", "garnacha"]), region("es-toro", ["tempranillo"])],
      ),
    );
    expect((await snapshot(before)).kb_grapes).toHaveLength(2);

    // Garnacha leaves (with its links), Tempranillo gains a name, Toro is gone
    // and Verdejo arrives with a region of its own.
    const nextGrapes = [
      grape("tempranillo", "red", { en: "Tempranillo", es: "Tempranillo" }),
      grape("verdejo", "white", { en: "Verdejo" }),
    ];
    const nextRegions = [region("es-rioja", ["tempranillo"]), region("es-rueda", ["verdejo"])];
    const after = libraryTables(nextGrapes, "v2", undefined, nextRegions);
    const { statements, writes } = libraryDiffSql(after, await snapshot(after));
    await run(statements);
    const incremental = await snapshot(after);

    // Nothing to do the second time round.
    expect(libraryDiffSql(after, incremental).statements).toEqual([]);

    await run(librarySql(nextGrapes, "v2", undefined, nextRegions));
    expect(incremental).toEqual(await snapshot(after));

    // Far fewer writes than rewriting the whole library would have cost.
    const full = after.reduce((total, table) => total + table.rows.length * (1 + table.indexes), 0);
    expect(writes).toBeGreaterThan(0);
    expect(writes).toBeLessThan(full * 2);
    const unchanged = libraryDiffSql(after, incremental);
    expect(unchanged.writes).toBe(0);
  });
});
