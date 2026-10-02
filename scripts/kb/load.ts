import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { RegionEntry } from "./appellation-names";
import type { GrapeEntry } from "./grape-validation";
import { librarySql, type Vocabulary } from "./library-sql";

/**
 * Load the wine library into a deployment's D1.
 *
 * The build is identified by a hash of `data/kb/`. If the database already
 * holds that build, nothing is done — so the deploy script can call this on
 * every deploy and pay nothing when the library has not changed.
 *
 * Usage: pnpm kb:load [--config wrangler.preview.jsonc] [--local] [--force]
 */
const configFlag = process.argv.indexOf("--config");
const config = configFlag === -1 ? "wrangler.preview.jsonc" : process.argv[configFlag + 1]!;
const target = process.argv.includes("--local") ? "--local" : "--remote";
// The e2e suite's own local state, apart from `pnpm dev`'s.
const persistFlag = process.argv.indexOf("--persist-to");
const persist = persistFlag === -1 ? [] : ["--persist-to", process.argv[persistFlag + 1]!];
const force = process.argv.includes("--force");

const databaseName = /"database_name"\s*:\s*"([^"]+)"/.exec(readFileSync(config, "utf8"))?.[1];
if (databaseName === undefined) {
  console.error(`kb:load: no database_name in ${config}.`);
  process.exit(1);
}

const source = readFileSync(resolve("data/kb/grapes.json"), "utf8");
const vocabularySource = readFileSync(resolve("data/kb/terms.json"), "utf8");
const regionsSource = readFileSync(resolve("data/kb/appellations.json"), "utf8");
const version = createHash("sha256")
  .update(source)
  .update(vocabularySource)
  .update(regionsSource)
  .digest("hex")
  .slice(0, 16);
const grapes = JSON.parse(source) as GrapeEntry[];
const vocabulary = JSON.parse(vocabularySource) as Vocabulary;
const regions = JSON.parse(regionsSource) as RegionEntry[];

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
    { encoding: "utf8" },
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
  const names = wrangler(["--json", "--command", "SELECT COUNT(*) AS n FROM kb_names"]);
  const hasNames = /"n"\s*:\s*([1-9]\d*)/.test(names);
  if (loaded === version && hasNames) {
    console.info(`  Wine library ${version} is already loaded — skipped.`);
    process.exit(0);
  }
}

const file = join(mkdtempSync(join(tmpdir(), "vadevi-kb-")), "library.sql");
writeFileSync(file, `${librarySql(grapes, version, vocabulary, regions).join("\n")}\n`);
wrangler(["--file", file]);
console.info(`  Loaded wine library ${version}: ${grapes.length} grapes.`);
