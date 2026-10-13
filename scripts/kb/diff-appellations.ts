import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { RegionEntry } from "./appellation-names";

/**
 * What a refresh of the registers changed in the atlas: the names each
 * country's register added or dropped, and those whose summary, point,
 * Wikidata item or grapes changed — against the atlas as committed (or any
 * other revision). Read it before committing a refresh: a name that left a
 * register, or an item that changed, is checked by hand, and a summary in
 * fewer of the app's languages is one to translate again
 * (`scripts/kb/translations.test.ts` names the stale ones).
 *
 * Usage: pnpm kb:diff-appellations [revision]   (default HEAD)
 */

const revision = process.argv[2] ?? "HEAD";
const path = "data/kb/appellations.json";
const before = JSON.parse(
  execFileSync("git", ["show", `${revision}:${path}`], { encoding: "utf8", maxBuffer: 1 << 30 }),
) as RegionEntry[];
const after = JSON.parse(readFileSync(resolve(path), "utf8")) as RegionEntry[];

const languages = ["ca", "de", "en", "es", "fr", "it", "nl", "pt"];
const keyOf = (entry: RegionEntry) => entry.eambrosiaId ?? entry.id;
const previous = new Map(before.map((entry) => [keyOf(entry), entry]));
const current = new Map(after.map((entry) => [keyOf(entry), entry]));
const missingLanguages = (entry: RegionEntry) =>
  Object.keys(entry.summaries).length === 0
    ? 0
    : languages.filter((language) => entry.summaries[language] === undefined).length;

type Report = Record<string, string[]>;
const byCountry = new Map<string, Report>();
const note = (country: string, kind: string, line: string) => {
  const report = byCountry.get(country) ?? {};
  (report[kind] ??= []).push(line);
  byCountry.set(country, report);
};

for (const [key, entry] of current) {
  const old = previous.get(key);
  if (old === undefined) {
    note(entry.countryCode, "added", entry.name);
    continue;
  }
  if (old.name !== entry.name) note(entry.countryCode, "renamed", `${old.name} → ${entry.name}`);
  if ((old.wikidataId ?? null) !== (entry.wikidataId ?? null)) {
    note(
      entry.countryCode,
      "Wikidata item",
      `${entry.name}: ${old.wikidataId ?? "none"} → ${entry.wikidataId ?? "none"}`,
    );
  }
  const texts = (value: RegionEntry) =>
    JSON.stringify(Object.entries(value.summaries).map(([language, { text }]) => [language, text]));
  if (texts(old) !== texts(entry)) {
    const lost = missingLanguages(entry) - missingLanguages(old);
    note(
      entry.countryCode,
      "summary",
      lost > 0 ? `${entry.name} (${lost} fewer languages)` : entry.name,
    );
  }
  if (old.latitude !== entry.latitude || old.longitude !== entry.longitude) {
    note(entry.countryCode, "point", `${entry.name} (${old.pointSource} → ${entry.pointSource})`);
  }
  const grapes = (value: RegionEntry) =>
    value.grapes
      .map((grape) => grape.grapeId)
      .sort()
      .join(",");
  if (grapes(old) !== grapes(entry)) note(entry.countryCode, "grapes", entry.name);
}
for (const [key, entry] of previous) {
  if (!current.has(key)) note(entry.countryCode, "dropped", entry.name);
}

console.info(`Atlas against ${revision}: ${before.length} names before, ${after.length} now.`);
if (byCountry.size === 0) console.info("Nothing changed.");
for (const [country, report] of [...byCountry].sort(([left], [right]) =>
  left.localeCompare(right),
)) {
  console.info(`\n${country}`);
  for (const [kind, lines] of Object.entries(report)) {
    console.info(`  ${kind} (${lines.length}): ${lines.slice(0, 12).join("; ")}`);
    if (lines.length > 12) console.info(`    … and ${lines.length - 12} more`);
  }
}
