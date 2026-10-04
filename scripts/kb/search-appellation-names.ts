import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { registerCountries, registerNames } from "./appellation-names";
import { wikimedia } from "./wikimedia";

/**
 * The atlas, step one and a half: Wikidata searched in each country's own
 * language for the registered names the wine classes did not find.
 *
 * Many wines' items are filed under no class at all (Marsannay, described
 * only as "région viticole"), so the class queries never reach them and a
 * name the register and the item spell the same way went unlinked. The search is only a
 * list of candidates; `fetch-appellations.ts` decides which, if any, is the
 * wine's own item. Results are cached, one request a second, so a rerun only
 * asks for what it has not asked before.
 *
 * Usage: pnpm kb:search-appellation-names, after `pnpm kb:fetch-appellations`
 * has cached the register; then fetch again to use the answers.
 */
const cache = resolve(".kb-cache/appellations");
const searchesPath = resolve(cache, "name-searches.json");

/** The languages a member state's wine names are written in. */
export const countryLanguages: Record<string, string[]> = {
  AT: ["de"],
  BE: ["fr", "nl"],
  BG: ["bg"],
  CY: ["el"],
  CZ: ["cs"],
  DE: ["de"],
  DK: ["da"],
  ES: ["es"],
  FR: ["fr"],
  GB: ["en"],
  GR: ["el"],
  HR: ["hr"],
  HU: ["hu"],
  IT: ["it"],
  LU: ["fr", "de"],
  MT: ["mt", "en"],
  NL: ["nl"],
  PL: ["pl"],
  PT: ["pt"],
  RO: ["ro"],
  SE: ["sv"],
  SI: ["sl"],
  SK: ["sk"],
};

export const searchKey = (language: string, name: string) => `${language}:${name}`;

export function readSearches(): Record<string, string[]> {
  return existsSync(searchesPath)
    ? (JSON.parse(readFileSync(searchesPath, "utf8")) as Record<string, string[]>)
    : {};
}

async function main() {
  const register = JSON.parse(readFileSync(resolve(cache, "eambrosia.json"), "utf8")) as Record<
    string,
    unknown
  >[];
  const linked = JSON.parse(readFileSync(resolve(cache, "wikidata.json"), "utf8")) as Record<
    string,
    { qid: string | null }
  >;
  const searches = readSearches();
  let asked = 0;
  for (const row of register) {
    const ambrosia = String(row.appUniqueId);
    if (linked[ambrosia]?.qid != null) continue;
    const names = registerNames(String(row.protectedName));
    const languages = [
      ...new Set(
        registerCountries(String(row.countryId)).flatMap((c) => countryLanguages[c] ?? []),
      ),
    ];
    for (const language of languages) {
      // In the language's own script only: the Latin spelling of a Greek or
      // Bulgarian name was searched in English with the town lookups.
      for (const name of names) {
        const key = searchKey(language, name);
        if (searches[key] !== undefined) continue;
        const body = await wikimedia<{ search?: { id: string }[] }>(
          "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=10" +
            `&language=${language}&uselang=${language}&strictlanguage=false` +
            `&search=${encodeURIComponent(name)}`,
        );
        searches[key] = (body.search ?? []).map((hit) => hit.id);
        asked += 1;
        if (asked % 25 === 0) {
          writeFileSync(searchesPath, JSON.stringify(searches));
          console.info(`  ${asked} searches`);
        }
      }
    }
  }
  writeFileSync(searchesPath, JSON.stringify(searches));
  console.info(`  ${asked} new searches; ${Object.keys(searches).length} cached.`);
}

if (process.argv[1]?.endsWith("search-appellation-names.ts")) await main();
