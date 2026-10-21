import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { matchKey } from "./appellation-names";
import { readSheet } from "./xlsx";

/**
 * The University of Adelaide's «Database of Regional, National and Global
 * Winegrape Bearing Areas by Variety, 2000 to 2023» (Anderson, Nelgen and
 * Puga, December 2025, revised March 2026; CC BY 4.0), read from its files as
 * downloaded from the record into `.kb-cache/adelaide/`:
 *
 * - each registered name that is one of its regions — an Australian or New
 *   Zealand GI, an Argentine department, a Slovenian or Czech wine district, a
 *   Portuguese wine region, a Japanese prefecture, a Swiss canton — takes the
 *   region's bearing area (the sum of its varieties' rows) and the library's
 *   grapes that cover at least 2 % of it, the twelve largest;
 * - each library grape matched to one of its prime varieties takes the
 *   country of origin its table gives, where the varieties' sources disagree
 *   on none.
 *
 * Usage: pnpm kb:read-adelaide
 */
const cache = resolve(".kb-cache/adelaide");
const sourceUrl = "https://doi.org/10.25909/32870405.v1";
const file = (name: string) => {
  const path = resolve(cache, name);
  if (!existsSync(path)) throw new Error(`Download ${name} from ${sourceUrl} into ${cache}.`);
  return new Uint8Array(readFileSync(path));
};

type Grape = { id: string; names: Record<string, string>; synonyms?: { name: string }[] };
type Entry = {
  countryCode: string;
  figures?: { planted: unknown } | null;
  grapes: unknown[];
  id: string;
  name: string;
  names?: { name: string }[];
  register?: { grapes: unknown[] } | null;
};
const grapes = JSON.parse(readFileSync(resolve("data/kb/grapes.json"), "utf8")) as Grape[];
const entries = JSON.parse(readFileSync(resolve("data/kb/appellations.json"), "utf8")) as Entry[];

/** A variety's name to compare: no accents, no colour mutation in brackets. */
const varietyKey = (name: string) =>
  name
    .replace(/\(.*?\)/g, " ")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// The library's names for each grape, apart from its synonyms.
const byName = new Map<string, Set<string>>();
const bySynonym = new Map<string, Set<string>>();
const note = (table: Map<string, Set<string>>, name: string, id: string) => {
  const key = varietyKey(name);
  if (key !== "") table.set(key, (table.get(key) ?? new Set()).add(id));
};
for (const grape of grapes) {
  for (const name of Object.values(grape.names)) note(byName, name, grape.id);
  for (const { name } of grape.synonyms ?? []) note(bySynonym, name, grape.id);
}

// Each prime variety's synonyms and its country of origin.
const primes = new Map<string, { origin: string; synonyms: string[] }>();
for (const row of readSheet(
  file("(c) Names of prime varieties and synonyms.xlsx"),
  "Primes and synonyms",
)) {
  const prime = row.A?.value ?? "";
  if (prime === "" || prime === "prime") continue;
  const known = primes.get(prime) ?? { origin: row.C?.value ?? "", synonyms: [] };
  known.synonyms.push(row.B?.value ?? "");
  primes.set(prime, known);
}

/**
 * The library grape a prime variety is, and how near the match: by one of
 * the grape's own names (0), by one of the prime's synonyms as the grape's
 * name (1), or by the prime as one of the grape's synonyms (2). Two grapes at
 * the nearest step are no match.
 */
function grapeOf(prime: string): { grapeId: string; step: number } | null {
  const steps: [Map<string, Set<string>>, string[]][] = [
    [byName, [prime]],
    [byName, primes.get(prime)?.synonyms ?? []],
    [bySynonym, [prime]],
  ];
  for (const [step, [table, names]] of steps.entries()) {
    const found = new Set(names.flatMap((name) => [...(table.get(varietyKey(name)) ?? [])]));
    if (found.size === 1) return { grapeId: [...found][0]!, step };
    if (found.size > 1) return null;
  }
  return null;
}
const primeGrape = new Map([...primes.keys()].map((prime) => [prime, grapeOf(prime)]));

// Origins. A grape takes the primes matched at its nearest step; they must
// agree on a country. Left out: grapes whose origin is disputed among the
// sources the library already reads, which a table's single country would
// settle by fiat.
const disputed = new Set([
  "albarino", // Galicia or the Minho
  "loureira", // the same border
  "italian-riesling", // Graševina: Croatia's claim, origin unknown
  "kadarka", // the Balkans or Hungary
  "muscat-of-alexandria", // North Africa or Greece
  "gouais-blanc", // central Europe or France
  "savagnin", // the Traminer, claimed by several
  "vernaccia", // the table's prime is Vernaccia di Oristano, not the library's
]);
const countryCodes: Record<string, string> = {
  Austria: "AT",
  France: "FR",
  Germany: "DE",
  Greece: "GR",
  Hungary: "HU",
  Italy: "IT",
  Japan: "JP",
  Portugal: "PT",
  Spain: "ES",
  Turkey: "TR",
  "United States": "US",
};
const nearest = new Map<string, { primes: string[]; step: number }>();
for (const [prime, match] of primeGrape) {
  if (match === null) continue;
  const known = nearest.get(match.grapeId);
  if (known === undefined || match.step < known.step) {
    nearest.set(match.grapeId, { primes: [prime], step: match.step });
  } else if (match.step === known.step) known.primes.push(prime);
}
const origins: Record<string, { code: string; country: string; prime: string }> = {};
for (const [grapeId, { primes: matched }] of nearest) {
  if (disputed.has(grapeId)) continue;
  const countries = new Set(matched.map((prime) => primes.get(prime)!.origin));
  const [country] = countries;
  const code = country === undefined ? undefined : countryCodes[country];
  if (countries.size !== 1 || code === undefined) continue;
  origins[grapeId] = { code, country: country!, prime: matched[0]! };
}

// Regions: the rows of every country, by country, region, sub-region and
// sub-sub-region, each a prime variety's bearing area in a year.
type Row = { area: number; path: string[]; prime: string; year: string };
const rows: Row[] = [];
for (const row of readSheet(file("(h) Regional data 2023.xlsx"), "All countries")) {
  const area = Number(row.F?.value);
  if (!Number.isFinite(area) || row.A?.value === "country") continue;
  const path = [row.A?.value, row.B?.value, row.C?.value, row.D?.value]
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
    .filter((part) => part !== "");
  rows.push({ area, path, prime: row.E?.value ?? "", year: row.G?.value ?? "" });
}

const countryOf: Record<string, string> = {
  AR: "Argentina",
  AU: "Australia",
  CA: "Canada",
  CH: "Switzerland",
  CZ: "Czechia",
  GE: "Georgia",
  JP: "Japan",
  NZ: "New Zealand",
  PT: "Portugal",
  SI: "Slovenia",
  US: "United States",
  ZA: "South Africa",
};
// A unit's name as the table hyphenates it across a line («Stellen- Bosch»).
const joined = (name: string) =>
  name.replace(
    /(\p{Ll})-\s+(\p{L})/gu,
    (_, end: string, start: string) => end + start.toLowerCase(),
  );
const unitKey = (name: string) => matchKey(joined(name));
// Swiss cantonal names are the canton's code in the table; Bern and Graubünden
// are split, and their parts add up.
const swiss: Record<string, string[]> = {
  "ch-aargau": ["AG"],
  "ch-appenzell-ausserrhoden": ["AR"],
  "ch-appenzell-innerrhoden": ["AI"],
  "ch-basel-landschaft": ["BL"],
  "ch-basel-stadt": ["BS"],
  "ch-bern": ["BE Lac de Bienne", "BE Thunersee", "BE übriges Gebiet"],
  "ch-bielersee": ["BE Lac de Bienne"],
  "ch-geneve": ["GE"],
  "ch-glarus": ["GL"],
  "ch-graubunden": ["GR Mesolcina", "GR übriges Gebiet"],
  "ch-jura": ["JU"],
  "ch-luzern": ["LU"],
  "ch-neuchatel": ["NE"],
  "ch-nidwalden": ["NW"],
  "ch-obwalden": ["OW"],
  "ch-schaffhausen": ["SH"],
  "ch-schwyz": ["SZ"],
  "ch-solothurn": ["SO"],
  "ch-st-gallen": ["SG"],
  "ch-thunersee": ["BE Thunersee"],
  "ch-thurgau": ["TG"],
  "ch-ticino": ["TI"],
  "ch-uri": ["UR"],
  "ch-valais": ["VS"],
  "ch-vaud": ["VD"],
  "ch-zug": ["ZG"],
  "ch-zurich": ["ZH"],
};
// Argentina's names, by the province and department the INV's yearbook gives
// each (`data/kb/ar-ig-figures.json`). The table writes «ñ» as «&» and
// shortens a few departments.
const argentine = JSON.parse(readFileSync(resolve("data/kb/ar-ig-figures.json"), "utf8")) as {
  regions: Record<string, { department: string | null; province: string }>;
};
const shortened: Record<string, string> = {
  "cnel felipe varela": "coronel felipe varela",
  "s blas de los sauces": "san blas de los sauces",
  ullun: "ullum",
};
const argentineKey = (name: string) => {
  const key = matchKey(name.replaceAll("&", "ñ"));
  return shortened[key] ?? key;
};
// South Africa's units are SAWIS's statistical regions, not the Wine of
// Origin districts of the same name: their grapes, never their area.
const grapesOnly = new Set(["ZA"]);

type Region = {
  grapes: { grapeId: string; ha: number; prime: string }[];
  /** Whether the region's area is the name's: not for South Africa's. */
  area: boolean;
  totalHa: number;
  unit: string;
  year: string;
};
const regions: Record<string, Region> = {};
// Names two entries of a country share (Sarmiento in San Juan and in Chubut):
// each is told apart by the province its id ends with.
const nameCounts = new Map<string, number>();
for (const entry of entries) {
  const key = `${entry.countryCode} ${matchKey(entry.name)}`;
  nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
}
const sharedNames = new Set([...nameCounts].filter(([, count]) => count > 1).map(([key]) => key));
for (const entry of entries) {
  const country = countryOf[entry.countryCode];
  if (country === undefined) continue;
  const inCountry = rows.filter((row) => row.path[0] === country);
  let chosen: Row[] = [];
  let unit = "";
  if (entry.countryCode === "CH") {
    const parts = swiss[entry.id];
    if (parts === undefined) continue;
    chosen = inCountry.filter((row) => parts.includes(row.path[1] ?? ""));
    // The canton by its name, with the table's rows: «Vaud (VD)».
    unit = `${entry.name} (${parts.join(" + ")})`;
  } else if (entry.countryCode === "AR") {
    // By the province and department the INV gives the name, never by the
    // name alone: Junín is in three provinces, 25 de Mayo in two.
    const place = argentine.regions[entry.id];
    if (place === undefined) continue;
    const province = argentineKey(place.province);
    const department = place.department === null ? null : argentineKey(place.department);
    chosen = inCountry.filter(
      (row) =>
        argentineKey(row.path[1] ?? "") === province &&
        (department === null || argentineKey(row.path[2] ?? "") === department),
    );
    // Named as the INV writes it: the table's «A&Elo» is Añelo.
    unit = [place.department, place.province].filter((part) => part !== null).join(", ");
  } else {
    const keys = new Set([entry.name, ...(entry.names ?? []).map(({ name }) => name)].map(unitKey));
    // The deepest level whose name is the entry's, and every row beneath it.
    // A name in two provinces (Rivadavia, San Martín) is the one the entry's
    // id names, or neither.
    for (let depth = 3; depth >= 1 && chosen.length === 0; depth -= 1) {
      const units = new Map<string, string[]>();
      for (const row of inCountry) {
        const name = row.path[depth];
        if (name === undefined || !keys.has(unitKey(name))) continue;
        const prefix = row.path.slice(0, depth + 1);
        units.set(prefix.join(" > "), prefix);
      }
      let found = [...units.values()];
      if (found.length > 1 || sharedNames.has(`${entry.countryCode} ${matchKey(entry.name)}`)) {
        found = found.filter((prefix) =>
          entry.id.endsWith(`-${matchKey(prefix[depth - 1] ?? "").replaceAll(" ", "-")}`),
        );
      }
      if (found.length !== 1) continue;
      const prefix = found[0]!;
      chosen = inCountry.filter((row) => prefix.every((part, index) => row.path[index] === part));
      unit = joined(prefix[depth]!);
    }
  }
  if (chosen.length === 0) continue;
  const years = new Set(chosen.map((row) => row.year));
  if (years.size !== 1) continue;
  const total = chosen.reduce((sum, row) => sum + row.area, 0);
  const byGrape = new Map<string, { ha: number; prime: string }>();
  for (const row of chosen) {
    const grapeId = primeGrape.get(row.prime)?.grapeId;
    if (grapeId === undefined) continue;
    const known = byGrape.get(grapeId);
    byGrape.set(grapeId, {
      ha: (known?.ha ?? 0) + row.area,
      prime: known === undefined || row.area > known.ha ? row.prime : known.prime,
    });
  }
  const round = (ha: number) => Math.round(ha * 10) / 10;
  regions[entry.id] = {
    grapes: [...byGrape]
      .filter(([, { ha }]) => ha >= total * 0.02)
      .sort(([, one], [, other]) => other.ha - one.ha)
      .slice(0, 12)
      .map(([grapeId, { ha, prime }]) => ({ grapeId, ha: round(ha), prime })),
    area: !grapesOnly.has(entry.countryCode),
    totalHa: round(total),
    // South Africa's units said for what they are.
    unit: `${unit}${grapesOnly.has(entry.countryCode) ? " (SAWIS statistical region)" : ""}, ${country}`,
    year: [...years][0]!,
  };
}

writeFileSync(
  resolve("data/kb/adelaide.json"),
  `${JSON.stringify(
    {
      about:
        "From the University of Adelaide's «Database of Regional, National and Global Winegrape Bearing Areas by Variety, 2000 to 2023» (K. Anderson, S. Nelgen and G. Puga, Wine Economics Research Centre, December 2025, revised March 2026; CC BY 4.0). Changed: rows summed by region and by library grape; a region's grapes are those covering at least 2 % of its bearing area, the twelve largest; South Africa's statistical regions give grapes only; origins left out where disputed. Built by scripts/kb/read-adelaide.ts.",
      origins: Object.fromEntries(
        Object.entries(origins).sort(([one], [other]) => one.localeCompare(other)),
      ),
      regions: Object.fromEntries(
        Object.entries(regions).sort(([one], [other]) => one.localeCompare(other)),
      ),
      sourceUrl,
    },
    null,
    1,
  )}\n`,
);
console.info(
  `Adelaide: ${Object.keys(origins).length} grape origins, ${Object.keys(regions).length} regions (${Object.values(regions).filter((region) => region.area).length} with their area).`,
);
