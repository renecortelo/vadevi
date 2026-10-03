import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  leadIsAboutWine,
  type RegionEntry,
  registerCountries,
  registerNames,
  transliterate,
} from "./appellation-names";
import { type GrapeEntry, normalize, slug, summaryOf } from "./grape-validation";

/**
 * The atlas, step two: one entry per registered wine name, with its names in
 * every language, a summary where Wikipedia has one, and the grapes whose own
 * articles say they are grown there — each with that sentence.
 *
 * Usage: pnpm kb:build-appellations
 */

const cache = resolve(".kb-cache/appellations");
const register = JSON.parse(readFileSync(resolve(cache, "eambrosia.json"), "utf8")) as {
  appUniqueId: string;
  countryId: string;
  geographicalIndicatorTypeCode: string;
  protectedName: string;
  registrationDate: string | null;
  thirdCountry: boolean;
}[];
const wikidata = JSON.parse(readFileSync(resolve(cache, "wikidata.json"), "utf8")) as Record<
  string,
  {
    labels: Record<string, string>;
    latitude: number | null;
    longitude: number | null;
    pointSource?: "area" | "item" | "place" | null;
    qid: string | null;
  }
>;
const grapes = JSON.parse(readFileSync(resolve("data/kb/grapes.json"), "utf8")) as GrapeEntry[];
// Points OpenStreetMap's geocoder found for names Wikidata could not place
// (`pnpm kb:geocode-appellations`, run after a first build). Approximate.
const geocodedPath = resolve(cache, "geocoded.json");
const geocoded = (
  existsSync(geocodedPath) ? JSON.parse(readFileSync(geocodedPath, "utf8")) : {}
) as Record<string, { latitude: number; longitude: number }>;

function isoDate(value: string | null): string | null {
  const match = value === null ? null : /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match === null || match === undefined ? null : `${match[3]}-${match[2]}-${match[1]}`;
}

const entries: RegionEntry[] = [];
const seen = new Set<string>();
for (const row of register) {
  if (row.thirdCountry) continue; // Third-country names are protected, not EU places.
  const country = registerCountries(row.countryId)[0];
  if (country === undefined) continue;
  const giType = row.geographicalIndicatorTypeCode === "PGI" ? "PGI" : "PDO";
  const names = registerNames(row.protectedName);
  // Ids in Latin letters, unique: a Greek name is transliterated, and a name
  // registered twice (a PDO and a PGI) takes its category, then a number.
  const base = `${country.toLowerCase()}-${slug(transliterate(names[0] ?? row.protectedName)) || row.appUniqueId.toLowerCase()}`;
  let id = seen.has(base) ? `${base}-${giType.toLowerCase()}` : base;
  for (let suffix = 2; seen.has(id); suffix += 1) id = `${base}-${suffix}`;
  seen.add(id);
  const linked = wikidata[row.appUniqueId] ?? null;
  const leadsPath =
    linked === null || linked.qid === null ? null : resolve(cache, "leads", `${linked.qid}.json`);
  const leads =
    leadsPath !== null && existsSync(leadsPath)
      ? (JSON.parse(readFileSync(leadsPath, "utf8")) as Record<
          string,
          { lead: string; title: string }
        >)
      : {};
  const summaries: RegionEntry["summaries"] = {};
  for (const [locale, { lead, title }] of Object.entries(leads)) {
    const text = summaryOf(lead);
    if (text === null || !leadIsAboutWine(lead)) continue;
    summaries[locale] = {
      text,
      url: `https://${locale}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
    };
  }
  entries.push({
    countryCode: country,
    eambrosiaId: row.appUniqueId,
    giType,
    grapes: [],
    id,
    latitude: linked?.latitude ?? geocoded[row.appUniqueId]?.latitude ?? null,
    legalUrl: `https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/${row.appUniqueId}`,
    longitude: linked?.longitude ?? geocoded[row.appUniqueId]?.longitude ?? null,
    pointSource:
      linked?.latitude != null
        ? (linked.pointSource ?? "item")
        : geocoded[row.appUniqueId] !== undefined
          ? "place"
          : null,
    name: names[0] ?? row.protectedName,
    names: [
      ...names.map((name) => ({ locale: "*", name, source: "register" as const })),
      // The Latin spelling of a Greek or Bulgarian name, the one readers type.
      ...names
        .filter((name) => /[\u0370-\u03ff\u0400-\u04ff]/u.test(name))
        .map((name) => transliterate(name))
        .map((name) => ({ locale: "*", name, source: "register" as const })),
      ...Object.entries(linked?.labels ?? {}).map(([locale, name]) => ({
        locale,
        name,
        source: "wikidata" as const,
      })),
    ],
    prominence: Object.keys(leads).length,
    registeredOn: isoDate(row.registrationDate),
    summaries,
    wikidataId: linked?.qid ?? null,
  });
}

// Grapes, by their own articles: a grape's region that is a registered name
// in the same country links the two, with the grape's quoted sentence.
const byName = new Map<string, RegionEntry>();
for (const entry of entries) {
  for (const { name } of entry.names) byName.set(`${entry.countryCode}:${normalize(name)}`, entry);
}
let links = 0;
for (const grape of grapes) {
  for (const region of grape.regions) {
    const entry = byName.get(`${region.country}:${normalize(region.name)}`);
    if (entry === undefined || entry.grapes.some((link) => link.grapeId === grape.id)) continue;
    const evidence = grape.evidence.find(
      (item) => item.field === "regions" && normalize(item.value).includes(normalize(region.name)),
    );
    if (evidence === undefined) continue;
    entry.grapes.push({ grapeId: grape.id, quote: evidence.quote, sourceUrl: grape.wikipediaUrl });
    links += 1;
  }
}

writeFileSync(resolve("data/kb/appellations.json"), `${JSON.stringify(entries, null, 2)}\n`);
const withSummary = entries.filter((entry) => Object.keys(entry.summaries).length > 0).length;
const withPoint = entries.filter((entry) => entry.latitude !== null).length;
console.info(
  `${entries.length} registered wine names: ${withSummary} with a summary, ${withPoint} on the map, ${links} grape links.`,
);
