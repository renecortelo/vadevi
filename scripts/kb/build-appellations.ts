import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  inEuRegister,
  leadIsAboutWine,
  matchKey,
  type RegionEntry,
  type RegisterLevel,
  registerLevels,
  registerCountries,
  registerNames,
  transliterate,
} from "./appellation-names";
import { type GrapeEntry, normalize, slug, summaryOf } from "./grape-validation";
import { regionReadings } from "../../packages/domain/src/region-readings";

import { allowedItem } from "./appellation-exclusions";
import type { TechnicalFileSummaries } from "./extract-technical-file-links";
import { registerCategories, registerGrapes } from "./register-facts";

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
// Alsace's grand crus, placed by their vineyards' coordinates as French
// Wikipedia lists them (`pnpm kb:fetch-grand-crus`).
const grandCrusPath = resolve(cache, "grand-crus.json");
const grandCrus = (
  existsSync(grandCrusPath) ? JSON.parse(readFileSync(grandCrusPath, "utf8")) : {}
) as Record<string, { latitude: number; longitude: number }>;
const geocodedPath = resolve(cache, "geocoded.json");
const geocoded = (
  existsSync(geocodedPath) ? JSON.parse(readFileSync(geocodedPath, "utf8")) : {}
) as Record<string, { latitude: number; longitude: number }>;

// Where nothing else places a name, the NUTS regions the register's
// technical file names for it (`pnpm kb:fetch-appellations`, step 2f): their
// own points, approximate. Regions © EuroGeographics.
const registerAreasPath = resolve(cache, "register-areas.json");
const registerAreas = (
  existsSync(registerAreasPath) ? JSON.parse(readFileSync(registerAreasPath, "utf8")) : {}
) as Record<string, { latitude: number; longitude: number }>;

// Where the register's own text names the places a wine comes from and
// nothing more precise places it, those places, read by hand
// (`appellation-areas.json`, each with its source): the median of their
// points, or the median of the registered names it is made of.
type CuratedArea = {
  parts?: string[];
  places?: { latitude: number; longitude: number; name: string; wikidata: string }[];
  source: string;
};
const curatedAreas = (
  JSON.parse(readFileSync(resolve("data/kb/appellation-areas.json"), "utf8")) as {
    areas: Record<string, CuratedArea>;
  }
).areas;
const medianOf = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
function curatedPoint(id: string) {
  const places = curatedAreas[id]?.places ?? [];
  if (places.length === 0) return null;
  return {
    latitude: medianOf(places.map((place) => place.latitude)),
    longitude: medianOf(places.map((place) => place.longitude)),
    pointSource: places.length === 1 ? ("place" as const) : ("area" as const),
  };
}

function isoDate(value: string | null): string | null {
  const match = value === null ? null : /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match === null || match === undefined ? null : `${match[3]}-${match[2]}-${match[1]}`;
}

/** The library's languages, by their Wikipedia codes. */
const libraryLanguages = new Set(["ca", "de", "en", "es", "fr", "it", "nl", "pt"]);
const entries: RegionEntry[] = [];
/**
 * A lead whose first sentence presents another product: Wikidata links La
 * Mancha's wine to Manchego, whose article mentions the region's wine.
 */
function aboutAnotherProduct(lead: string): boolean {
  const first = lead.split(/(?<=[.!?])\s/)[0] ?? lead;
  return /\b(cheese|queso|formatge|fromage|formaggio|käse|kaas|queijo|olive oil|aceite de oliva|huile d'olive|olio d'oliva)\b/i.test(
    first,
  );
}

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
  // An item excluded by hand since it was fetched stands for nothing here:
  // its names are another thing's, and so is any point it gave.
  const fetched = wikidata[row.appUniqueId] ?? null;
  const linked =
    fetched === null ||
    fetched.qid === null ||
    names.every((name) => allowedItem(name, fetched.qid!))
      ? fetched
      : {
          ...fetched,
          labels: {},
          qid: null,
          ...(fetched.pointSource === "item"
            ? { latitude: null, longitude: null, pointSource: null }
            : {}),
        };
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
    // A lead in the country's own language is an original to translate from,
    // not a summary the library shows.
    if (!libraryLanguages.has(locale)) continue;
    const text = summaryOf(lead);
    if (text === null || !leadIsAboutWine(lead) || aboutAnotherProduct(lead)) continue;
    summaries[locale] = {
      text,
      url: `https://${locale}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
    };
  }
  // The wine's own item's point first; then the register's own places.
  const curated =
    linked?.latitude != null && (linked.pointSource ?? "item") === "item"
      ? null
      : curatedPoint(row.appUniqueId);
  entries.push({
    countryCode: country,
    eambrosiaId: row.appUniqueId,
    giType,
    grapes: [],
    id,
    latitude:
      curated?.latitude ??
      linked?.latitude ??
      grandCrus[matchKey(row.protectedName)]?.latitude ??
      geocoded[row.appUniqueId]?.latitude ??
      registerAreas[row.appUniqueId]?.latitude ??
      null,
    legalUrl: `https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/${row.appUniqueId}`,
    longitude:
      curated?.longitude ??
      linked?.longitude ??
      grandCrus[matchKey(row.protectedName)]?.longitude ??
      geocoded[row.appUniqueId]?.longitude ??
      registerAreas[row.appUniqueId]?.longitude ??
      null,
    pointSource:
      curated !== null
        ? curated.pointSource
        : linked?.latitude != null
          ? (linked.pointSource ?? "item")
          : grandCrus[matchKey(row.protectedName)] !== undefined
            ? "item"
            : geocoded[row.appUniqueId] !== undefined
              ? "place"
              : registerAreas[row.appUniqueId] !== undefined
                ? "area"
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

// Beyond the EU, each country's own register (`pnpm kb:fetch-world-appellations`).
// United States: the American Viticultural Areas of 27 CFR part 9, each
// placed inside its official boundary as UC Davis's AVA project draws it.
const worldPath = resolve(".kb-cache/world/us.json");
const avas = (existsSync(worldPath) ? JSON.parse(readFileSync(worldPath, "utf8")) : []) as {
  labels: Record<string, string>;
  latitude: number | null;
  longitude: number | null;
  name: string;
  pointSource: "boundary" | "item" | null;
  qid: string | null;
  registeredOn: string | null;
  section: string;
  within: string[];
}[];
/** A new id for a name beyond the EU: its country and its name. */
function worldId(country: string, name: string): string {
  const base = `${country}-${slug(name)}`;
  let id = base;
  for (let suffix = 2; seen.has(id); suffix += 1) id = `${base}-${suffix}`;
  seen.add(id);
  return id;
}
/** The Wikipedia leads of a name's item that are about its wine, as summaries. */
function wikipediaSummaries(qid: string | null): {
  leads: number;
  summaries: RegionEntry["summaries"];
} {
  const leadsPath = qid === null ? null : resolve(cache, "leads", `${qid}.json`);
  const leads =
    leadsPath !== null && existsSync(leadsPath)
      ? (JSON.parse(readFileSync(leadsPath, "utf8")) as Record<
          string,
          { lead: string; title: string }
        >)
      : {};
  const summaries: RegionEntry["summaries"] = {};
  for (const [locale, { lead, title }] of Object.entries(leads)) {
    if (!libraryLanguages.has(locale)) continue;
    const text = summaryOf(lead);
    if (text === null || !leadIsAboutWine(lead)) continue;
    summaries[locale] = {
      text,
      url: `https://${locale}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
    };
  }
  return { leads: Object.keys(leads).length, summaries };
}

const avaIds = new Map<string, string>();
for (const ava of avas) {
  const id = worldId("us", ava.name);
  avaIds.set(matchKey(ava.name), id);
  const { leads, summaries } = wikipediaSummaries(ava.qid);
  entries.push({
    countryCode: "US",
    eambrosiaId: null,
    giType: "AVA",
    grapes: [],
    id,
    latitude: ava.latitude,
    legalUrl: `https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-9/subpart-C/section-${ava.section}`,
    longitude: ava.longitude,
    name: ava.name,
    names: [
      { locale: "*", name: ava.name, source: "register" as const },
      ...Object.entries(ava.labels).map(([locale, name]) => ({
        locale,
        name,
        source: "wikidata" as const,
      })),
    ],
    pointSource: ava.pointSource,
    prominence: leads,
    registerRef: `27 CFR ${ava.section}`,
    registeredOn: ava.registeredOn,
    summaries,
    wikidataId: ava.qid,
  });
}
// The AVAs each lies within, as UC Davis records them, the nearest first: the
// one that itself lies within the most others.
const avaEntries = new Map(
  entries.filter((entry) => entry.giType === "AVA").map((entry) => [entry.id, entry]),
);
avas.forEach((ava) => {
  const entry = avaEntries.get(avaIds.get(matchKey(ava.name))!)!;
  const holders = ava.within
    .map((name) => avaIds.get(matchKey(name)))
    .filter((id): id is string => id !== undefined && id !== entry.id);
  if (holders.length > 0) entry.within = [...new Set(holders)];
});
const depth = (id: string) =>
  avas.find((ava) => avaIds.get(matchKey(ava.name)) === id)?.within.length ?? 0;
for (const entry of avaEntries.values()) {
  entry.within?.sort((left, right) => depth(right) - depth(left));
}
console.info(`  ${avas.length} American Viticultural Areas from 27 CFR part 9.`);

// New Zealand: the geographical indications registered for wine, from
// IPONZ's register (facts only), with their articles where Wikipedia has one
// on their wine; points are approximate, the place each name is.
const nzPath = resolve(".kb-cache/world/nz.json");
const nzNames = (existsSync(nzPath) ? JSON.parse(readFileSync(nzPath, "utf8")) : []) as {
  ipNumber: string;
  latitude: number | null;
  longitude: number | null;
  names: string[];
  qid: string | null;
  registeredOn: string | null;
  url: string;
}[];
for (const gi of nzNames) {
  const { leads, summaries } = wikipediaSummaries(gi.qid);
  entries.push({
    countryCode: "NZ",
    eambrosiaId: null,
    giType: "GI",
    grapes: [],
    id: worldId("nz", gi.names[0]!),
    latitude: gi.latitude,
    legalUrl: gi.url,
    longitude: gi.longitude,
    name: gi.names[0]!,
    names: gi.names.map((name) => ({ locale: "*", name, source: "register" as const })),
    pointSource: gi.latitude === null ? null : "place",
    prominence: leads,
    registerRef: gi.ipNumber,
    registeredOn: gi.registeredOn,
    summaries,
    wikidataId: gi.qid,
  });
}
console.info(`  ${nzNames.length} New Zealand geographical indications from IPONZ's register.`);

// South Africa: the production areas of the Wine of Origin scheme, each with
// the areas it lies in. One without a point of its own is placed at the
// middle of the areas inside it, or else at the area it lies in —
// approximately, as the page says; never at a whole province's.
const zaPath = resolve(".kb-cache/world/za.json");
const zaList = (
  existsSync(zaPath) ? JSON.parse(readFileSync(zaPath, "utf8")) : { records: [], sourceUrl: "" }
) as {
  records: {
    latitude: number | null;
    level: RegisterLevel;
    longitude: number | null;
    names: string[];
    qid: string | null;
    within: string[];
  }[];
  sourceUrl: string;
};
const zaIds = new Map<string, string>();
const zaEntries: RegionEntry[] = [];
for (const area of zaList.records) {
  const id = worldId("za", area.names[0]!);
  zaIds.set(area.names[0]!, id);
  const { leads, summaries } = wikipediaSummaries(area.qid);
  zaEntries.push({
    countryCode: "ZA",
    eambrosiaId: null,
    giType: "WO",
    grapes: [],
    id,
    latitude: area.latitude,
    legalUrl: zaList.sourceUrl,
    longitude: area.longitude,
    name: area.names[0]!,
    names: area.names.map((name) => ({ locale: "*", name, source: "register" as const })),
    pointSource: area.latitude === null ? null : "place",
    prominence: leads,
    registerLevel: area.level,
    registeredOn: null,
    summaries,
    wikidataId: area.qid,
  });
}
zaList.records.forEach((area, index) => {
  const within = area.within.map((name) => zaIds.get(name)!).filter(Boolean);
  if (within.length > 0) zaEntries[index]!.within = within;
});
// The largest last: a region's middle is that of its districts' and wards'.
for (const entry of [...zaEntries].sort(
  (left, right) =>
    registerLevels.indexOf(right.registerLevel!) - registerLevels.indexOf(left.registerLevel!),
)) {
  if (entry.latitude !== null || ["unit", "overarchingUnit"].includes(entry.registerLevel!))
    continue;
  const inside = zaEntries.filter(
    (other) =>
      other.within?.includes(entry.id) === true &&
      other.latitude !== null &&
      other.pointSource === "place",
  );
  if (inside.length === 0) continue;
  entry.latitude = medianOf(inside.map((other) => other.latitude!));
  entry.longitude = medianOf(inside.map((other) => other.longitude!));
  entry.pointSource = "area";
}
for (const entry of zaEntries) {
  if (entry.latitude !== null) continue;
  const holder = (entry.within ?? [])
    .map((id) => zaEntries.find((other) => other.id === id)!)
    .find(
      (other) =>
        other.latitude !== null && !["unit", "overarchingUnit"].includes(other.registerLevel!),
    );
  if (holder === undefined) continue;
  entry.latitude = holder.latitude;
  entry.longitude = holder.longitude;
  entry.pointSource = "area";
}
entries.push(...zaEntries);

// Chile: the viticultural zoning of Decree 464 of 1994, each placed at the
// middle of the communes or provinces that define it; a region the decree
// draws only through its subregions, at the middle of theirs.
const clPath = resolve(".kb-cache/world/cl.json");
const clList = (
  existsSync(clPath) ? JSON.parse(readFileSync(clPath, "utf8")) : { records: [], sourceUrl: "" }
) as {
  records: {
    labels: Record<string, string>;
    latitude: number | null;
    level: RegisterLevel;
    longitude: number | null;
    names: string[];
    qid: string | null;
    within: string[];
  }[];
  sourceUrl: string;
};
const clIds = new Map<string, string>();
const clEntries: RegionEntry[] = clList.records.map((area) => {
  const id = worldId("cl", area.names[0]!);
  clIds.set(area.names[0]!, id);
  const { leads, summaries } = wikipediaSummaries(area.qid);
  return {
    countryCode: "CL",
    eambrosiaId: null,
    giType: "DO" as const,
    grapes: [],
    id,
    latitude: area.latitude,
    legalUrl: clList.sourceUrl,
    longitude: area.longitude,
    name: area.names[0]!,
    names: [
      ...area.names.map((name) => ({ locale: "*", name, source: "register" as const })),
      // Wikidata's, where they are not the decree's: "Colchagua Valley".
      ...Object.entries(area.labels)
        .filter(([, name]) => !area.names.some((own) => matchKey(own) === matchKey(name)))
        .map(([locale, name]) => ({ locale, name, source: "wikidata" as const })),
    ],
    pointSource: area.latitude === null ? null : ("area" as const),
    prominence: leads,
    registerLevel: area.level,
    registeredOn: null,
    summaries,
    wikidataId: area.qid,
  };
});
clList.records.forEach((area, index) => {
  const within = area.within.map((name) => clIds.get(name)).filter((id) => id !== undefined);
  if (within.length > 0) clEntries[index]!.within = within;
});
const ownPoint = new Set(
  clEntries.filter((entry) => entry.latitude !== null).map((entry) => entry.id),
);
for (const entry of clEntries) {
  if (entry.latitude !== null) continue;
  const inside = clEntries.filter(
    (other) => other.within?.includes(entry.id) === true && ownPoint.has(other.id),
  );
  if (inside.length === 0) continue;
  entry.latitude = medianOf(inside.map((other) => other.latitude!));
  entry.longitude = medianOf(inside.map((other) => other.longitude!));
  entry.pointSource = "area";
}
for (const entry of clEntries) {
  if (entry.latitude !== null) continue;
  const holder = (entry.within ?? [])
    .map((id) => clEntries.find((other) => other.id === id)!)
    .find((other) => other.latitude !== null);
  if (holder === undefined) continue;
  entry.latitude = holder.latitude;
  entry.longitude = holder.longitude;
  entry.pointSource = "area";
}
entries.push(...clEntries);

// Argentina: the indications the INV has recognised, each placed where its
// place or department is; one the map cannot find, at the middle of those it
// holds or else at the one it lies in — approximately.
const arPath = resolve(".kb-cache/world/ar.json");
const arList = (
  existsSync(arPath) ? JSON.parse(readFileSync(arPath, "utf8")) : { records: [], sourceUrl: "" }
) as {
  records: {
    englishNames: string[];
    key: string;
    latitude: number | null;
    longitude: number | null;
    names: string[];
    qid: string | null;
    recognisedOn: string | null;
    resolutions: string[];
    type: "DOC" | "IG";
    within: string[];
  }[];
  sourceUrl: string;
};
const arEntries: RegionEntry[] = arList.records.map((area) => {
  const { leads, summaries } = wikipediaSummaries(area.qid);
  return {
    countryCode: "AR",
    eambrosiaId: null,
    giType: area.type,
    grapes: [],
    id: `ar-${area.key}`,
    latitude: area.latitude,
    legalUrl: arList.sourceUrl,
    longitude: area.longitude,
    name: area.names[0]!,
    names: [
      ...area.names.map((name) => ({ locale: "*", name, source: "register" as const })),
      // The English names the INV's list itself gives: "Uco Valley".
      ...area.englishNames.map((name) => ({ locale: "en", name, source: "register" as const })),
    ],
    pointSource: area.latitude === null ? null : ("place" as const),
    prominence: leads,
    registerRef: area.resolutions.join("; "),
    registeredOn: area.recognisedOn,
    summaries,
    wikidataId: area.qid,
    ...(area.within.length === 0 ? {} : { within: area.within.map((key) => `ar-${key}`) }),
  };
});
for (const entry of arEntries) seen.add(entry.id);
const arOwn = new Set(
  arEntries.filter((entry) => entry.latitude !== null).map((entry) => entry.id),
);
for (const entry of arEntries) {
  if (entry.latitude !== null) continue;
  const inside = arEntries.filter(
    (other) => other.within?.includes(entry.id) === true && arOwn.has(other.id),
  );
  if (inside.length === 0) continue;
  entry.latitude = medianOf(inside.map((other) => other.latitude!));
  entry.longitude = medianOf(inside.map((other) => other.longitude!));
  entry.pointSource = "area";
}
for (const entry of arEntries) {
  if (entry.latitude !== null) continue;
  const holder = (entry.within ?? [])
    .map((id) => arEntries.find((other) => other.id === id)!)
    .find((other) => other.latitude !== null);
  if (holder === undefined) continue;
  entry.latitude = holder.latitude;
  entry.longitude = holder.longitude;
  entry.pointSource = "area";
}
entries.push(...arEntries);
console.info(
  `  ${arEntries.length} Argentine indications from the INV, ` +
    `${arEntries.filter((entry) => entry.latitude !== null).length} placed.`,
);

// The United Kingdom: its own wine names in its register of protected food
// and drink names.
const gbPath = resolve(".kb-cache/world/gb.json");
const gbList = (existsSync(gbPath) ? JSON.parse(readFileSync(gbPath, "utf8")) : []) as {
  designation: "PDO" | "PGI";
  latitude: number | null;
  longitude: number | null;
  name: string;
  qid: string | null;
  registeredOn: string | null;
  url: string;
}[];
for (const name of gbList) {
  const { leads, summaries } = wikipediaSummaries(name.qid);
  entries.push({
    countryCode: "GB",
    eambrosiaId: null,
    giType: name.designation,
    grapes: [],
    id: worldId("gb", name.name),
    latitude: name.latitude,
    legalUrl: name.url,
    longitude: name.longitude,
    name: name.name,
    names: [{ locale: "*", name: name.name, source: "register" as const }],
    pointSource: name.latitude === null ? null : "place",
    prominence: leads,
    registeredOn: name.registeredOn,
    summaries,
    wikidataId: name.qid,
  });
}
console.info(`  ${gbList.length} British wine names from the UK register.`);

// Mexico: the IMPI's declarations of protection for wine, each placed where
// the state its zone is.
const mxPath = resolve(".kb-cache/world/mx.json");
const mxList = (
  existsSync(mxPath) ? JSON.parse(readFileSync(mxPath, "utf8")) : { records: [], sourceUrl: "" }
) as {
  records: {
    declaredOn: string;
    key: string;
    latitude: number | null;
    longitude: number | null;
    names: string[];
    qid: string | null;
    reference: string;
    type: "PGI";
  }[];
  sourceUrl: string;
};
for (const area of mxList.records) {
  const { leads, summaries } = wikipediaSummaries(area.qid);
  seen.add(`mx-${area.key}`);
  entries.push({
    countryCode: "MX",
    eambrosiaId: null,
    giType: area.type,
    grapes: [],
    id: `mx-${area.key}`,
    latitude: area.latitude,
    legalUrl: mxList.sourceUrl,
    longitude: area.longitude,
    name: area.names[0]!,
    names: area.names.map((name) => ({ locale: "*", name, source: "register" as const })),
    pointSource: area.latitude === null ? null : "place",
    prominence: leads,
    registerRef: area.reference,
    registeredOn: area.declaredOn,
    summaries,
    wikidataId: area.qid,
  });
}
console.info(`  ${mxList.records.length} Mexican indications from the IMPI.`);

// Brazil: the INPI's indications of provenance and denominations of origin
// for wine, each placed where its place is, or amid its municipalities.
const brPath = resolve(".kb-cache/world/br.json");
const brList = (existsSync(brPath) ? JSON.parse(readFileSync(brPath, "utf8")) : []) as {
  amendedOn: string | null;
  key: string;
  latitude: number | null;
  longitude: number | null;
  names: string[];
  number: string;
  pointSource: "area" | "place" | null;
  qid: string | null;
  registeredOn: string;
  type: "DO" | "IP";
  url: string;
}[];
for (const area of brList) {
  const { leads, summaries } = wikipediaSummaries(area.qid);
  seen.add(`br-${area.key}`);
  entries.push({
    countryCode: "BR",
    eambrosiaId: null,
    giType: area.type,
    grapes: [],
    id: `br-${area.key}`,
    latitude: area.latitude,
    legalUrl: area.url,
    longitude: area.longitude,
    name: area.names[0]!,
    names: area.names.map((name) => ({ locale: "*", name, source: "register" as const })),
    pointSource: area.pointSource,
    prominence: leads,
    registerRef: area.number,
    registeredOn: area.registeredOn,
    summaries,
    wikidataId: area.qid,
  });
}
console.info(`  ${brList.length} Brazilian indications from the INPI.`);

// The registers transcribed by hand, one file a country (`data/kb/registers/`,
// fetched by `pnpm kb:fetch-registers`): each name placed where its place is,
// or amid the places its delimitation names, or else at the area it lies in.
const registersCache = resolve(".kb-cache/world/registers");
for (const file of existsSync(registersCache) ? readdirSync(registersCache).sort() : []) {
  const register = JSON.parse(readFileSync(resolve(registersCache, file), "utf8")) as {
    countryCode: string;
    nameSource?: "article" | "register";
    records: {
      key: string;
      latitude: number | null;
      level: RegisterLevel | null;
      longitude: number | null;
      names: string[];
      pointSource: "area" | "item" | "place" | null;
      qid: string | null;
      ref: string | null;
      registeredOn: string | null;
      summary?: { locale: string; text: string; url: string } | null;
      type: RegionEntry["giType"];
      url: string;
      within: string[];
    }[];
  };
  const prefix = register.countryCode.toLowerCase();
  const registered: RegionEntry[] = register.records.map((area) => {
    const { leads, summaries } = wikipediaSummaries(area.qid);
    // A region no register holds is described by the sentence that names it,
    // until an article of its own does.
    if (Object.keys(summaries).length === 0 && area.summary != null) {
      summaries[area.summary.locale] = { text: area.summary.text, url: area.summary.url };
    }
    seen.add(`${prefix}-${area.key}`);
    return {
      countryCode: register.countryCode,
      eambrosiaId: null,
      giType: area.type,
      grapes: [],
      id: `${prefix}-${area.key}`,
      latitude: area.latitude,
      legalUrl: area.url,
      longitude: area.longitude,
      name: area.names[0]!,
      names: area.names.map((name) => ({
        locale: "*",
        name,
        source: register.nameSource ?? "register",
      })),
      pointSource: area.pointSource,
      prominence: leads,
      ...(area.ref === null ? {} : { registerRef: area.ref }),
      ...(area.level === null ? {} : { registerLevel: area.level }),
      registeredOn: area.registeredOn,
      summaries,
      wikidataId: area.qid,
      ...(area.within.length === 0 ? {} : { within: area.within.map((key) => `${prefix}-${key}`) }),
    };
  });
  // One the map cannot find stands, approximately, amid the areas it holds
  // that have a point, or else at the area it lies in.
  const own = new Set(
    registered.filter((entry) => entry.latitude !== null).map((entry) => entry.id),
  );
  for (const entry of registered) {
    if (entry.latitude !== null) continue;
    const inside = registered.filter(
      (other) => other.within?.includes(entry.id) === true && own.has(other.id),
    );
    if (inside.length === 0) continue;
    entry.latitude = medianOf(inside.map((other) => other.latitude!));
    entry.longitude = medianOf(inside.map((other) => other.longitude!));
    entry.pointSource = "area";
  }
  for (const entry of registered) {
    if (entry.latitude !== null) continue;
    const holder = (entry.within ?? [])
      .map((id) => registered.find((other) => other.id === id))
      .find((other) => other !== undefined && other.latitude !== null);
    if (holder === undefined) continue;
    entry.latitude = holder.latitude;
    entry.longitude = holder.longitude;
    entry.pointSource = "area";
  }
  entries.push(...registered);
  console.info(
    `  ${registered.length} names of ${register.countryCode} from its transcribed register, ` +
      `${registered.filter((entry) => entry.latitude !== null).length} placed.`,
  );
}
console.info(
  `  ${clEntries.length} Chilean denominations of origin from Decree 464, ` +
    `${clEntries.filter((entry) => entry.latitude !== null).length} placed.`,
);

// Australia: the Register of Protected Names' geographical indications, each
// placed inside its official boundary (Wine Australia's open data) where it
// has one of its own, and nested as the register lists them.
const auPath = resolve(".kb-cache/world/au.json");
const auList = (existsSync(auPath) ? JSON.parse(readFileSync(auPath, "utf8")) : []) as {
  giNumber: string | null;
  latitude: number | null;
  level: RegisterLevel;
  longitude: number | null;
  name: string;
  pointSource: "area" | "boundary" | "place" | null;
  qid: string | null;
  registeredOn: string | null;
  url: string;
  within: string[];
}[];
const auIds = new Map<string, string>();
const auEntries: RegionEntry[] = auList.map((gi) => {
  const id = worldId("au", gi.name);
  auIds.set(gi.name, id);
  const { leads, summaries } = wikipediaSummaries(gi.qid);
  return {
    countryCode: "AU",
    eambrosiaId: null,
    giType: "GI" as const,
    grapes: [],
    id,
    latitude: gi.latitude,
    legalUrl: gi.url,
    longitude: gi.longitude,
    name: gi.name,
    names: [{ locale: "*", name: gi.name, source: "register" as const }],
    pointSource: gi.pointSource,
    prominence: leads,
    ...(gi.giNumber === null ? {} : { registerRef: gi.giNumber }),
    registerLevel: gi.level,
    registeredOn: gi.registeredOn,
    summaries,
    wikidataId: gi.qid,
  };
});
auList.forEach((gi, index) => {
  const within = gi.within.map((name) => auIds.get(name)).filter((id) => id !== undefined);
  if (within.length > 0) auEntries[index]!.within = within;
});
entries.push(...auEntries);
console.info(
  `  ${auEntries.length} Australian geographical indications from Wine Australia's register.`,
);
console.info(
  `  ${zaEntries.length} Wine of Origin production areas, ` +
    `${zaEntries.filter((entry) => entry.latitude !== null).length} placed.`,
);

// Grapes, by their own articles: a grape's region that is a registered name
// in the same country links the two, with the grape's quoted sentence.
const byName = new Map<string, RegionEntry>();
for (const entry of entries) {
  for (const { name } of entry.names) byName.set(`${entry.countryCode}:${normalize(name)}`, entry);
}
let links = 0;
for (const grape of grapes) {
  for (const region of grape.regions) {
    // "Maipo Valley" as Chile's decree writes it, "Valle del Maipo".
    const entry = [normalize(region.name), ...regionReadings(normalize(region.name))]
      .map((form) => byName.get(`${region.country}:${form}`))
      .find((found) => found !== undefined);
    if (entry === undefined || entry.grapes.some((link) => link.grapeId === grape.id)) continue;
    const evidence = grape.evidence.find(
      (item) => item.field === "regions" && normalize(item.value).includes(normalize(region.name)),
    );
    if (evidence === undefined) continue;
    entry.grapes.push({
      grapeId: grape.id,
      quote: evidence.quote,
      // The article the quote is in: a grape read in its own language too
      // names its regions in that article's words.
      sourceUrl: evidence.sourceUrl ?? grape.wikipediaUrl,
    });
    links += 1;
  }
}

// Names no article of their own describes may be described in their
// country's wine article (`pnpm kb:fetch-country-wine`): the sentences that
// name one, about wine, and not a list of names, become its summary.
const countryPath = resolve(cache, "country-wine.json");
const countryArticles = (
  existsSync(countryPath) ? JSON.parse(readFileSync(countryPath, "utf8")) : {}
) as Record<string, { text: string; title: string; url: string }[]>;
/** A name as it is spelled in prose, doubled letters collapsed ("Naousa" = "Naoussa"). */
const spelling = (text: string) => matchKey(text).replace(/(.)\1/g, "$1");
let described = 0;
for (const entry of entries) {
  if (Object.keys(entry.summaries).length > 0) continue;
  // Only where the name's own articles leave almost nothing: elsewhere the
  // country article's sentences add more noise than description.
  if (!["BG", "CY", "GR", "HR", "RO", "SI", "SK"].includes(entry.countryCode)) continue;
  const articles = countryArticles[entry.countryCode] ?? [];
  if (articles.length === 0) continue;
  const keys = [
    ...new Set(
      entry.names
        .flatMap((name) => [name.name, transliterate(name.name)])
        .map(spelling)
        .filter((key) => key.length >= 4 && /^[a-z0-9 ]+$/.test(key)),
    ),
  ];
  if (keys.length === 0) continue;
  for (const article of articles) {
    const sentences = article.text
      // Section headings ("== Wine regions ==") are not prose.
      .split("\n")
      .filter((line) => !/^=+.*=+$/.test(line.trim()))
      .join(" ")
      .split(/(?<=[a-z0-9)][.!?])\s+(?=[A-Z])/)
      .filter((sentence) => {
        const padded = ` ${spelling(sentence)} `;
        return (
          keys.some((key) => padded.includes(` ${key} `)) &&
          sentence.length >= 60 &&
          sentence.length <= 420 &&
          (sentence.match(/,/g) ?? []).length <= 3 &&
          // Not history, statistics or a table: no figures — urns from 700 BC,
          // hectares, alcohol by volume — and no columns of names.
          !/\d/.test(sentence) &&
          !/\s{3,}/.test(sentence) &&
          !/\b(BC|AD|centur(y|ies))\b/.test(sentence) &&
          // A whole sentence that stands on its own: not a fragment, and not
          // one whose subject ("The grape", "It") is in the sentence before.
          /^[A-Z]/.test(sentence) &&
          !/\.\s+[a-z]/.test(sentence) &&
          !/^(The grape|The variety|It|This|These|They)\b/.test(sentence) &&
          // And it says something of the wine itself.
          /\b(grapes?|variet(y|ies|al)|red|white|ros[ée]|sweet|dessert|dry|acid\w*|aroma\w*|bodied|soils?|volcanic|terroir|blend\w*|fruit\w*|spic\w*|tannin\w*)\b/i.test(
            sentence,
          )
        );
      })
      // One sentence: two from different paragraphs read as one account and
      // mixed up Santorini's grapes.
      .slice(0, 1);
    if (sentences.length === 0) continue;
    entry.summaries.en = { text: sentences.join(" "), url: article.url };
    described += 1;
    break;
  }
}
console.info(`  ${described} names described by a sentence of their country's wine article.`);

// A registered name the register describes as several others ("Istočna
// kontinentalna Hrvatska consists of two subregions: Hrvatsko Podunavlje and
// Slavonija"): the median of their points, approximate.
for (const entry of entries) {
  const parts = curatedAreas[entry.eambrosiaId ?? entry.id]?.parts;
  if (parts === undefined || entry.pointSource === "item") continue;
  const points = entries.filter(
    (other) =>
      other.eambrosiaId !== null && parts.includes(other.eambrosiaId) && other.latitude !== null,
  );
  if (points.length === 0) continue;
  entry.latitude = medianOf(points.map((other) => other.latitude!));
  entry.longitude = medianOf(points.map((other) => other.longitude!));
  entry.pointSource = "area";
}

// Texts read and found to be about something else, by hand: Friuli
// Isonzo's English article redirects to Friuli wine in general, La Clape's
// articles are those of the former Coteaux du Languedoc AOC, and the English
// leads for Terre Tollesi and Abruzzo call the DOCs grapes.
const notTheirSummary: Record<string, string[] | "all"> = {
  EUGI00000002983: ["en"],
  EUGI00000002941: ["en"],
  EUGI00000006448: ["en"],
  EUGI00000014387: "all",
  // Bairrada's Portuguese article describes the natural sub-region — its
  // municipalities and province — and not its wine.
  EUGI00000004201: ["pt"],
  // Blaye's French article is that of Blaye Côtes de Bordeaux, another name.
  EUGI00000001983: ["fr"],
};
for (const entry of entries) {
  const dropped = notTheirSummary[entry.eambrosiaId ?? entry.id];
  if (dropped === "all") entry.summaries = {};
  else for (const locale of dropped ?? []) delete entry.summaries[locale];
}

// A text several registered names lead to belongs to the one it is about:
// Beaune's is not Chorey-lès-Beaune's, nor Bordeaux's Sainte-Foy-Bordeaux's.
// Titles cannot tell — Wikipedia follows redirects, and "Lessona (wine)"
// answers with the article on Piedmont wine — so the text itself must name
// the registered name in full. A shared text that names none of them stays
// with none; each keeps its point on the map, and its other languages.
const sharing = new Map<string, RegionEntry[]>();
for (const entry of entries) {
  for (const summary of Object.values(entry.summaries)) {
    sharing.set(summary.text, [...new Set([...(sharing.get(summary.text) ?? []), entry])]);
  }
}
let unshared = 0;
for (const [text, holders] of sharing) {
  if (holders.length < 2) continue;
  const body = ` ${matchKey(transliterate(text))} `;
  for (const entry of holders) {
    // Any of its registered names ("Alto Adige", "Südtirol"), but not the
    // pieces the register's hyphenated names are split into: "Beaune" is in
    // "Chorey-lès-Beaune" and says nothing of it.
    const pieces = new Set(entry.name.split("-").map((piece) => matchKey(piece)));
    const own = entry.names
      .filter((name) => name.source === "register")
      .map((name) => matchKey(transliterate(name.name)))
      .filter((key) => key.length > 2 && (key === matchKey(entry.name) || !pieces.has(key)));
    if (own.some((key) => body.includes(` ${key} `))) continue;
    for (const [locale, summary] of Object.entries(entry.summaries)) {
      if (summary.text === text) delete entry.summaries[locale];
    }
    unshared += 1;
  }
}
console.info(`  ${unshared} summaries dropped: the text belongs to another registered name.`);

const registerAttachments =
  "https://ec.europa.eu/geographical-indications-register/eambrosia-public-api/api/v1/attachments/";

// Where Wikipedia explains a registered name in some of the app's languages
// and not others, a faithful translation of its lead fills the others,
// marked as such (`data/kb/appellation-translations.json`, by register id).
const translations = (
  JSON.parse(readFileSync(resolve("data/kb/appellation-translations.json"), "utf8")) as {
    regions: Record<string, { from: string; sourceUrl: string; texts: Record<string, string> }>;
  }
).regions;
let translated = 0;
for (const entry of entries) {
  const translation = translations[entry.eambrosiaId ?? entry.id];
  if (translation === undefined) continue;
  for (const [locale, text] of Object.entries(translation.texts)) {
    const key = locale === "pt-PT" ? "pt" : locale;
    if (entry.summaries[key] !== undefined) continue;
    entry.summaries[key] = {
      text,
      translated: true,
      url: translation.sourceUrl,
      // A translation of the register's own text is reused as the Union's is.
      ...(translation.sourceUrl.startsWith(registerAttachments)
        ? { license: "EC-reuse-2011-833" }
        : {}),
    };
    translated += 1;
  }
}
console.info(`  ${translated} summaries translated from another language's article or document.`);

// A name no article describes takes the opening of its link with the
// geographical area, from its single document as the Official Journal
// publishes it — in each language the Union translated it into
// (`pnpm kb:fetch-register-links`). Never over an article's summary.
const journalSummariesPath = resolve("data/kb/register-summaries.json");
const journalSummaries = existsSync(journalSummariesPath)
  ? (JSON.parse(readFileSync(journalSummariesPath, "utf8")) as Record<
      string,
      { summaries: Record<string, { text: string; url: string }> }
    >)
  : {};
let fromJournal = 0;
for (const entry of entries) {
  const journal = journalSummaries[entry.eambrosiaId ?? entry.id];
  if (journal === undefined || Object.keys(entry.summaries).length > 0) continue;
  for (const [locale, summary] of Object.entries(journal.summaries)) {
    const key = locale === "pt-PT" ? "pt" : locale;
    entry.summaries[key] = { ...summary, license: "EC-reuse-2011-833" };
  }
  fromJournal += 1;
}
console.info(`  ${fromJournal} names described from the Official Journal's single document.`);

// The Journal publishes no Catalan, and now and then leaves out another of
// the app's languages: a faithful translation of one it does publish fills
// it, marked as such (`data/kb/journal-translations.json`, by register id) —
// only while that text is still the one shown.
const journalTranslations = (
  JSON.parse(readFileSync(resolve("data/kb/journal-translations.json"), "utf8")) as {
    regions: Record<
      string,
      { from: string; original: string; sourceUrl: string; texts: Record<string, string> }
    >;
  }
).regions;
let journalTranslated = 0;
for (const entry of entries) {
  const translation = journalTranslations[entry.eambrosiaId ?? entry.id];
  if (translation === undefined) continue;
  const from = entry.summaries[translation.from === "pt-PT" ? "pt" : translation.from];
  if (from?.text !== translation.original || from.license !== "EC-reuse-2011-833") continue;
  for (const [locale, text] of Object.entries(translation.texts)) {
    const key = locale === "pt-PT" ? "pt" : locale;
    if (entry.summaries[key] !== undefined) continue;
    entry.summaries[key] = {
      license: "EC-reuse-2011-833",
      text,
      translated: true,
      url: translation.sourceUrl,
    };
    journalTranslated += 1;
  }
}
console.info(`  ${journalTranslated} summaries translated from the Journal's own text.`);

// A name neither an article nor the Journal describes takes the opening of
// its link from its technical file in the register, in the language it was
// filed in (`pnpm kb:extract-technical-file-links`). Its translations into
// the app's languages, made from that text, are among the translations above.
const technicalFiles = JSON.parse(
  readFileSync(resolve("data/kb/technical-file-summaries.json"), "utf8"),
) as TechnicalFileSummaries;
let fromTechnicalFile = 0;
for (const entry of entries) {
  const file = technicalFiles[entry.eambrosiaId ?? entry.id];
  if (file === undefined) continue;
  if (Object.values(entry.summaries).some((summary) => summary.license === undefined)) continue;
  entry.summaries[file.language] ??= {
    license: "EC-reuse-2011-833",
    text: file.text,
    url: file.url,
  };
  fromTechnicalFile += 1;
}
console.info(`  ${fromTechnicalFile} names described from their technical file in the register.`);

// What the register's single document says of each name's wines: the
// categories of product it covers and its main grape varieties, read from
// the technical file or, where the register holds none, from the Official
// Journal (`pnpm kb:fetch-register-documents`).
//
// A variety is linked to a library grape only where that is safe: by the
// grape's own name in one of the library's languages, or by a synonym its
// article or Wikidata lists — and then not when the synonym is a family name
// ("Malvasia", "Schiava": a lone one names no single variety), not when the
// colour in the name contradicts the grape's ("Sauvignon Gris" is not
// Sauvignon blanc, "Greco Nero" not Greco), not when the grape itself is
// listed in the same document under its own name (then the synonym is a
// different variety there), and not for the few synonyms below that the
// register uses for a variety of their own. An unlinked variety is shown as
// the register writes it; nothing is lost but the link.
const registerFolder = resolve(cache, "register");
const notTheSameVariety = new Set(
  [
    // Varieties of their own that share a synonym with a library grape.
    "Aglianicone",
    "Biancame",
    "Bonarda",
    "Camarate",
    "Lacrima",
    "Listán",
    "Listrão",
    "Mollar Cano",
    "Moreto",
    "Rossese",
    "Rossese Bianco",
    "Saint-Macaire",
    "Schiava Gentile",
    "Trebbiano Giallo",
    // Colour mutations the register lists apart from the grape.
    "Piquepoul Noir",
    // Synonyms the sources give that the variety's own literature disputes.
    "Castellana Negra",
    "Espadeiro",
    "Guarnaccia",
    "Mavroudi",
    "Padeiro",
    "Perrum",
    "Précoce Noir",
  ].map((name) => matchKey(name)),
);
const grapeById = new Map(grapes.map((grape) => [grape.id, grape]));
const primaryName = new Map<string, string | null>();
const synonymName = new Map<string, string | null>();
for (const grape of grapes) {
  const add = (target: Map<string, string | null>, name: string) => {
    const key = matchKey(name);
    if (key.length < 3) return;
    const known = target.get(key);
    target.set(key, known === undefined || known === grape.id ? grape.id : null);
  };
  for (const name of Object.values(grape.names)) add(primaryName, name);
  for (const synonym of grape.synonyms) add(synonymName, synonym.name);
}
const allVarieties = new Set<string>();
const colourWords = {
  grey: /\b(gris|grigio|grigia|grauer|grau|sivi|rose|rosa|roz)\b/,
  red: /\b(noir|nero|nera|negro|negra|tinto|tinta|rouge|rosso|rossa|rot|roter|blauer|crni|negru|mavro|preto|cerna|modry)\b/,
  white:
    /\b(blanc|blanche|bianco|bianca|blanco|blanca|branco|weisser|weiss|bijeli|alb|beli|bila|giallo|gialla)\b/,
};
function colourAgrees(name: string, grapeId: string): boolean {
  const colour = grapeById.get(grapeId)?.color ?? null;
  const key = matchKey(name);
  if (colour === null) return true;
  if (colourWords.red.test(key) && colour === "white") return false;
  if (colourWords.white.test(key) && colour !== "white") return false;
  // "Grauer Burgunder" is Pinot gris, which the sources call white; "Sauvignon
  // Gris" is not Sauvignon blanc. A grey name needs a grey grape or one whose
  // own names say grey.
  const greyNamed = Object.values(grapeById.get(grapeId)?.names ?? {}).some((own) =>
    colourWords.grey.test(matchKey(own)),
  );
  if (colourWords.grey.test(key) && colour !== "pink" && !greyNamed) return false;
  return true;
}
function linkVariety(name: string, listed: Set<string>, families: Set<string>): string | null {
  const key = matchKey(name);
  const primary = primaryName.get(key);
  if (primary) return primary;
  const synonym = synonymName.get(key);
  if (!synonym) return null;
  if (families.has(key) || notTheSameVariety.has(key)) return null;
  if (!colourAgrees(name, synonym) || listed.has(synonym)) return null;
  return synonym;
}
const documents = new Map<string, { text: string; url: string }>();
for (const entry of entries.filter(inEuRegister)) {
  const recordPath = resolve(registerFolder, `${entry.eambrosiaId}.json`);
  if (!existsSync(recordPath)) continue;
  const record = JSON.parse(readFileSync(recordPath, "utf8")) as {
    singleDocTechFile?: { uri: string }[] | null;
  };
  const document = record.singleDocTechFile?.[0]?.uri;
  const technicalFile = document === undefined ? null : resolve(registerFolder, `${document}.txt`);
  const journal = resolve(registerFolder, `oj-${entry.eambrosiaId}.txt`);
  if (technicalFile !== null && existsSync(technicalFile)) {
    documents.set(entry.eambrosiaId, {
      text: readFileSync(technicalFile, "utf8"),
      url: `https://ec.europa.eu/geographical-indications-register/eambrosia-public-api/api/v1/attachments/${document}`,
    });
  } else if (existsSync(journal)) {
    documents.set(entry.eambrosiaId, {
      text: readFileSync(journal, "utf8"),
      url: readFileSync(resolve(registerFolder, `oj-${entry.eambrosiaId}.url`), "utf8").trim(),
    });
  }
}
const varietiesOf = new Map<string, string[]>();
for (const [id, document] of documents) {
  const names = registerGrapes(document.text);
  varietiesOf.set(id, names);
  for (const name of names) allVarieties.add(matchKey(name));
}
// A word that opens three or more of the register's variety names is a family.
const openings = new Map<string, number>();
for (const key of allVarieties) {
  const words = key.split(" ");
  if (words.length > 1) openings.set(words[0]!, (openings.get(words[0]!) ?? 0) + 1);
}
const families = new Set([...openings].filter(([, count]) => count >= 3).map(([word]) => word));
let documented = 0;
let linkedVarieties = 0;
for (const entry of entries) {
  const document = documents.get(entry.eambrosiaId ?? entry.id);
  if (document === undefined) continue;
  const categories = registerCategories(document.text);
  const names = varietiesOf.get(entry.eambrosiaId ?? entry.id) ?? [];
  if (categories.length === 0 && names.length === 0) continue;
  const listed = new Set(
    names.map((name) => primaryName.get(matchKey(name))).filter((id): id is string => Boolean(id)),
  );
  const varieties = names.map((name) => ({ grapeId: linkVariety(name, listed, families), name }));
  entry.register = { categories, grapes: varieties, sourceUrl: document.url };
  documented += 1;
  linkedVarieties += varieties.filter((variety) => variety.grapeId !== null).length;
}
console.info(
  `  ${documented} names described from the register's single document; ${linkedVarieties} varieties linked to a grape card.`,
);

writeFileSync(resolve("data/kb/appellations.json"), `${JSON.stringify(entries, null, 2)}\n`);
const withSummary = entries.filter((entry) => Object.keys(entry.summaries).length > 0).length;
const withPoint = entries.filter((entry) => entry.latitude !== null).length;
console.info(
  `${entries.length} registered wine names: ${withSummary} with a summary, ${withPoint} on the map, ${links} grape links.`,
);
