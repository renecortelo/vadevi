import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { matchKey, registerCountries, registerNames, transliterate } from "./appellation-names";
import { wikimedia } from "./wikimedia";

/**
 * The atlas, step one: every protected wine name in the EU, from the register
 * itself, and what Wikidata and Wikipedia add to it.
 *
 * eAmbrosia is the EU's legal register of geographical indications; its public
 * API answers the list of registered wine PDOs and PGIs (about 1,650), each
 * with its country, its category and the act that protects it. Reuse is under
 * the Commission's reuse notice (Decision 2011/833/EU): free, with the source
 * acknowledged. Wikidata links some of them to an item directly (P9854, the
 * eAmbrosia id — though most items carrying it are cheeses, meats and other
 * foods); the rest are found among Wikidata's wine items and wine regions by
 * name, in the same country. The item gives names in other languages,
 * coordinates, and the Wikipedia article whose lead becomes the summary.
 *
 * No model is involved: nothing here costs AI quota.
 *
 * Usage: pnpm kb:fetch-appellations
 */

const userAgent =
  "VaDeVi-kb-builder/0.1 (https://github.com/renecortelo/vadevi; library build, run by hand)";
const locales = ["en", "es", "ca", "fr", "de", "it", "nl", "pt"] as const;
const cache = resolve(".kb-cache/appellations");
mkdirSync(resolve(cache, "leads"), { recursive: true });

async function request(url: string, init: RequestInit = {}): Promise<unknown> {
  await new Promise((settle) => setTimeout(settle, 250));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", "User-Agent": userAgent, ...(init.headers ?? {}) },
    });
    if (response.ok) return response.json();
    await new Promise((settle) => setTimeout(settle, 5_000 * (attempt + 1)));
  }
  throw new Error(`Failed after retries: ${url}`);
}

// 1. The register: every registered wine GI (qualityProductTypeId 1 = wine,
//    statusId 4 = registered).
const register = (await request(
  "https://ec.europa.eu/geographical-indications-register/eambrosia-public-api/api/gi-applications/filter",
  {
    body: JSON.stringify({
      cnCode: [],
      cnCodes: [],
      filters: [
        { fieldName: "qualityProductTypeId", fieldValue: ["1"] },
        { fieldName: "statusId", fieldValue: ["4"] },
      ],
      first: 0,
      lang: "en",
      registerId: 1,
      rows: 5000,
      sortField: "protectedName",
      sortOrder: 1,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  },
)) as { count: number; results: Record<string, unknown>[] };
writeFileSync(resolve(cache, "eambrosia.json"), JSON.stringify(register.results, null, 2));
console.info(`  eAmbrosia: ${register.results.length} of ${register.count} registered wine names.`);

// 2. Wikidata, two ways in. Directly, by the eAmbrosia id…
type Binding = Record<string, { value: string } | undefined>;
async function sparql(query: string): Promise<Binding[]> {
  const body = (await request(
    `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,
  )) as { results: { bindings: Binding[] } };
  return body.results.bindings;
}
const qid = (binding: Binding, key: string) => binding[key]!.value.split("/").at(-1)!;
/** "Point(lon lat)" → the pair, or null. */
function point(value: string | undefined): { latitude: number; longitude: number } | null {
  const match = value === undefined ? null : /^Point\(([-\d.e]+) ([-\d.e]+)\)$/.exec(value);
  return match === null || match === undefined
    ? null
    : { latitude: Number(match[2]), longitude: Number(match[1]) };
}

const registered = new Set(register.results.map((row) => String(row.appUniqueId)));
const direct = new Map<string, string>();
for (const binding of await sparql("SELECT ?item ?ambrosia WHERE { ?item wdt:P9854 ?ambrosia }")) {
  const ambrosia = binding.ambrosia!.value;
  if (registered.has(ambrosia)) direct.set(ambrosia, qid(binding, "item"));
}

// …and by name, among the items Wikidata files as wine, wine regions and
// appellations. One query per class keeps each under the service's time
// limit; "wine" itself is asked country by country for the same reason.
const memberStates: Record<string, string> = {
  AT: "Q40",
  BE: "Q31",
  BG: "Q219",
  CY: "Q229",
  CZ: "Q213",
  DE: "Q183",
  DK: "Q35",
  ES: "Q29",
  FR: "Q142",
  GB: "Q145",
  GR: "Q41",
  HR: "Q224",
  HU: "Q28",
  IT: "Q38",
  LU: "Q32",
  MT: "Q233",
  NL: "Q55",
  PL: "Q36",
  PT: "Q45",
  RO: "Q218",
  SE: "Q34",
  SI: "Q215",
  SK: "Q214",
};
const wineItems = new Map<string, { country: string; point: ReturnType<typeof point> }>();
function keep(bindings: Binding[], country?: string) {
  for (const binding of bindings) {
    const id = qid(binding, "item");
    const iso = country ?? binding.iso?.value;
    if (iso === undefined) continue;
    const previous = wineItems.get(id);
    wineItems.set(id, { country: iso, point: previous?.point ?? point(binding.coord?.value) });
  }
}
for (const wineClass of ["Q2140699", "Q1565828", "Q451752", "Q3104453", "Q13439060"]) {
  keep(
    await sparql(`SELECT DISTINCT ?item ?iso ?coord WHERE {
      ?item wdt:P31/wdt:P279* wd:${wineClass} ; wdt:P17/wdt:P297 ?iso .
      OPTIONAL { ?item wdt:P625 ?coord } }`),
  );
}
for (const [iso, country] of Object.entries(memberStates)) {
  keep(
    await sparql(`SELECT DISTINCT ?item ?coord WHERE {
      ?item wdt:P31 wd:Q282 ; wdt:P17 wd:${country} . OPTIONAL { ?item wdt:P625 ?coord } }`),
    iso,
  );
}

type Entity = {
  aliases?: Record<string, { value: string }[]>;
  claims?: Record<
    string,
    { mainsnak: { datavalue?: { value: { latitude: number; longitude: number } } } }[]
  >;
  labels?: Record<string, { value: string }>;
  sitelinks?: Record<string, { title: string }>;
};
// Names in the eight interface languages and the member states' own, so a
// register name written in Hungarian or Greek finds its item.
const labelLanguages = [
  ...locales,
  "bg",
  "cs",
  "da",
  "el",
  "eu",
  "gl",
  "hr",
  "hu",
  "lb",
  "mt",
  "pl",
  "ro",
  "sk",
  "sl",
  "sv",
];
const ids = [...new Set([...direct.values(), ...wineItems.keys()])];
const entities: Record<string, Entity> = {};
for (let start = 0; start < ids.length; start += 50) {
  const body = (await request(
    "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json" +
      `&props=labels|aliases|sitelinks|claims&languages=${labelLanguages.join("|")}` +
      `&ids=${ids.slice(start, start + 50).join("|")}`,
  )) as { entities: Record<string, Entity> };
  Object.assign(entities, body.entities);
}
const sitelinkCount = (id: string) => Object.keys(entities[id]?.sitelinks ?? {}).length;
function coordinates(id: string) {
  const claimed = entities[id]?.claims?.P625?.[0]?.mainsnak.datavalue?.value;
  return claimed === undefined
    ? (wineItems.get(id)?.point ?? null)
    : { latitude: claimed.latitude, longitude: claimed.longitude };
}

const byName = new Map<string, Set<string>>();
for (const [id, item] of wineItems) {
  const entity = entities[id];
  const names = [
    ...Object.values(entity?.labels ?? {}).map((label) => label.value),
    ...Object.values(entity?.aliases ?? {}).flatMap((list) => list.map((alias) => alias.value)),
  ];
  for (const name of names) {
    if (matchKey(name).length < 2) continue;
    const key = `${item.country}:${matchKey(name)}`;
    byName.set(key, new Set([...(byName.get(key) ?? []), id]));
  }
}

// One item per register entry: the one linked directly, or else the
// best-known of those going by its name. Coordinates may come from another
// item of the same name — a wine and its region are often two items.
type PointSource = "area" | "item" | "place";
const linked: Record<
  string,
  {
    labels: Record<string, string>;
    latitude: number | null;
    longitude: number | null;
    /** Where the point comes from: the wine's own item, the area it lies in,
     * or the place it is named after. */
    pointSource: PointSource | null;
    qid: string | null;
  }
> = {};
let byNameOnly = 0;
for (const row of register.results) {
  const ambrosia = String(row.appUniqueId);
  const countries = registerCountries(String(row.countryId));
  const candidates = [
    ...new Set(
      // A Greek or Bulgarian name is also tried in Latin letters, which is
      // how most of Wikidata's wine items are labelled ("Nemea", "Melnik").
      registerNames(String(row.protectedName))
        .flatMap((name) => [name, transliterate(name)])
        .flatMap((name) =>
          matchKey(name).length < 2
            ? []
            : countries.flatMap((country) => [
                ...(byName.get(`${country}:${matchKey(name)}`) ?? []),
              ]),
        ),
    ),
  ].sort((left, right) => sitelinkCount(right) - sitelinkCount(left));
  const chosen = direct.get(ambrosia) ?? candidates[0];
  if (chosen === undefined) continue;
  if (!direct.has(ambrosia)) byNameOnly += 1;
  const place =
    coordinates(chosen) ??
    candidates.map(coordinates).find((candidate) => candidate !== null) ??
    null;
  linked[ambrosia] = {
    labels: Object.fromEntries(
      Object.entries(entities[chosen]?.labels ?? {})
        .filter(([locale]) => (locales as readonly string[]).includes(locale))
        .map(([locale, label]) => [locale, label.value]),
    ),
    latitude: place?.latitude ?? null,
    longitude: place?.longitude ?? null,
    pointSource: place === null ? null : "item",
    qid: chosen,
  };
}

type Claims = Record<
  string,
  { mainsnak: { datavalue?: { value: { id?: string; latitude?: number; longitude?: number } } } }[]
>;
async function claimsOf(
  ids: string[],
): Promise<Record<string, { claims?: Claims; labels?: Record<string, { value: string }> }>> {
  const result: Record<string, { claims?: Claims; labels?: Record<string, { value: string }> }> =
    {};
  for (let start = 0; start < ids.length; start += 50) {
    const body = await wikimedia<{
      entities: Record<string, { claims?: Claims; labels?: Record<string, { value: string }> }>;
    }>(
      "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims|labels" +
        `&languages=${labelLanguages.join("|")}&ids=${ids.slice(start, start + 50).join("|")}`,
    );
    Object.assign(result, body.entities);
  }
  return result;
}
const pointOf = (claims: Claims | undefined) => {
  const value = claims?.P625?.[0]?.mainsnak.datavalue?.value;
  return value?.latitude === undefined || value.longitude === undefined
    ? null
    : { latitude: value.latitude, longitude: value.longitude };
};

// 2b. A wine item with no point of its own lies somewhere: the area Wikidata
//     places it in (P131, a municipality or a province) gives an approximate
//     one, marked as such.
const areaOf = new Map<string, string>();
for (const entry of Object.values(linked)) {
  if (entry.latitude !== null || entry.qid === null) continue;
  const area = (entities[entry.qid] as { claims?: Claims } | undefined)?.claims?.P131?.[0]?.mainsnak
    .datavalue?.value.id;
  if (area !== undefined) areaOf.set(entry.qid, area);
}
const areas = await claimsOf([...new Set(areaOf.values())]);
for (const entry of Object.values(linked)) {
  const area = entry.qid === null ? undefined : areaOf.get(entry.qid);
  const point = area === undefined ? null : pointOf(areas[area]?.claims);
  if (point === null) continue;
  entry.latitude = point.latitude;
  entry.longitude = point.longitude;
  entry.pointSource = "area";
}

// 2c. A registered name with no wine item at all is often the name of its
//     town ("Toro", "Rueda", "Málaga"): a place in the same country whose
//     label is exactly that name gives the point — and only the point; its
//     article is about the town, not the wine. Searches are cached.
const placesPath = resolve(cache, "places.json");
const placeSearches = (
  existsSync(placesPath) ? JSON.parse(readFileSync(placesPath, "utf8")) : {}
) as Record<string, string[]>;
const pending: { ambrosia: string; country: string; names: string[] }[] = [];
for (const row of register.results) {
  const ambrosia = String(row.appUniqueId);
  if (linked[ambrosia] !== undefined) continue;
  const country = registerCountries(String(row.countryId))[0];
  if (country === undefined || memberStates[country] === undefined) continue;
  const names = [
    ...new Set(
      registerNames(String(row.protectedName)).flatMap((name) => [name, transliterate(name)]),
    ),
  ];
  pending.push({ ambrosia, country, names });
  for (const name of names.slice(0, 2)) {
    if (placeSearches[name] !== undefined) continue;
    const body = await wikimedia<{ search?: { id: string }[] }>(
      "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=7" +
        `&language=en&uselang=en&strictlanguage=false&search=${encodeURIComponent(name)}`,
    );
    placeSearches[name] = (body.search ?? []).map((hit) => hit.id);
    writeFileSync(placesPath, JSON.stringify(placeSearches));
  }
}
const candidates = await claimsOf([
  ...new Set(pending.flatMap((entry) => entry.names.flatMap((name) => placeSearches[name] ?? []))),
]);
let placed = 0;
for (const entry of pending) {
  const keys = new Set(entry.names.map((name) => matchKey(name)));
  for (const name of entry.names) {
    const found = (placeSearches[name] ?? []).find((id) => {
      const candidate = candidates[id];
      const inCountry = candidate?.claims?.P17?.some(
        (claim) => claim.mainsnak.datavalue?.value.id === memberStates[entry.country],
      );
      const named = Object.values(candidate?.labels ?? {}).some((label) =>
        keys.has(matchKey(label.value)),
      );
      return inCountry === true && named && pointOf(candidate?.claims) !== null;
    });
    if (found === undefined) continue;
    const point = pointOf(candidates[found]?.claims)!;
    linked[entry.ambrosia] = {
      labels: {},
      latitude: point.latitude,
      longitude: point.longitude,
      pointSource: "place",
      qid: null,
    };
    placed += 1;
    break;
  }
}
console.info(`  ${placed} registered names placed by the town they are named after.`);

// 3. Wikipedia leads, cached one file per item so a rerun resumes.
const qids = [
  ...new Set(Object.values(linked).flatMap((entry) => (entry.qid === null ? [] : [entry.qid]))),
];
let fetched = 0;
for (const item of qids) {
  const path = resolve(cache, "leads", `${item}.json`);
  if (existsSync(path)) continue;
  const leads: Record<string, { lead: string; title: string }> = {};
  for (const locale of locales) {
    const title = entities[item]?.sitelinks?.[`${locale}wiki`]?.title;
    if (title === undefined) continue;
    try {
      const body = (await request(
        `https://${locale}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2` +
          `&prop=extracts&explaintext=1&exintro=1&redirects=1&titles=${encodeURIComponent(title)}`,
      )) as { query?: { pages?: { extract?: string }[] } };
      const lead = body.query?.pages?.[0]?.extract?.trim();
      if (lead !== undefined && lead.length > 0) leads[locale] = { lead, title };
    } catch {
      // A missing lead is a missing summary in that language, not a failed run.
    }
  }
  writeFileSync(path, JSON.stringify(leads, null, 2));
  fetched += 1;
  if (fetched % 50 === 0) console.info(`  Wikipedia leads for ${fetched} items`);
}

writeFileSync(resolve(cache, "wikidata.json"), JSON.stringify(linked, null, 2));
console.info(
  `  Wikidata: ${Object.keys(linked).length} register entries linked ` +
    `(${direct.size} by eAmbrosia id, ${byNameOnly} by name), ` +
    `${Object.values(linked).filter((entry) => entry.latitude !== null).length} with coordinates.`,
);
