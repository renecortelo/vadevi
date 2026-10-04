import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { matchKey, type RegionEntry, transliterate } from "./appellation-names";
import { userAgent } from "./wikimedia";

/**
 * The atlas's last points: registered names Wikidata could not place, looked
 * up in OpenStreetMap's geocoder (Nominatim) — by the name, in its own
 * country, and again without the words that name a category rather than a
 * place ("Vino de la Tierra de", "Vin de pays des", "Terre di"). A result is
 * taken only when it is in that country and its own name is exactly the
 * name searched; the point is approximate, as the page says.
 *
 * Nominatim's usage policy: at most one request a second, an identifying
 * User-Agent, results cached. Data © OpenStreetMap contributors, ODbL.
 *
 * It looks up every name the Wikidata step and the grand crus' list could not
 * place — read from their own files, not from the last build, which carries
 * this script's previous answers; answers are cached, so a rerun costs
 * nothing. It writes `.kb-cache/appellations/geocoded.json`; build again
 * afterwards.
 *
 * Usage: pnpm kb:geocode-appellations
 */
const cache = resolve(".kb-cache/appellations");
const cachePath = resolve(cache, "nominatim.json");
const answers = (
  existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {}
) as Record<
  string,
  {
    addresstype?: string;
    category?: string;
    importance?: number;
    lat: string;
    lon: string;
    name: string;
    type?: string;
  }[]
>;
const regions = JSON.parse(
  readFileSync(resolve("data/kb/appellations.json"), "utf8"),
) as RegionEntry[];

/** Openings that say what kind of wine name it is, not where. */
const categoryWords = [
  "vino de la tierra de ",
  "vino de la tierra del ",
  "vino de la tierra ",
  "vino de pago ",
  "vinos de madrid ",
  "vin de pays des ",
  "vin de pays de la ",
  "vin de pays du ",
  "vin de pays de ",
  "vin de pays d ",
  "vin de pays ",
  "coteaux de ",
  "coteaux du ",
  "coteaux d ",
  "terre di ",
  "terre del ",
  "terre degli ",
  "terre ",
  "colli di ",
  "colli del ",
  "colli ",
  "valle d ",
  "val di ",
  "vinho regional ",
  "landwein ",
  "regional ",
];

function variants(name: string): string[] {
  const forms = new Set([name, transliterate(name)]);
  for (const form of [...forms]) {
    const key = matchKey(form);
    for (const opening of categoryWords) {
      if (key.startsWith(opening) && key.length > opening.length + 2) {
        forms.add(form.slice(form.length - (key.length - opening.length)));
      }
    }
  }
  // "Achterhoek - Winterswijk": either half; "Aglianico del Taburno": the
  // place after the grape.
  for (const form of [...forms]) {
    for (const part of form.split(/\s+-\s+/)) forms.add(part);
    const after = /\s(?:del|della|dei|degli|di|de|des|du|da|do|dos)\s(.+)$/i.exec(form)?.[1];
    if (after !== undefined) forms.add(after);
  }
  return [...forms].map((form) => form.trim()).filter((form) => form.length >= 3);
}

let last = 0;
async function search(query: string, country: string) {
  const key = `${country}:${query}`;
  if (answers[key] !== undefined) return answers[key]!;
  await new Promise((settle) => setTimeout(settle, Math.max(0, last + 1_100 - Date.now())));
  last = Date.now();
  const response = await fetch(
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5" +
      `&countrycodes=${country.toLowerCase()}&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json", "User-Agent": userAgent } },
  );
  const found = response.ok ? ((await response.json()) as (typeof answers)[string]) : [];
  answers[key] = found;
  writeFileSync(cachePath, JSON.stringify(answers));
  return found;
}

const geocodedPath = resolve(cache, "geocoded.json");
const geocoded: Record<string, { latitude: number; longitude: number; query: string }> = {};
let tried = 0;
/**
 * Registered names that are wines, not places, or not named after the place
 * that shares their name (Graves for its gravel; a vino de pago for its
 * estate), or named after one of several villages of the name and the map's
 * is another (Plešivica's vineyards are by Jastrebarsko, OpenStreetMap's
 * Plešivica is in Međimurje; Bulgaria has more than one Lozitsa): no point
 * to look for.
 */
const notPlaces = new Set(["cava", "graves", "los cerrillos", "plesivica", "лозица"]);

const wikidata = JSON.parse(readFileSync(resolve(cache, "wikidata.json"), "utf8")) as Record<
  string,
  { latitude: number | null }
>;
const grandCrusPath = resolve(cache, "grand-crus.json");
const grandCrus = (
  existsSync(grandCrusPath) ? JSON.parse(readFileSync(grandCrusPath, "utf8")) : {}
) as Record<string, unknown>;
const placedElsewhere = (region: RegionEntry) =>
  wikidata[region.eambrosiaId]?.latitude != null ||
  region.names.some(
    (entry) => entry.source === "register" && grandCrus[matchKey(entry.name)] !== undefined,
  );

for (const region of regions) {
  if (placedElsewhere(region)) continue;
  if (notPlaces.has(matchKey(region.name))) continue;
  tried += 1;
  const names = [
    ...new Set(
      region.names.filter((entry) => entry.source === "register").map((entry) => entry.name),
    ),
  ];
  let placed = false;
  // An Alsace grand cru is a lieu-dit whose name is often also a village or
  // another lieu-dit elsewhere in Alsace ("Rangen", "Brand", "Steinert"), and
  // nothing in the register says which commune it is in: checked against
  // where they are, a third of the lookups landed on a namesake. Left unplaced.
  if (/^alsace grand cru /.test(matchKey(names[0] ?? ""))) continue;
  for (const name of names) {
    for (const query of variants(name)) {
      const wanted = matchKey(query);
      // The result's own name, or one half of a bilingual one ("Eisacktal -
      // Valle Isarco"), must be the name searched; and it must be a place, a
      // boundary, a natural feature or a vineyard — not a street or a shop.
      const matching = (await search(query, region.countryCode)).filter(
        (result) =>
          [result.name, ...result.name.split(/\s+-\s+|\s*\/\s*/)].some(
            (name) => matchKey(name) === wanted,
          ) &&
          (["boundary", "place", "natural"].includes(result.category ?? "") ||
            (result.category === "landuse" && result.type === "vineyard")) &&
          // In Europe: a country's overseas places share its names, and a
          // point in French Guiana is not one in South West France.
          Number(result.lat) > 26.5 &&
          Number(result.lat) < 72 &&
          Number(result.lon) > -32 &&
          Number(result.lon) < 45 &&
          // A municipality, a region, an island — not a hamlet or a locality
          // that happens to share the name. Checked by hand, namesakes were
          // the small places: "Salina" a village in Emilia rather than the
          // Aeolian island, "Valdadige" a quarter in Apulia rather than the
          // Adige valley. Below this, no point rather than a wrong one.
          (result.importance ?? 0) >= 0.3,
      );
      // Every place of that name must be one place: a valley and the
      // municipality inside it agree; "Corton" the hill in Burgundy and a
      // Corton near Roanne do not, and neither is taken.
      const hit = matching[0];
      if (hit === undefined) continue;
      const spread = Math.max(
        ...matching.map((result) =>
          Math.hypot(
            Number(result.lat) - Number(hit.lat),
            (Number(result.lon) - Number(hit.lon)) * Math.cos((Number(hit.lat) * Math.PI) / 180),
          ),
        ),
      );
      if (spread > 0.3) continue;
      geocoded[region.eambrosiaId] = {
        latitude: Number(hit.lat),
        longitude: Number(hit.lon),
        query,
      };
      placed = true;
      break;
    }
    if (placed) break;
  }
  if (tried % 50 === 0)
    console.info(`  ${tried} looked up, ${Object.keys(geocoded).length} placed`);
}
writeFileSync(geocodedPath, JSON.stringify(geocoded, null, 2));
console.info(
  `${Object.keys(geocoded).length} of ${tried} names without a point placed by OpenStreetMap.`,
);
