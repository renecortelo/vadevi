import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { interiorPoint, type Ring } from "./polygon";
import { userAgent, wikimedia } from "./wikimedia";
import { type Cell, readSheet, sheetDate } from "./xlsx";

/**
 * The atlas beyond the EU, country by country, each from its own official
 * register — the EU register holds only the few names other countries have
 * protected there.
 *
 * United States: the American Viticultural Areas, from the Code of Federal
 * Regulations itself (27 CFR part 9, subpart C, read from eCFR; a work of the
 * US government, public domain). Each AVA's section gives its name, its
 * approved maps and its boundary. The boundaries as drawn by the UC Davis AVA
 * project (CC0, https://github.com/UCDavisLibrary/ava) give the states it lies
 * in, the AVAs it lies within, its date, and a point inside its boundary.
 * Wikidata (CC0) adds names in other languages; Wikipedia (CC BY-SA 4.0), the
 * lead that becomes its summary.
 *
 * New Zealand: the geographical indications registered for wine, from the
 * export of IPONZ's register (facts only: its licence excludes the registers).
 * South Africa: the production areas of the Wine of Origin scheme, from the
 * list SAWIS publishes, transcribed in `data/kb/za-wine-of-origin.json`. Both
 * placed by OpenStreetMap's geocoder (© OpenStreetMap contributors, ODbL),
 * approximately: the place each name is.
 *
 * No model is involved: nothing here costs AI quota.
 *
 * Usage: pnpm kb:fetch-world-appellations
 */

const locales = ["en", "es", "ca", "fr", "de", "it", "nl", "pt"] as const;
const cache = resolve(".kb-cache/world");
const leadsFolder = resolve(".kb-cache/appellations/leads");
mkdirSync(cache, { recursive: true });
mkdirSync(leadsFolder, { recursive: true });

async function text(url: string, init: RequestInit = {}): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await new Promise((settle) => setTimeout(settle, 500));
    const response = await fetch(url, {
      ...init,
      // eCFR answers its full-text endpoint only compressed.
      headers: { "Accept-Encoding": "gzip", "User-Agent": userAgent, ...(init.headers ?? {}) },
    });
    if (response.ok) return response.text();
    await new Promise((settle) => setTimeout(settle, 5_000 * (attempt + 1)));
  }
  throw new Error(`Failed after retries: ${url}`);
}

/** A cached download: fetched once, then read from the cache. */
async function cached(name: string, url: string): Promise<string> {
  const path = resolve(cache, name);
  if (existsSync(path)) return readFileSync(path, "utf8");
  const body = await text(url);
  writeFileSync(path, body);
  return body;
}

// 1. The Code of Federal Regulations, as of its latest issue.
const titles = JSON.parse(await text("https://www.ecfr.gov/api/versioner/v1/titles.json")) as {
  titles: { number: number; up_to_date_as_of: string }[];
};
const asOf = titles.titles.find((title) => title.number === 27)!.up_to_date_as_of;
const part9 = await cached(
  `27cfr9-${asOf}.xml`,
  `https://www.ecfr.gov/api/versioner/v1/full/${asOf}/title-27.xml?part=9`,
);

const entity = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
const plain = (xml: string) =>
  entity(xml.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "June",
  "July",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];
/** "[T.D. ATF-231, 51 FR 24144, July 2, 1986; …]" → "1986-07-02", the first act's date. */
function firstActDate(citation: string): string | null {
  const match = /([A-Z][a-z]+)\.? (\d{1,2}), (\d{4})/.exec(citation);
  if (match === null) return null;
  const month = months.findIndex((name) => match[1]!.startsWith(name.slice(0, 3)));
  if (month < 0) return null;
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
}

type Section = { citation: string; name: string; section: string };
const sections: Section[] = [];
for (const [, section, body] of part9.matchAll(/<DIV8 N="(9\.\d+)"[^>]*>([\s\S]*?)<\/DIV8>/g)) {
  // Subpart C: §9.21 is its general rule, the AVAs follow.
  const number = Number(section!.slice(2));
  if (number <= 21) continue;
  const prose = plain(body!);
  const name =
    /name of the viticultural area described in this (?:section|petition) is “([^”]+)”/.exec(
      prose,
    )?.[1];
  if (name === undefined) continue;
  // "“Green Valley” qualified by the words “Solano County”": the name a label
  // carries is both.
  const qualifier = /is “[^”]+” qualified by the words? “([^”]+)”/.exec(prose)?.[1];
  const full = qualifier === undefined ? name : `${qualifier.replace(/[.,]$/, "")} ${name}`;
  const citation = /<CITA[^>]*>([\s\S]*?)<\/CITA>/.exec(body!)?.[1] ?? "";
  sections.push({ citation: plain(citation), name: full.replace(/[.,]$/, ""), section: section! });
}
console.info(`  eCFR (${asOf}): ${sections.length} American Viticultural Areas.`);

// 2. UC Davis's boundaries, by section.
type Feature = {
  geometry: { coordinates: unknown; type: "MultiPolygon" | "Polygon" } | null;
  properties: {
    cfr_index: string | null;
    contains: string | null;
    created: string | null;
    state: string | null;
    within: string | null;
  };
};
const boundaries = JSON.parse(
  await cached(
    "avas.geojson",
    "https://raw.githubusercontent.com/UCDavisLibrary/ava/master/avas_aggregated_files/avas.geojson",
  ),
) as { features: Feature[] };
const boundaryOf = new Map(
  boundaries.features
    .filter((feature) => feature.properties.cfr_index !== null)
    .map((feature) => [feature.properties.cfr_index!, feature]),
);
const split = (value: string | null) =>
  value === null
    ? []
    : value
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean);

// 3. Wikidata: the items that are American Viticultural Areas (Q166247).
type Binding = Record<string, { value: string } | undefined>;
const query = `SELECT ?item ?label WHERE {
  ?item wdt:P31/wdt:P279* wd:Q166247 .
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
}`;
const sparql = await wikimedia<{ results: { bindings: Binding[] } }>(
  `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,
);
/** "Napa Valley AVA" and "Napa Valley" are the same key. */
const key = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+(ava|american viticultural area)$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const itemsByKey = new Map<string, Set<string>>();
for (const binding of sparql.results.bindings) {
  const item = binding.item!.value.split("/").at(-1)!;
  const found = itemsByKey.get(key(binding.label!.value)) ?? new Set<string>();
  found.add(item);
  itemsByKey.set(key(binding.label!.value), found);
}

type Entity = {
  claims?: Record<string, { mainsnak: { datavalue?: { value: unknown } } }[]>;
  labels?: Record<string, { value: string }>;
  sitelinks?: Record<string, { title: string }>;
};
// An AVA Wikidata does not file as one may still have its article, titled
// "<name> AVA" (abbreviations spelled out): its item is the AVA's.
for (const entry of sections) {
  if (itemsByKey.has(key(entry.name))) continue;
  const spelled = entry.name.replace(/^Mt\. /, "Mount ").replace(/^St\. /, "Saint ");
  const titles = [...new Set([`${entry.name} AVA`, `${spelled} AVA`])];
  const body = await wikimedia<{
    query?: {
      pages?: { missing?: boolean; pageprops?: { wikibase_item?: string }; title: string }[];
    };
  }>(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1` +
      `&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(titles.join("|"))}`,
  );
  const items = new Set(
    (body.query?.pages ?? [])
      .filter((page) => page.missing !== true && /\bAVA$/.test(page.title))
      .flatMap((page) =>
        page.pageprops?.wikibase_item === undefined ? [] : [page.pageprops.wikibase_item],
      ),
  );
  if (items.size > 0) itemsByKey.set(key(entry.name), items);
}
const linked = sections.flatMap((entry) => {
  const items = [...(itemsByKey.get(key(entry.name)) ?? [])];
  // Two items of one name are a guess: neither.
  return items.length === 1 ? [items[0]!] : [];
});
async function fetchEntities(ids: string[]): Promise<Record<string, Entity>> {
  const found: Record<string, Entity> = {};
  for (let start = 0; start < ids.length; start += 50) {
    const batch = ids.slice(start, start + 50);
    const body = await wikimedia<{ entities: Record<string, Entity> }>(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|sitelinks|claims` +
        `&languages=${locales.join("|")}&ids=${batch.join("|")}`,
    );
    Object.assign(found, body.entities);
  }
  return found;
}
const entities = await fetchEntities(linked);

// 4. Wikipedia leads, in the library's languages, one cached file per item
//    (shared with the EU atlas's).
async function fetchLeads(items: string[], known: Record<string, Entity>) {
  let fetched = 0;
  for (const item of items) {
    const path = resolve(leadsFolder, `${item}.json`);
    if (existsSync(path)) continue;
    const leads: Record<string, { lead: string; title: string }> = {};
    for (const locale of locales) {
      const title = known[item]?.sitelinks?.[`${locale}wiki`]?.title;
      if (title === undefined) continue;
      try {
        const body = await wikimedia<{ query?: { pages?: { extract?: string }[] } }>(
          `https://${locale}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2` +
            `&prop=extracts&explaintext=1&exintro=1&redirects=1&titles=${encodeURIComponent(title)}`,
        );
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
}
await fetchLeads(linked, entities);

// 5. One record per AVA.
const coordinate = (item: string) => {
  const value = entities[item]?.claims?.P625?.[0]?.mainsnak.datavalue?.value as
    { latitude: number; longitude: number } | undefined;
  return value === undefined ? null : { latitude: value.latitude, longitude: value.longitude };
};
const records = sections.map((entry) => {
  const feature = boundaryOf.get(entry.section);
  const rings: Ring[] =
    feature?.geometry == null
      ? []
      : feature.geometry.type === "Polygon"
        ? [(feature.geometry.coordinates as Ring[])[0]!]
        : (feature.geometry.coordinates as Ring[][]).map((polygon) => polygon[0]!);
  const inside = rings.length === 0 ? null : interiorPoint(rings);
  const items = [...(itemsByKey.get(key(entry.name)) ?? [])];
  const item = items.length === 1 ? items[0]! : null;
  const fromItem = item === null ? null : coordinate(item);
  return {
    citation: entry.citation,
    contains: split(feature?.properties.contains ?? null),
    labels: Object.fromEntries(
      Object.entries(item === null ? {} : (entities[item]?.labels ?? {})).map(([locale, label]) => [
        locale,
        label.value.replace(/\s+AVA$/, ""),
      ]),
    ),
    latitude: inside?.latitude ?? fromItem?.latitude ?? null,
    longitude: inside?.longitude ?? fromItem?.longitude ?? null,
    name: entry.name,
    pointSource: inside !== null ? "boundary" : fromItem !== null ? "item" : null,
    qid: item,
    registeredOn: feature?.properties.created ?? firstActDate(entry.citation),
    section: entry.section,
    states: split(feature?.properties.state ?? null),
    within: split(feature?.properties.within ?? null),
  };
});
writeFileSync(resolve(cache, "us.json"), JSON.stringify(records, null, 1));
console.info(
  `  ${records.length} AVAs: ${records.filter((record) => record.qid !== null).length} linked to Wikidata, ` +
    `${records.filter((record) => record.pointSource === "boundary").length} placed inside their boundary, ` +
    `${records.filter((record) => record.pointSource === "item").length} by Wikidata's point.`,
);

// ── New Zealand and South Africa ────────────────────────────────────────────
// Neither register publishes boundaries as data, and Wikipedia has articles on
// few of their names. Each name's article is the one titled for its wine
// ("Marlborough wine region", "Western Cape wine"), never the town's or the
// province's; its point is OpenStreetMap's, for the place the name is.

/**
 * The Wikidata items of the articles about each name's wine, by the name's
 * key: an English article titled "<name> wine region" or "<name> wine" — not a
 * redirect elsewhere — or one listed by hand.
 */
async function wineArticleItems(
  names: Map<string, string[]>,
  byHand: Record<string, string> = {},
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const [area, spellings] of names) {
    // "Hawke’s Bay" is titled with a plain apostrophe.
    const titles = [
      ...new Set([
        ...[...spellings, ...spellings.map((name) => name.replace(/’/g, "'"))].flatMap((name) => [
          `${name} wine region`,
          `${name} wine`,
        ]),
        ...(byHand[area] === undefined ? [] : [byHand[area]]),
      ]),
    ];
    const body = await wikimedia<{
      query?: {
        pages?: { missing?: boolean; pageprops?: { wikibase_item?: string }; title: string }[];
      };
    }>(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1` +
        `&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(titles.join("|"))}`,
    );
    // Redirects are followed: an article is taken only if its own title is
    // one of those asked for — "Central Otago wine" leads to "Central Otago
    // wine region", "Stellenbosch wine" would lead to the town.
    const items = new Set(
      (body.query?.pages ?? [])
        .filter((page) => page.missing !== true && titles.includes(page.title))
        .flatMap((page) =>
          page.pageprops?.wikibase_item === undefined ? [] : [page.pageprops.wikibase_item],
        ),
    );
    if (items.size === 1) found.set(area, [...items][0]!);
  }
  return found;
}

// OpenStreetMap's geocoder (Nominatim), cached: its policy asks for at most
// one request a second, an identifying User-Agent, and results kept.
type Found = {
  address?: { state?: string };
  category?: string;
  lat: string;
  lon: string;
  name: string;
  type?: string;
};
const nominatimPath = resolve(cache, "nominatim.json");
const nominatim = (
  existsSync(nominatimPath) ? JSON.parse(readFileSync(nominatimPath, "utf8")) : {}
) as Record<string, Found[]>;
let lastLookup = 0;
async function lookUp(query: string, country: string): Promise<Found[]> {
  const cacheKey = `${country}:${query}`;
  if (nominatim[cacheKey] !== undefined) return nominatim[cacheKey]!;
  await new Promise((settle) => setTimeout(settle, Math.max(0, lastLookup + 1_100 - Date.now())));
  lastLookup = Date.now();
  const response = await fetch(
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&addressdetails=1" +
      `&countrycodes=${country}&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json", "User-Agent": userAgent } },
  );
  const found = response.ok ? ((await response.json()) as Found[]) : [];
  nominatim[cacheKey] = found;
  writeFileSync(nominatimPath, JSON.stringify(nominatim));
  return found;
}
const fold = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const kilometres = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) =>
  Math.hypot(
    a.latitude - b.latitude,
    (a.longitude - b.longitude) * Math.cos((a.latitude * Math.PI) / 180),
  ) * 111.2;

/**
 * A point for a name: a place, boundary or natural feature whose own name is
 * the name (or one half of a bilingual one, "North Island / Te Ika-a-Māui"),
 * in the province or region the register places it in. Near the area it lies
 * in where that has a point already, and the nearest such; otherwise the
 * area of that name where there is one (Auckland the region, not the city),
 * or else every place of that name must be one place (within 30 km).
 * `suffixes`: what an area's own name may add ("Central Hawke's Bay
 * District").
 */
async function placeOf(
  names: string[],
  country: string,
  states: string[],
  near: { latitude: number; longitude: number } | null,
  suffixes: string[] = [],
): Promise<{ latitude: number; longitude: number; query: string } | null> {
  for (const name of names) {
    const results = (await lookUp(name, country)).filter(
      (result) =>
        result.name
          .split(/\s+\/\s+/)
          .some((half) =>
            [name, ...suffixes.map((suffix) => `${name}${suffix}`)].some(
              (wanted) =>
                fold(half) === fold(wanted) && (wanted === name || result.category === "boundary"),
            ),
          ) &&
        (["boundary", "place", "natural"].includes(result.category ?? "") ||
          (result.category === "landuse" && result.type === "vineyard")) &&
        (states.length === 0 ||
          states.some((state) => fold(result.address?.state ?? "").includes(fold(state)))),
    );
    const matching = results.map((result) => ({
      latitude: Number(result.lat),
      longitude: Number(result.lon),
    }));
    if (matching.length === 0) continue;
    if (near !== null) {
      const closest = matching
        .map((point) => ({ distance: kilometres(point, near), point }))
        .sort((left, right) => left.distance - right.distance)[0]!;
      if (closest.distance <= 80) return { ...closest.point, query: name };
      continue;
    }
    const area = results.findIndex(
      (result) => result.category === "boundary" && result.type === "administrative",
    );
    if (area >= 0) return { ...matching[area]!, query: name };
    const first = matching[0]!;
    if (matching.every((point) => kilometres(point, first) <= 30)) return { ...first, query: name };
  }
  return null;
}

const leadLanguages = async (items: string[]) => {
  const known = await fetchEntities(items);
  await fetchLeads(items, known);
};

// 6. New Zealand: the register of geographical indications kept by IPONZ,
//    from its own export. Crown copyright, reproducible for personal or in-house
//    use, which excludes the registers: only facts are taken from it — each
//    name, its IP number, its date — and each page links to the register.
const iponzPath = resolve(cache, "iponz-gi.xlsx");
if (!existsSync(iponzPath)) {
  const response = await fetch(
    "https://www.iponz.govt.nz/get-ip/geographical-indications/register/downloadExport",
    { headers: { "User-Agent": userAgent } },
  );
  if (!response.ok) throw new Error(`IPONZ export: HTTP ${response.status}`);
  writeFileSync(iponzPath, new Uint8Array(await response.arrayBuffer()));
}
const sheet = readSheet(new Uint8Array(readFileSync(iponzPath)));
const header = sheet.findIndex((row) => row.A?.value === "IP Number");
// New Zealand's own wine names: the three the Act registered itself
// ("Enduring", by statute) and those registered since as wine; foreign
// names protected by treaty have a primary country.
const nzRows = sheet
  .slice(header + 1)
  .filter(
    (row) =>
      (row.Q?.value ?? "") === "" &&
      ((row.F?.value === "Enduring" && row.G?.value === "Enduring") ||
        (row.F?.value === "New Zealand" && row.G?.value === "Wine")) &&
      /^Registered/.test(row.I?.value ?? ""),
  );
const nzNames = (row: Record<string, Cell>) =>
  row
    .C!.value.split(/\s+\/\s+/)
    .map((name) => name.trim())
    .filter(Boolean);
const nzItems = await wineArticleItems(new Map(nzRows.map((row) => [row.A!.value, nzNames(row)])));
await leadLanguages([...new Set(nzItems.values())]);
const nzRecords = [];
for (const row of nzRows) {
  const names = nzNames(row);
  // "Nelson/Tasman": either; the three national names lie in no one region.
  const regions = (row.P?.value ?? "").split("/").filter(Boolean);
  const point = await placeOf(
    [...names, ...names.map((name) => name.replace(/’/g, "'"))],
    "nz",
    regions,
    null,
    [" District"],
  );
  nzRecords.push({
    ipNumber: row.A!.value,
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
    names,
    qid: nzItems.get(row.A!.value) ?? null,
    registeredOn: sheetDate(row.M?.value ?? ""),
    region: row.P?.value || null,
    url: (row.V?.link ?? "").replace(/^http:\/\/iponz\.govt\.nz/, "https://www.iponz.govt.nz"),
  });
}
writeFileSync(resolve(cache, "nz.json"), JSON.stringify(nzRecords, null, 1));
console.info(
  `  IPONZ: ${nzRecords.length} New Zealand wine names, ${nzItems.size} with an article on their wine, ` +
    `${nzRecords.filter((record) => record.latitude !== null).length} placed.`,
);

// 7. South Africa: the production areas of the Wine of Origin scheme, as
//    SAWIS lists them for the Wine and Spirit Board (`data/kb/za-wine-of-origin.json`,
//    transcribed from the list). Official texts of a legislative nature have
//    no copyright in South Africa.
type ZaArea = { in: string[]; level: string; names: string[] };
const za = JSON.parse(readFileSync(resolve("data/kb/za-wine-of-origin.json"), "utf8")) as {
  areas: ZaArea[];
  source: { url: string };
};
const zaByName = new Map(za.areas.map((area) => [area.names[0]!, area]));
/** Every area an area lies in, the nearest first: its own, then theirs. */
const zaWithin = (area: ZaArea): string[] => {
  const order: string[] = [];
  let level = area.in;
  while (level.length > 0) {
    const next: string[] = [];
    for (const name of level) {
      if (order.includes(name)) continue;
      order.push(name);
      next.push(...(zaByName.get(name)?.in ?? []));
    }
    level = next;
  }
  return order;
};
// Breedekloof's article is the district's (read by hand); the others are
// titled for their wine.
const zaItems = await wineArticleItems(
  new Map(za.areas.map((area) => [area.names[0]!, area.names])),
  { Breedekloof: "Breedekloof" },
);
await leadLanguages([...new Set(zaItems.values())]);
// The largest first, so a ward is looked for near its district's point.
const levels = [
  "overarchingUnit",
  "unit",
  "overarchingRegion",
  "region",
  "subregion",
  "district",
  "ward",
];
const zaPoints = new Map<string, { latitude: number; longitude: number; query: string }>();
for (const area of [...za.areas].sort(
  (left, right) => levels.indexOf(left.level) - levels.indexOf(right.level),
)) {
  const within = zaWithin(area);
  // The province: the geographical unit it lies in, or is.
  const province = [area.names[0]!, ...within].find((name) => zaByName.get(name)?.level === "unit");
  const district = within.find((name) =>
    ["district", "subregion"].includes(zaByName.get(name)?.level ?? ""),
  );
  const point = await placeOf(
    area.names,
    "za",
    province === undefined ? [] : [province],
    district === undefined ? null : (zaPoints.get(district) ?? null),
  );
  if (point !== null) zaPoints.set(area.names[0]!, point);
}
const zaRecords = za.areas.map((area) => ({
  latitude: zaPoints.get(area.names[0]!)?.latitude ?? null,
  level: area.level,
  longitude: zaPoints.get(area.names[0]!)?.longitude ?? null,
  names: area.names,
  qid: zaItems.get(area.names[0]!) ?? null,
  within: zaWithin(area),
}));
writeFileSync(
  resolve(cache, "za.json"),
  JSON.stringify({ records: zaRecords, sourceUrl: za.source.url }, null, 1),
);
console.info(
  `  Wine of Origin: ${zaRecords.length} production areas, ${zaItems.size} with an article on their wine, ` +
    `${zaPoints.size} placed.`,
);

// 8. Australia: the Register of Protected Names' geographical indications,
//    as Wine Australia lists them, each with the date its page gives for its
//    entry in the register; the boundaries of its zones, regions and
//    subregions from Wine Australia's open data (CC BY 4.0, © Wine Australia),
//    which also give each one's GI number and its kind. A name lies within
//    the one the register lists it under — Murray Darling under both zones it
//    straddles.
const waSite = "https://www.wineaustralia.com";
const waFolder = resolve(cache, "wine-australia");
mkdirSync(waFolder, { recursive: true });
async function waPage(path: string): Promise<string> {
  const file = resolve(waFolder, `${path.replace(/^\/+/, "").replace(/[^a-z0-9]+/gi, "-")}.html`);
  if (existsSync(file)) return readFileSync(file, "utf8");
  const body = await text(`${waSite}${path}`);
  writeFileSync(file, body);
  return body;
}
const pageText = (page: string) =>
  entity(page.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, " ").replace(/<[^>]+>/g, " "))
    .replace(/&rsquo;|&#x2019;/g, "’")
    .replace(/\s+/g, " ");
const register = await waPage(
  "/labelling/register-of-protected-gis-and-other-terms/geographical-indications",
);
// The register's list: each name links to its own page. "Adelaide (Super
// Zone, includes Mount Lofty Ranges, Fleurieu and Barossa)" names what the
// super zone holds; a name listed under two zones is one name.
type AuListed = { includes: string[]; name: string; path: string };
const listed = new Map<string, AuListed>();
const order: AuListed[] = [];
const listStart = register.indexOf("labelling-gi-australia");
for (const [, path, label] of register
  .slice(listStart - 200)
  .matchAll(/<a[^>]+href="([^"]*geographical-indica[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
  // Markup inside a name ("<span>S</span>outh Coast") is not a space.
  const title = entity(label!.replace(/<[^>]+>/g, ""))
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length === 0 || /Committee|Australian Geographical Indications/.test(title)) continue;
  const superZone = /^(.+?) \(Super Zone, includes (.+)\)$/.exec(title);
  const name = superZone?.[1] ?? title;
  const includes =
    superZone === undefined || superZone === null
      ? []
      : superZone[2]!.split(/,\s*|\s+and\s+/).map((part) => part.trim());
  const key = fold(name);
  if (!listed.has(key)) listed.set(key, { includes, name, path: path!.replace(/^\/au\//, "/") });
  order.push(listed.get(key)!);
}
const auStates = [
  "South Australia",
  "New South Wales",
  "Western Australia",
  "Queensland",
  "Victoria",
  "Tasmania",
  "Northern Territory",
  "Australian Capital Territory",
];
const stateNames: Record<string, string> = {
  ACT: "Australian Capital Territory",
  NSW: "New South Wales",
  NT: "Northern Territory",
  QLD: "Queensland",
  SA: "South Australia",
  TAS: "Tasmania",
  VIC: "Victoria",
  WA: "Western Australia",
};

// Each name's date of entry in the register, from its own page.
const longMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const auDates = new Map<string, string>();
for (const entry of listed.values()) {
  // The register's older name or its newer one ("…of Protected
  // Geographical Indications and Other Terms"); a month read by its first
  // three letters, as one page spells October "Octoer".
  const said =
    /entered in the Register of Protected [A-Za-z ]+? on (\d{1,2}) ([A-Z][a-z]+) (\d{4})/.exec(
      pageText(await waPage(entry.path)),
    );
  const month =
    said === null ? -1 : longMonths.findIndex((name) => name.slice(0, 3) === said[2]!.slice(0, 3));
  if (said !== null && month >= 0) {
    auDates.set(
      fold(entry.name),
      `${said[3]}-${String(month + 1).padStart(2, "0")}-${said[1]!.padStart(2, "0")}`,
    );
  }
}

// The boundaries: one layer each for subregions, regions and zones.
type AuFeature = {
  geometry: { coordinates: unknown; type: "MultiPolygon" | "Polygon" } | null;
  properties: Record<string, string | number | null>;
};
const waLayers =
  "https://services6.arcgis.com/s8j6JbJJCqmhNgh7/arcgis/rest/services/Wine_Geographical_Indications_Australia/FeatureServer";
const drawn = new Map<string, { feature: AuFeature; layer: "region" | "subregion" | "zone" }>();
for (const [layer, kind] of [
  [2, "zone"],
  [1, "region"],
  [0, "subregion"],
] as const) {
  const collection = JSON.parse(
    await cached(
      `wine-australia-gi-${kind}.geojson`,
      `${waLayers}/${layer}/query?where=1%3D1&outFields=*&outSR=4326&maxAllowableOffset=0.002&f=geojson`,
    ),
  ) as { features: AuFeature[] };
  for (const feature of collection.features) {
    drawn.set(fold(String(feature.properties.GI_NAME ?? "")), { feature, layer: kind });
  }
}
const ringsOf = (feature: AuFeature): Ring[] =>
  feature.geometry === null
    ? []
    : feature.geometry.type === "Polygon"
      ? [(feature.geometry.coordinates as Ring[])[0]!]
      : (feature.geometry.coordinates as Ring[][]).map((polygon) => polygon[0]!);
const levelOf = (name: string): string => {
  if (name === "Australia") return "country";
  if (name === "South Eastern Australia") return "multiStateZone";
  if (auStates.includes(name)) return "state";
  if ((listed.get(fold(name))?.includes.length ?? 0) > 0) return "superZone";
  return drawn.get(fold(name))?.layer ?? "region";
};
// What each name lies in directly.
const parents = new Map<string, string[]>();
for (const entry of listed.values()) parents.set(entry.name, []);
const add = (child: string, parent: string) => {
  const list = parents.get(child);
  if (list !== undefined && !list.includes(parent) && child !== parent) list.push(parent);
};
for (const entry of listed.values()) {
  const level = levelOf(entry.name);
  if (level === "state" || level === "multiStateZone") {
    // South Eastern Australia "includes all of the State of New South Wales,
    // all of the State of Victoria, all of the State of Tasmania, all of the
    // Australian Capital Territory" (its entry in the register), and parts of
    // Queensland and South Australia.
    if (
      ["New South Wales", "Victoria", "Tasmania", "Australian Capital Territory"].includes(
        entry.name,
      )
    ) {
      add(entry.name, "South Eastern Australia");
    }
    add(entry.name, "Australia");
  } else if (level === "superZone") {
    add(
      entry.name,
      String(drawn.get(fold(entry.includes[0] ?? ""))?.feature.properties.STATE ?? ""),
    );
    for (const zone of entry.includes) add(zone, entry.name);
  }
}
// The register lists each zone under its state, each region under its zone
// (or its state, where the state has no zones: Queensland), each subregion
// under its region.
let currentState: string | null = null;
let currentZone: string | null = null;
let currentRegion: string | null = null;
for (const entry of order) {
  const level = levelOf(entry.name);
  if (level === "state") [currentState, currentZone, currentRegion] = [entry.name, null, null];
  else if (level === "zone") {
    [currentZone, currentRegion] = [entry.name, null];
    if (currentState !== null) add(entry.name, currentState);
  } else if (level === "region") {
    currentRegion = entry.name;
    const holder = currentZone ?? currentState;
    if (holder !== null) add(entry.name, holder);
  } else if (level === "subregion" && currentRegion !== null) add(entry.name, currentRegion);
}
// The super zone's state, by its zones' ("SA").
for (const entry of listed.values()) {
  const list = parents.get(entry.name)!;
  parents.set(
    entry.name,
    list.map((parent) => stateNames[parent] ?? parent).filter((parent) => listed.has(fold(parent))),
  );
}
const auWithin = (name: string): string[] => {
  const order: string[] = [];
  let level = parents.get(name) ?? [];
  while (level.length > 0) {
    const next: string[] = [];
    for (const parent of level) {
      if (order.includes(parent)) continue;
      order.push(parent);
      next.push(...(parents.get(parent) ?? []));
    }
    level = next;
  }
  return order;
};

// Articles: an English one titled for the name's wine — "Barossa Valley wine
// region", "Fleurieu zone", "Margaret River (wine region)" — never a town's;
// the states' and the country's, by hand.
const auArticleTitles = new Map<string, string[]>();
for (const entry of listed.values()) {
  auArticleTitles.set(entry.name, [entry.name]);
}
const auItems = await wineArticleItems(auArticleTitles, {
  Australia: "Australian wine",
  "New South Wales": "New South Wales wine",
  Queensland: "Queensland wine",
  "South Australia": "South Australian wine",
  Tasmania: "Tasmanian wine",
  Victoria: "Victorian wine",
  "Western Australia": "Western Australian wine",
});
// The other titles Wikipedia gives a wine area.
const suffixed = new Map<string, string>();
for (const entry of listed.values()) {
  if (auItems.has(entry.name)) continue;
  for (const title of [
    `${entry.name} zone (wine)`,
    `${entry.name} zone`,
    `${entry.name} wine zone`,
    `${entry.name} (wine region)`,
    `${entry.name} (wine)`,
    `${entry.name} wine sub-region`,
  ]) {
    suffixed.set(title, entry.name);
  }
}
const suffixedTitles = [...suffixed.keys()];
for (let start = 0; start < suffixedTitles.length; start += 40) {
  const batch = suffixedTitles.slice(start, start + 40);
  const body = await wikimedia<{
    query?: {
      pages?: { missing?: boolean; pageprops?: { wikibase_item?: string }; title: string }[];
    };
  }>(
    `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1` +
      `&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(batch.join("|"))}`,
  );
  for (const page of body.query?.pages ?? []) {
    const name = suffixed.get(page.title);
    const item = page.pageprops?.wikibase_item;
    if (page.missing === true || name === undefined || item === undefined) continue;
    if (!auItems.has(name)) auItems.set(name, item);
  }
}
await leadLanguages([...new Set(auItems.values())]);

const auPoints = new Map<string, { latitude: number; longitude: number; source: string }>();
for (const entry of listed.values()) {
  const own = drawn.get(fold(entry.name));
  const inside = own === undefined ? null : interiorPoint(ringsOf(own.feature));
  if (inside !== null) {
    auPoints.set(entry.name, { ...inside, source: "boundary" });
  } else if (levelOf(entry.name) === "state" || entry.name === "Australia") {
    const point = await placeOf([entry.name], "au", [], null);
    if (point !== null) auPoints.set(entry.name, { ...point, source: "place" });
  }
}
// A name drawn by no layer of its own and holding others: the middle of
// theirs (Adelaide's zones; South Eastern Australia's states).
for (const name of ["Adelaide", "South Eastern Australia"]) {
  const held = [...listed.values()]
    .filter((entry) => (parents.get(entry.name) ?? []).includes(name))
    .map((entry) => auPoints.get(entry.name))
    .filter((point) => point !== undefined);
  if (held.length === 0) continue;
  const middle = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  auPoints.set(name, {
    latitude: middle(held.map((point) => point.latitude)),
    longitude: middle(held.map((point) => point.longitude)),
    source: "area",
  });
}
const auRecords = [...listed.values()].map((entry) => {
  const own = drawn.get(fold(entry.name));
  const point = auPoints.get(entry.name);
  return {
    giNumber:
      own?.feature.properties.GI_NUMBER == null ? null : String(own.feature.properties.GI_NUMBER),
    latitude: point?.latitude ?? null,
    level: levelOf(entry.name),
    longitude: point?.longitude ?? null,
    name: entry.name,
    pointSource: point?.source ?? null,
    qid: auItems.get(entry.name) ?? null,
    registeredOn: auDates.get(fold(entry.name)) ?? null,
    url: `${waSite}${entry.path}`,
    within: auWithin(entry.name),
  };
});
writeFileSync(resolve(cache, "au.json"), JSON.stringify(auRecords, null, 1));
console.info(
  `  Wine Australia: ${auRecords.length} geographical indications, ${auDates.size} dated, ` +
    `${auItems.size} with an article on their wine, ` +
    `${auRecords.filter((record) => record.pointSource === "boundary").length} placed inside their boundary.`,
);
