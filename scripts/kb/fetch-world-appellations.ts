import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { interiorPoint, type Ring } from "./polygon";
import { userAgent, wikimedia } from "./wikimedia";

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
const entities: Record<string, Entity> = {};
for (let start = 0; start < linked.length; start += 50) {
  const batch = linked.slice(start, start + 50);
  const body = await wikimedia<{ entities: Record<string, Entity> }>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|sitelinks|claims` +
      `&languages=${locales.join("|")}&ids=${batch.join("|")}`,
  );
  Object.assign(entities, body.entities);
}

// 4. Wikipedia leads, in the library's languages, one cached file per item
//    (shared with the EU atlas's).
let fetched = 0;
for (const item of linked) {
  const path = resolve(leadsFolder, `${item}.json`);
  if (existsSync(path)) continue;
  const leads: Record<string, { lead: string; title: string }> = {};
  for (const locale of locales) {
    const title = entities[item]?.sitelinks?.[`${locale}wiki`]?.title;
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
