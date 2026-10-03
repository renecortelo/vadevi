import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { ImageEntry, RegionEntry, TopicEntry } from "./appellation-names";
import type { GrapeEntry } from "./grape-validation";
import { libraryDiffSql, libraryTables, type Vocabulary } from "./library-sql";

/**
 * Load the wine library into a deployment's D1.
 *
 * The build is identified by a hash of `data/kb/`. If the database already
 * holds that build, nothing is done — so the deploy script can call this on
 * every deploy and pay nothing when the library has not changed. When it has,
 * only the rows that changed are written: what the database holds is read
 * first (reads are plentiful; the free plan allows 100,000 written rows a
 * day, shared with the application), and a load that would write more than
 * `--max-writes` rows (25,000 by default; 60,000 for a first load into an
 * empty library) stops before writing any.
 *
 * Usage: pnpm kb:load [--config wrangler.preview.jsonc] [--local] [--force]
 *                     [--max-writes 25000]
 */
const configFlag = process.argv.indexOf("--config");
const config = configFlag === -1 ? "wrangler.preview.jsonc" : process.argv[configFlag + 1]!;
const target = process.argv.includes("--local") ? "--local" : "--remote";
// The e2e suite's own local state, apart from `pnpm dev`'s.
const persistFlag = process.argv.indexOf("--persist-to");
const persist = persistFlag === -1 ? [] : ["--persist-to", process.argv[persistFlag + 1]!];
const force = process.argv.includes("--force");
const maxWritesFlag = process.argv.indexOf("--max-writes");

const databaseName = /"database_name"\s*:\s*"([^"]+)"/.exec(readFileSync(config, "utf8"))?.[1];
if (databaseName === undefined) {
  console.error(`kb:load: no database_name in ${config}.`);
  process.exit(1);
}

const source = readFileSync(resolve("data/kb/grapes.json"), "utf8");
const vocabularySource = readFileSync(resolve("data/kb/terms.json"), "utf8");
const regionsSource = readFileSync(resolve("data/kb/appellations.json"), "utf8");
const topicsSource = readFileSync(resolve("data/kb/topics.json"), "utf8");
const imagesSource = readFileSync(resolve("data/kb/grape-images.json"), "utf8");
const version = createHash("sha256")
  .update(source)
  .update(vocabularySource)
  .update(regionsSource)
  .update(topicsSource)
  .update(imagesSource)
  .digest("hex")
  .slice(0, 16);
const grapes = JSON.parse(source) as GrapeEntry[];
const vocabulary = JSON.parse(vocabularySource) as Vocabulary;
const regions = JSON.parse(regionsSource) as RegionEntry[];
const topics = JSON.parse(topicsSource) as TopicEntry[];
const images = JSON.parse(imagesSource) as Record<string, ImageEntry>;

function wrangler(args: string[]): string {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      databaseName!,
      target,
      ...persist,
      "--config",
      config,
      ...args,
    ],
    // A table read back can run to megabytes.
    { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

if (!force) {
  const output = wrangler([
    "--json",
    "--command",
    "SELECT value FROM kb_meta WHERE key = 'version'",
  ]);
  const loaded = /"value"\s*:\s*"([0-9a-f]+)"/.exec(output)?.[1];
  // The same build, and its names actually present: a migration that rebuilt
  // a kb_ table (as 0027 did kb_names) leaves the version row in place and
  // the table empty, which must reload rather than be skipped.
  // One row is enough to know; a count reads them all.
  const names = wrangler(["--json", "--command", "SELECT 1 AS n FROM kb_names LIMIT 1"]);
  const hasNames = /"n"\s*:\s*1/.test(names);
  if (loaded === version && hasNames) {
    console.info(`  Wine library ${version} is already loaded — skipped.`);
    process.exit(0);
  }
}

const tables = libraryTables(grapes, version, vocabulary, regions, { images, topics });

// What the database holds now, table by table. A table a migration has not
// created yet reads as empty.
const current: Record<string, Record<string, string | number | null>[]> = {};
for (const { columns, table } of tables) {
  const output = wrangler(["--json", "--command", `SELECT ${columns.join(", ")} FROM ${table}`]);
  const parsed = JSON.parse(output) as { results: Record<string, string | number | null>[] }[];
  current[table] = parsed.flatMap((entry) => entry.results);
}

const { statements, writes } = libraryDiffSql(tables, current);
if (statements.length === 0) {
  console.info(`  Wine library ${version}: nothing changed.`);
  process.exit(0);
}
// Local databases cost nothing; the budget guards the shared daily allowance.
// A first load into an empty library (a new deployment, with no one's data
// yet competing for the day's writes) may write the whole of it.
const firstLoad = Object.values(current).every((rows) => rows.length === 0);
const maxWrites =
  maxWritesFlag === -1 ? (firstLoad ? 60_000 : 25_000) : Number(process.argv[maxWritesFlag + 1]);
if (target === "--remote" && writes > maxWrites) {
  console.error(
    `kb:load: this load would write about ${writes.toLocaleString("en")} rows, over the ` +
      `${maxWrites.toLocaleString("en")} allowed (--max-writes). The free plan allows ` +
      "100,000 a day for the whole database, the application's own writes included. " +
      "Nothing was written. Load after 00:00 UTC with a larger --max-writes if this is intended.",
  );
  process.exit(1);
}

const file = join(mkdtempSync(join(tmpdir(), "vadevi-kb-")), "library.sql");
writeFileSync(file, `${statements.join("\n")}\n`);
wrangler(["--file", file]);
console.info(
  `  Loaded wine library ${version}: ${grapes.length} grapes, ${regions.length} registered names, ${topics.length} topics ` +
    `(${statements.length} statements, about ${writes.toLocaleString("en")} rows written).`,
);
