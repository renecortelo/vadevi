import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { userAgent, wikimedia } from "./wikimedia";

/**
 * What the atlas's registers beyond the EU share: Wikidata entities and
 * Wikipedia leads in the library's languages, the articles about a name's
 * wine, and OpenStreetMap's points for the places names are — all cached, so
 * a rerun asks only for what it has not asked before. Used by
 * `fetch-world-appellations.ts` and `fetch-registers.ts`.
 */

export const locales = ["en", "es", "ca", "fr", "de", "it", "nl", "pt"] as const;
export const cache = resolve(".kb-cache/world");
export const leadsFolder = resolve(".kb-cache/appellations/leads");
mkdirSync(cache, { recursive: true });
mkdirSync(leadsFolder, { recursive: true });

export type Entity = {
  claims?: Record<string, { mainsnak: { datavalue?: { value: unknown } } }[]>;
  labels?: Record<string, { value: string }>;
  sitelinks?: Record<string, { title: string }>;
};

export async function fetchEntities(ids: string[]): Promise<Record<string, Entity>> {
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

// Wikipedia leads, in the library's languages, one cached file per item
// (shared with the EU atlas's).
export async function fetchLeads(items: string[], known: Record<string, Entity>) {
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

/**
 * The Wikidata items of the articles about each name's wine, by the name's
 * key: an English article titled "<name> wine region" or "<name> wine" — not a
 * redirect elsewhere — or one listed by hand.
 */
export async function wineArticleItems(
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
export type Found = {
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
export async function lookUp(query: string, country: string): Promise<Found[]> {
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
export const fold = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const kilometres = (
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
export async function placeOf(
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
  if (near !== null || states.length === 0) return null;
  // Failing that, a settlement of the name in the province the register
  // gives: a town over a suburb of the same name (Vredendal) — and still only
  // where every one of them is one place. Never in the whole country: a
  // hamlet in San Luis is not the Balcarce of Buenos Aires.
  const settlements = ["city", "town", "village", "hamlet"];
  for (const name of names) {
    const towns = (await lookUp(name, country))
      .filter(
        (result) =>
          fold(result.name) === fold(name) &&
          result.category === "place" &&
          settlements.includes(result.type ?? "") &&
          states.some((state) => fold(result.address?.state ?? "").includes(fold(state))),
      )
      .map((result) => ({ latitude: Number(result.lat), longitude: Number(result.lon) }));
    const first = towns[0];
    if (first !== undefined && towns.every((point) => kilometres(point, first) <= 30)) {
      return { ...first, query: name };
    }
  }
  return null;
}

export const leadLanguages = async (items: string[]) => {
  const known = await fetchEntities(items);
  await fetchLeads(items, known);
};
