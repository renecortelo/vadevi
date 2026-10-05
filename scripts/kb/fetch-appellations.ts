import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { matchKey, registerCountries, registerNames, transliterate } from "./appellation-names";
import { insideRegion, nutsRegion, type NutsRegion } from "./nuts";
import { countryLanguages, readSearches, searchKey } from "./search-appellation-names";
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
// Q3558198: the Beaujolais crus, filed as "Beaujolais vineyard".
for (const wineClass of ["Q2140699", "Q1565828", "Q451752", "Q3104453", "Q13439060", "Q3558198"]) {
  keep(
    await sparql(`SELECT DISTINCT ?item ?iso ?coord WHERE {
      ?item wdt:P31/wdt:P279* wd:${wineClass} ; wdt:P17/wdt:P297 ?iso .
      OPTIONAL { ?item wdt:P625 ?coord } }`),
  );
}
for (const [iso, country] of Object.entries(memberStates)) {
  keep(
    await sparql(`SELECT DISTINCT ?item ?coord WHERE {
      ?item wdt:P31/wdt:P279* wd:Q282 ; wdt:P17 wd:${country} . OPTIONAL { ?item wdt:P625 ?coord } }`),
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

/**
 * A label's name without the designation Wikidata often writes after it
 * ("Côte-Rôtie AOC", "Vinho Verde (DOC)", "Manchuela DO"), or null when it
 * carries none.
 */
function withoutDesignation(name: string): string | null {
  const key = matchKey(name);
  const stripped = key.replace(
    / (aoc|aop|ac|doc|docg|do|dop|doq|dac|igt|igp|pdo|pgi|ipr|vqprd|vdp|dpo|zgp|zop)$/,
    "",
  );
  return stripped === key || stripped.length < 2 ? null : stripped;
}

const byName = new Map<string, Set<string>>();
for (const [id, item] of wineItems) {
  const entity = entities[id];
  const names = [
    ...Object.values(entity?.labels ?? {}).map((label) => label.value),
    ...Object.values(entity?.aliases ?? {}).flatMap((list) => list.map((alias) => alias.value)),
  ];
  for (const name of names) {
    for (const form of [matchKey(name), withoutDesignation(name)]) {
      if (form === null || form.length < 2) continue;
      const key = `${item.country}:${form}`;
      byName.set(key, new Set([...(byName.get(key) ?? []), id]));
    }
  }
}

// Items Wikidata files under another wine's name by a stray alias, checked
// by hand: Arrábida carries "Bairrada (DOC)", Provence's whole wine region
// answers to Bellet, the Côtes de Bordeaux to its Saint-Macaire, the
// Domaine de la Romanée-Conti to the grand cru it owns, and Rosso Piceno
// superiore to the DOC it belongs to.
const notThisItem: Record<string, string[]> = {
  bairrada: ["Q2879982"],
  bellet: ["Q815934"],
  "cotes de bordeaux saint macaire": ["Q3010713"],
  // The Domaine de la Romanée-Conti, the estate, not its grand cru.
  "romanee conti": ["Q2142623"],
  // Rosso Piceno superiore, one of the DOC's wines, answers to "Piceno".
  piceno: ["Q3941677"],
  "rosso piceno": ["Q3941677"],
};
const allowed = (name: string, id: string) => !(notThisItem[matchKey(name)] ?? []).includes(id);

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
            : countries.flatMap((country) =>
                [...(byName.get(`${country}:${matchKey(name)}`) ?? [])].filter((id) =>
                  registerNames(String(row.protectedName)).every((own) => allowed(own, id)),
                ),
              ),
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
type Item = {
  aliases?: Record<string, { value: string }[]>;
  claims?: Claims;
  descriptions?: Record<string, { value: string }>;
  labels?: Record<string, { value: string }>;
  sitelinks?: Record<string, unknown>;
};
async function claimsOf(ids: string[]): Promise<Record<string, Item>> {
  const result: Record<string, Item> = {};
  for (let start = 0; start < ids.length; start += 50) {
    const body = await wikimedia<{ entities: Record<string, Item> }>(
      "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json" +
        "&props=claims|labels|aliases|descriptions|sitelinks" +
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
//     one, marked as such — never the country itself, whose middle says
//     nothing of where the wine is ("Piemonte DOC" in Italy).
//     An item may name several areas (the provinces a DOC spans), and one
//     of them may be wrong — Molise DOC lists Pesaro, Cinque Terre a village
//     in Burgundy — so the point is the median of them all, which no single
//     stray one can move.
const countryItems = new Set(Object.values(memberStates));
const areaIdsOf = (id: string | null): string[] =>
  id === null
    ? []
    : ((entities[id] as { claims?: Claims } | undefined)?.claims?.P131 ?? []).flatMap((claim) => {
        const area = claim.mainsnak.datavalue?.value.id;
        return area === undefined || countryItems.has(area) ? [] : [area];
      });
type Point = { latitude: number; longitude: number };
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
/** The areas' points' median, as the wine's. */
const middleOf = (points: Point[]): Point | null =>
  points.length === 0
    ? null
    : {
        latitude: median(points.map((point) => point.latitude)),
        longitude: median(points.map((point) => point.longitude)),
      };
const kilometres = (a: Point, b: Point) =>
  111 *
  Math.hypot(
    a.latitude - b.latitude,
    (a.longitude - b.longitude) * Math.cos((a.latitude * Math.PI) / 180),
  );
const areas = await claimsOf([
  ...new Set(
    Object.values(linked).flatMap((entry) => (entry.latitude === null ? areaIdsOf(entry.qid) : [])),
  ),
]);
for (const entry of Object.values(linked)) {
  if (entry.latitude !== null) continue;
  const points = areaIdsOf(entry.qid).flatMap((area) => pointOf(areas[area]?.claims) ?? []);
  const point = middleOf(points);
  if (point === null) continue;
  entry.latitude = point.latitude;
  entry.longitude = point.longitude;
  entry.pointSource = "area";
}

// 2c. A registered name is often the name of its town ("Toro", "Rueda",
//     "Málaga"): a place in the same country whose label is exactly that
//     name gives a point — and only the point; its article is about the
//     town, not the wine. Where the wine already has an area point, the town
//     is taken only if it lies in that area (2e): "Blagny" is a Burgundy
//     hamlet and a village in the Ardennes, and the area says which.
//     Searches are cached.
const placesPath = resolve(cache, "places.json");
const placeSearches = (
  existsSync(placesPath) ? JSON.parse(readFileSync(placesPath, "utf8")) : {}
) as Record<string, string[]>;
const pending: { ambrosia: string; country: string; names: string[] }[] = [];
/**
 * Registered names not named after a place, though a place carries the same
 * name: Graves for its gravel soils (a commune in Charente is called Graves),
 * and a vino de pago for its estate (a Los Cerrillos in Almería is not it).
 */
const notNamedForAPlace = new Set(["graves", "los cerrillos"]);
for (const row of register.results) {
  const ambrosia = String(row.appUniqueId);
  const known = linked[ambrosia];
  if (known !== undefined && known.pointSource !== null && known.pointSource !== "area") continue;
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
// The same names searched in the country's own language
// (`search-appellation-names.ts`), which finds the wine items Wikidata files
// under no class at all.
const nameSearches = readSearches();
const searchedFor = (name: string, country: string) => [
  ...new Set([
    ...(placeSearches[name] ?? []),
    ...(countryLanguages[country] ?? []).flatMap(
      (language) => nameSearches[searchKey(language, name)] ?? [],
    ),
  ]),
];
const candidates = await claimsOf([
  ...new Set(
    pending.flatMap((entry) => entry.names.flatMap((name) => searchedFor(name, entry.country))),
  ),
]);
/**
 * An item Wikidata describes as a wine or a wine region ("région viticole",
 * "French wine", "Weinbaugebiet"), in any language it is described in.
 */
const wineDescription =
  /(?<!\p{L})(wine|wines|vin|vins|vino|vini|vinho|vinhos|wein|weine|wijn|wijnen|víno|vína|vinograd|вино|вина|κρασί|οίνος|οίνου|aoc|aop|doc|docg|dop|dac|igp|igt|pdo|pgi)(?!\p{L})|viticol|vitivin|vinícol|vinicol|weinbau|weinanbau|wijnbouw|οινοπαρ|винар|винен|lozar|vinař|vinár|borvidék/iu;
const notAPlaceDescription =
  /(?<!\p{L})(building|monument|heritage|station|street|road|bridge|church|chapel|castle|school|hotel|company|ship|album|film|song|painting|family name|surname|given name|person|band|team|club|newspaper|genus|river|stream|tributary|fluss|rivière|fleuve|río|fiume|rivier|ποταμός|река|folyó|râu|reka|řeka|rieka|gebäude|bâtiment|église|gare|edificio|iglesia|estación|chiesa|stazione|kerk|gebouw)(?!\p{L})/iu;
const notAPlace = (id: string) =>
  Object.values(candidates[id]?.descriptions ?? {}).some((description) =>
    notAPlaceDescription.test(description.value),
  );
const describedAsWine = (id: string) =>
  Object.values(candidates[id]?.descriptions ?? {}).some((description) =>
    wineDescription.test(description.value),
  );

const townOf = new Map<string, (Point & { id: string; known: number })[]>();
const wineByLabel = new Map<string, string>();
for (const entry of pending) {
  const keys = new Set(entry.names.map((name) => matchKey(name)));
  const inCountry = (id: string) =>
    candidates[id]?.claims?.P17?.some(
      (claim) => claim.mainsnak.datavalue?.value.id === memberStates[entry.country],
    ) === true;
  // An item labelled with the name and its designation ("Côte-Rôtie AOC",
  // "Manchuela DO") is the wine's own, even where Wikidata files it under no
  // class: it gives the summary, and the point if it has one.
  if (linked[entry.ambrosia] === undefined) {
    const searched = entry.names.flatMap((name) => searchedFor(name, entry.country));
    const usable = (id: string) => inCountry(id) && entry.names.every((name) => allowed(name, id));
    const wine =
      searched.find(
        (id) =>
          usable(id) &&
          Object.values(candidates[id]?.labels ?? {}).some((label) => {
            const name = withoutDesignation(label.value);
            return name !== null && keys.has(name);
          }),
      ) ??
      // Or labelled with the name alone and described as a wine: Marsannay,
      // "région viticole", is filed under no class.
      searched.find(
        (id) =>
          usable(id) &&
          describedAsWine(id) &&
          Object.values(candidates[id]?.labels ?? {}).some((label) =>
            keys.has(matchKey(label.value)),
          ),
      );
    if (wine !== undefined) wineByLabel.set(entry.ambrosia, wine);
  }
  // Every place of that name, in the order the searches rank them: 2e
  // decides between them. A building, a monument or a station that carries
  // the name ("Utrecht", a house in Amsterdam) is not a place.
  const towns = [...new Set(entry.names.flatMap((name) => searchedFor(name, entry.country)))]
    .filter(
      (id) =>
        inCountry(id) &&
        !notAPlace(id) &&
        Object.values(candidates[id]?.labels ?? {}).some((label) =>
          keys.has(matchKey(label.value)),
        ) &&
        pointOf(candidates[id]?.claims) !== null,
    )
    .map((id) => ({
      ...pointOf(candidates[id]?.claims)!,
      id,
      known: Object.keys(candidates[id]?.sitelinks ?? {}).length,
    }));
  if (towns.length > 0 && !entry.names.some((name) => notNamedForAPlace.has(matchKey(name))))
    townOf.set(entry.ambrosia, towns);
}

// 2d. The wines found by their labelled name: their own point, or else the
//     area they lie in, as in 2b.
const labelledIds = [...new Set(wineByLabel.values())];
for (let start = 0; start < labelledIds.length; start += 50) {
  const body = await wikimedia<{ entities: Record<string, Entity> }>(
    "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json" +
      `&props=labels|aliases|sitelinks|claims&languages=${labelLanguages.join("|")}` +
      `&ids=${labelledIds.slice(start, start + 50).join("|")}`,
  );
  Object.assign(entities, body.entities);
}
const labelledAreas = await claimsOf([...new Set(labelledIds.flatMap((id) => areaIdsOf(id)))]);
for (const [ambrosia, id] of wineByLabel) {
  const own = pointOf((entities[id] as { claims?: Claims } | undefined)?.claims);
  const points = areaIdsOf(id).flatMap((area) => pointOf(labelledAreas[area]?.claims) ?? []);
  const point = own ?? middleOf(points);
  linked[ambrosia] = {
    labels: Object.fromEntries(
      Object.entries(entities[id]?.labels ?? {})
        .filter(([locale]) => (locales as readonly string[]).includes(locale))
        .map(([locale, label]) => [locale, label.value]),
    ),
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
    pointSource: point === null ? null : own !== null ? "item" : "area",
    qid: id,
  };
}

// 2e. The town, where it is the better point.
//
//     Where the wine lies in known areas (2b, 2d), a place of its name is
//     taken if Wikidata puts it inside one of them, or puts one of them
//     inside it (the region Puglia for a wine of its provinces) — following
//     what each lies in, up to five levels (village, municipality, district,
//     province, region). Failing that, it is taken only if it is the one
//     place of that name and lies within 100 km of an area: a wine's own
//     item often names one of the departments it spans (Madiran, Pyrénées-
//     Atlantiques; the village is in the Hautes-Pyrénées). Distance alone
//     is no test where there are namesakes: a Sant'Antimo eighty kilometres
//     from Siena is in another province.
//
//     Where nothing says where the wine is, the best-known place of the name
//     is taken if it is well known (40 Wikipedia articles or more: Bohemia,
//     Lake Balaton, Jutland), or else the searches' first — unless another
//     of the name, about as well known (a third of its articles or more),
//     lies more than 60 km away and neither lies in the other: three
//     communes called Montagny, none in Burgundy, are three guesses, and
//     none is taken; Murcia the city lies in Murcia the region.
const wellKnown = 40;
const placeOf = (claims: Claims | undefined) =>
  (claims?.P131 ?? []).flatMap((claim) => claim.mainsnak.datavalue?.value.id ?? []);
const parentsOf = new Map<string, string[]>();
for (const [id, item] of Object.entries(candidates)) parentsOf.set(id, placeOf(item.claims));
for (const [id, entity] of Object.entries(entities)) {
  if (!parentsOf.has(id)) parentsOf.set(id, placeOf((entity as { claims?: Claims }).claims));
}
let frontier = [
  ...new Set([
    ...[...townOf.values()].flatMap((towns) => towns.map((town) => town.id)),
    ...Object.values(linked).flatMap((entry) => areaIdsOf(entry.qid)),
  ]),
];
for (const id of frontier) {
  if (!parentsOf.has(id)) parentsOf.set(id, []);
}
const missing = frontier.filter((id) => candidates[id] === undefined && entities[id] === undefined);
const fetchedAreas = await claimsOf(missing);
for (const id of missing) parentsOf.set(id, placeOf(fetchedAreas[id]?.claims));
for (let level = 0; level < 5 && frontier.length > 0; level += 1) {
  const next = [...new Set(frontier.flatMap((id) => parentsOf.get(id) ?? []))].filter(
    (id) => !parentsOf.has(id) && !countryItems.has(id),
  );
  const fetchedParents = await claimsOf(next);
  for (const id of next) parentsOf.set(id, placeOf(fetchedParents[id]?.claims));
  frontier = next;
}
/** Whether Wikidata puts `id` inside one of `areas`, up to five levels up. */
function inside(id: string, areas: Set<string>): boolean {
  let level = [id];
  for (let depth = 0; depth <= 5 && level.length > 0; depth += 1) {
    if (level.some((place) => areas.has(place))) return true;
    level = [...new Set(level.flatMap((place) => parentsOf.get(place) ?? []))];
  }
  return false;
}
const nested = (a: string, b: string) => inside(a, new Set([b])) || inside(b, new Set([a]));
let placed = 0;
// The NUTS regions the register's technical files name (2f): where a name
// has no point of its own and the register says where it is made, a town of
// its name is taken only inside those regions, in 2f.
const nutsPath = resolve(cache, "nuts.json");
const registerNuts = (
  existsSync(nutsPath) ? JSON.parse(readFileSync(nutsPath, "utf8")) : {}
) as Record<string, { document: string; regions: { code: string; name: string }[] }>;
for (const [ambrosia, towns] of townOf) {
  const entry = linked[ambrosia];
  if (entry !== undefined && entry.pointSource === "item") continue;
  if (entry?.pointSource !== "area" && (registerNuts[ambrosia]?.regions.length ?? 0) > 0) continue;
  let town: (typeof towns)[number] | undefined;
  if (entry?.pointSource === "area") {
    const areaIds = areaIdsOf(entry.qid);
    const areas = new Set(areaIds);
    town =
      towns.find(
        (candidate) =>
          inside(candidate.id, areas) || areaIds.some((area) => nested(area, candidate.id)),
      ) ??
      (towns.length === 1 &&
      areaIds.some((area) => {
        const point = pointOf(fetchedAreas[area]?.claims ?? candidates[area]?.claims);
        return point !== null && kilometres(point, towns[0]!) <= 100;
      })
        ? towns[0]
        : undefined);
  } else {
    const best = towns.reduce((left, right) => (right.known > left.known ? right : left));
    town = best.known >= wellKnown ? best : towns[0];
    const chosen = town;
    if (
      chosen !== undefined &&
      towns.some(
        (other) =>
          other !== chosen &&
          other.known * 3 >= chosen.known &&
          kilometres(other, chosen) > 60 &&
          !nested(other.id, chosen.id),
      )
    )
      town = undefined;
  }
  if (town === undefined) continue;
  linked[ambrosia] = {
    labels: entry?.labels ?? {},
    latitude: town.latitude,
    longitude: town.longitude,
    pointSource: "place",
    qid: entry?.qid ?? null,
  };
  placed += 1;
}
console.info(`  ${placed} registered names placed by the town they are named after.`);
console.info(`  ${wineByLabel.size} registered names found by their labelled wine item.`);

// 2f. Where the register says the wine is made: the NUTS regions its
//     technical file names (`pnpm kb:fetch-appellation-areas`). A place of
//     the wine's name inside one of them is the wine's: the Naoussa in
//     Imathia, not the one on Paros, however well known each is. A name with
//     no such place keeps the regions' own approximate point for the build,
//     after OpenStreetMap's (`register-areas.json`).
const registerAreas: Record<string, { codes: string[]; latitude: number; longitude: number }> = {};
let placedInRegion = 0;
for (const row of register.results) {
  const ambrosia = String(row.appUniqueId);
  const entry = linked[ambrosia];
  if (entry?.latitude != null) continue;
  const regions = (
    await Promise.all(
      (registerNuts[ambrosia]?.regions ?? []).map((listed) => nutsRegion(listed.code, listed.name)),
    )
  ).filter((region): region is NutsRegion => region !== null);
  if (regions.length === 0) continue;
  // Two places of the name inside the regions, far apart (a Lechința in each
  // of the two counties the file names), are a guess: the regions' point.
  const inside = (townOf.get(ambrosia) ?? []).filter((candidate) =>
    regions.some((region) => insideRegion(candidate, region)),
  );
  const town = inside.some((other) => kilometres(other, inside[0]!) > 30) ? undefined : inside[0];
  if (town !== undefined) {
    linked[ambrosia] = {
      labels: entry?.labels ?? {},
      latitude: town.latitude,
      longitude: town.longitude,
      pointSource: "place",
      qid: entry?.qid ?? null,
    };
    placedInRegion += 1;
    continue;
  }
  const middle = middleOf(regions.map((region) => region.label))!;
  registerAreas[ambrosia] = {
    codes: regions.map((region) => region.code),
    latitude: middle.latitude,
    longitude: middle.longitude,
  };
}
writeFileSync(resolve(cache, "register-areas.json"), JSON.stringify(registerAreas, null, 1));
console.info(
  `  ${placedInRegion} registered names placed by the town of their name inside the register's regions; ` +
    `${Object.keys(registerAreas).length} more by the regions themselves.`,
);

// 3. Wikipedia leads, cached one file per item so a rerun resumes.
const qids = [
  ...new Set(Object.values(linked).flatMap((entry) => (entry.qid === null ? [] : [entry.qid]))),
];
// A wine with no article in the library's languages may have one in its
// country's own (Greek, Hungarian, Romanian…): that lead is kept too, as the
// original a faithful translation is made from — the build shows only the
// library's languages.
const ownLanguages = new Map<string, string[]>();
for (const row of register.results) {
  const item = linked[String(row.appUniqueId)]?.qid;
  if (item == null) continue;
  const languages = registerCountries(String(row.countryId)).flatMap(
    (country) => countryLanguages[country] ?? [],
  );
  ownLanguages.set(item, [...new Set([...(ownLanguages.get(item) ?? []), ...languages])]);
}
let fetched = 0;
for (const item of qids) {
  const path = resolve(cache, "leads", `${item}.json`);
  // An item found with no lead at all is asked again, for its own languages.
  if (existsSync(path) && Object.keys(JSON.parse(readFileSync(path, "utf8")) as object).length > 0)
    continue;
  const leads: Record<string, { lead: string; title: string }> = {};
  const own = (ownLanguages.get(item) ?? []).filter(
    (language) => !(locales as readonly string[]).includes(language),
  );
  for (const locale of [...locales, ...own]) {
    if (own.includes(locale) && Object.keys(leads).length > 0) break;
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
