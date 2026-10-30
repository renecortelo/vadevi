import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { normalizeLibraryText } from "./library-sql";

/**
 * Wineries for the producer field to suggest beside Wikidata's: every place
 * OpenStreetMap maps as a winery (`craft=winery`) with a name, country by
 * country (the country's boundary in OpenStreetMap, so no address is read).
 * A restaurant, bar or shop that also carries the tag is left out, as is a
 * place marked disused or whose name says it is a shop, bar or hotel. Name, country and point only; the same name twice in
 * a country is kept once. `pnpm kb:build-wineries` adds them after
 * Wikidata's, without the names Wikidata already gives. Each country's answer
 * is cached (`.kb-cache/osm-wineries/`), so a run that stops picks up where
 * it left; delete the folder to read them all afresh.
 *
 * The file is a database derived from OpenStreetMap: © OpenStreetMap
 * contributors, under the Open Database Licence (ODbL) 1.0, and credited on
 * the «Sources and licences» page.
 *
 * Usage: pnpm kb:fetch-osm-wineries
 */
const countries = [
  "AL",
  "AM",
  "AR",
  "AT",
  "AU",
  "AZ",
  "BA",
  "BE",
  "BG",
  "BO",
  "BR",
  "BY",
  "CA",
  "CH",
  "CL",
  "CN",
  "CY",
  "CZ",
  "DE",
  "DK",
  "DZ",
  "ES",
  "FR",
  "GB",
  "GE",
  "GR",
  "HR",
  "HU",
  "IL",
  "IN",
  "IT",
  "JP",
  "LB",
  "LU",
  "MA",
  "MD",
  "ME",
  "MK",
  "MT",
  "MX",
  "NL",
  "NZ",
  "PE",
  "PL",
  "PT",
  "RO",
  "RS",
  "RU",
  "SE",
  "SI",
  "SK",
  "TN",
  "TR",
  "UA",
  "US",
  "UY",
  "ZA",
];
const userAgent = "vadevi-kb/1.0 (wine library; producer suggestions)";
const notWineries = /^(restaurant|bar|cafe|pub|fast_food|biergarten|nightclub)$/;
// A name that says it is a shop, a bar, a restaurant or a place to stay is
// left out too, unless it also says it makes wine («Winery and Shop»).
const shopName =
  /\b(hotel|restaurant|ristorante|bistro|weinstube|vinothek|vinoteka|enoteca|wine ?bar|bar à vin|wine ?shop|shop|store|tienda|caviste|pizzeria|osteria|trattoria|gasthaus|gasthof|camping|apartments?|liquor)\b/i;
const makesWine =
  /\b(winery|wines|weingut|weinbau|bodegas?|cantina|cantine|domaine|ch[aâ]teau|quinta|vinarija|vinařství|vinárstvo|vingård|azienda agricola|estate|vineyards?)\b/i;

type Element = {
  center?: { lat: number; lon: number };
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  type: "node" | "relation" | "way";
};

// The main public instance first, then a second one listed on the
// OpenStreetMap wiki, when the first keeps failing.
const servers = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const cache = resolve(".kb-cache/osm-wineries");

async function overpass(code: string): Promise<Element[]> {
  const cached = resolve(cache, `${code}.json`);
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8")) as Element[];
  const query =
    `[out:json][timeout:300];area["ISO3166-1"="${code}"][admin_level=2]->.country;` +
    `nwr["craft"="winery"]["name"](area.country);out center tags;`;
  for (const server of servers) {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      // A connection that drops or never answers is retried like a 504.
      const response = await fetch(server, {
        body: new URLSearchParams({ data: query }),
        headers: { "User-Agent": userAgent },
        method: "POST",
      }).catch(() => null);
      if (response?.ok === true) {
        const elements = ((await response.json()) as { elements: Element[] }).elements;
        mkdirSync(cache, { recursive: true });
        writeFileSync(cached, JSON.stringify(elements));
        return elements;
      }
      // Busy (429), a gateway hiccup (502, 503) or timed out (504): wait and
      // ask again, a few times, then try the next instance.
      if (response !== null && ![429, 502, 503, 504].includes(response.status)) {
        throw new Error(`Overpass ${response.status} for ${code}`);
      }
      await new Promise((done) => setTimeout(done, 30_000 * attempt));
    }
  }
  throw new Error(`Overpass kept failing for ${code}`);
}

// A name the public mirror may not carry (`.mirror-denylist`, untracked) is
// left out here rather than failing the mirror later.
const denied = existsSync(resolve(".mirror-denylist"))
  ? readFileSync(resolve(".mirror-denylist"), "utf8")
      .split("\n")
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line !== "" && !line.startsWith("#"))
  : [];

const round = (value: number) => Math.round(value * 1e5) / 1e5;
const list: {
  countryCode: string;
  id: string;
  latitude: number | null;
  longitude: number | null;
  name: string;
  wikidata?: string;
}[] = [];
const seen = new Set<string>();
for (const code of countries) {
  const elements = await overpass(code);
  let kept = 0;
  for (const element of elements) {
    const tags = element.tags ?? {};
    const name = tags.name?.trim();
    if (name === undefined || name === "") continue;
    if (notWineries.test(tags.amenity ?? "") || tags.shop !== undefined) continue;
    if (shopName.test(name) && !makesWine.test(name)) continue;
    if (denied.some((term) => name.toLowerCase().includes(term))) continue;
    if (tags.disused === "yes" || "disused:craft" in tags || "abandoned:craft" in tags) continue;
    const key = `${code}:${normalizeLibraryText(name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    list.push({
      countryCode: code,
      id: `osm-${element.type.charAt(0)}${element.id}`,
      latitude: latitude === undefined ? null : round(latitude),
      longitude: longitude === undefined ? null : round(longitude),
      name,
      ...(tags.wikidata === undefined ? {} : { wikidata: tags.wikidata }),
    });
    kept += 1;
  }
  console.info(`${code}: ${kept} of ${elements.length}`);
  // Overpass is shared: one country at a time, with a pause between.
  await new Promise((done) => setTimeout(done, 5_000));
}
list.sort(
  (one, other) => one.name.localeCompare(other.name, "en") || one.id.localeCompare(other.id),
);

writeFileSync(
  resolve("data/kb/wineries-osm.json"),
  `${JSON.stringify(
    {
      about:
        "Wineries mapped in OpenStreetMap (craft=winery, with a name): name, country and point. © OpenStreetMap contributors; this file is made available under the Open Database Licence (ODbL) 1.0, https://opendatacommons.org/licenses/odbl/1-0/. `pnpm kb:fetch-osm-wineries`.",
      wineries: list,
    },
    null,
    1,
  )}\n`,
);
console.info(
  `${list.length} wineries in ${new Set(list.map((one) => one.countryCode)).size} countries.`,
);
