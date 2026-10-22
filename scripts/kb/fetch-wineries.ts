import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { wikimedia } from "./wikimedia";

/**
 * Wineries for the producer field to suggest as the reader types: every item
 * Wikidata (CC0) holds as a winery, a champagne house or a wine company, or
 * whose product is wine, with the country it is in and, where it has one,
 * its point. Its name is the label in its country's language where Wikidata
 * has one, else in English, else any. Found with the search's
 * `haswbstatement`, read fifty at a time.
 *
 * Usage: pnpm kb:fetch-wineries
 */
const kinds = ["P31=Q156362", "P31=Q19347489", "P31=Q3631469", "P1056=Q282"];

// The language a country names its wineries in, for the name to show.
const languageOf: Record<string, string> = {
  AR: "es",
  AT: "de",
  BG: "bg",
  BR: "pt",
  CH: "de",
  CL: "es",
  CY: "el",
  CZ: "cs",
  DE: "de",
  ES: "es",
  FR: "fr",
  GE: "ka",
  GR: "el",
  HR: "hr",
  HU: "hu",
  IT: "it",
  LU: "fr",
  MD: "ro",
  MX: "es",
  PT: "pt",
  RO: "ro",
  RS: "sr",
  SI: "sl",
  SK: "sk",
  UY: "es",
};

type Entity = {
  claims?: Record<string, { mainsnak: { datavalue?: { value: unknown } } }[]>;
  labels?: Record<string, { value: string }>;
};
const claim = (entity: Entity, property: string) =>
  entity.claims?.[property]?.[0]?.mainsnak.datavalue?.value;

const ids = new Set<string>();
for (const kind of kinds) {
  let offset: number | undefined = 0;
  while (offset !== undefined) {
    const body: { continue?: { sroffset: number }; query: { search: { title: string }[] } } =
      await wikimedia(
        "https://www.wikidata.org/w/api.php?action=query&format=json&list=search" +
          `&srsearch=${encodeURIComponent(`haswbstatement:${kind}`)}&srlimit=500&sroffset=${offset}`,
      );
    for (const hit of body.query.search) ids.add(hit.title);
    offset = body.continue?.sroffset;
  }
}

const entities = async (batch: string[]) =>
  (
    await wikimedia<{ entities: Record<string, Entity> }>(
      "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|claims" +
        `&ids=${batch.join("|")}`,
    )
  ).entities;

const items = new Map<string, Entity>();
const all = [...ids];
for (let start = 0; start < all.length; start += 50) {
  for (const [id, entity] of Object.entries(await entities(all.slice(start, start + 50)))) {
    items.set(id, entity);
  }
}
// Each country item's two-letter code (P297).
const states = [
  ...new Set(
    [...items.values()].flatMap((entity) => {
      const state = claim(entity, "P17") as { id: string } | undefined;
      return state === undefined ? [] : [state.id];
    }),
  ),
];
const codeOf = new Map<string, string>();
for (let start = 0; start < states.length; start += 50) {
  for (const [id, entity] of Object.entries(await entities(states.slice(start, start + 50)))) {
    const code = claim(entity, "P297");
    if (typeof code === "string") codeOf.set(id, code);
  }
}

// A name the public mirror may not carry (`.mirror-denylist`, untracked) is
// left out here rather than failing the mirror later.
const denied = existsSync(resolve(".mirror-denylist"))
  ? readFileSync(resolve(".mirror-denylist"), "utf8")
      .split("\n")
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line !== "" && !line.startsWith("#"))
  : [];

const list = [...items]
  .flatMap(([id, entity]) => {
    const state = claim(entity, "P17") as { id: string } | undefined;
    const countryCode = state === undefined ? undefined : codeOf.get(state.id);
    if (countryCode === undefined) return [];
    const labels = entity.labels ?? {};
    const name = (
      labels[languageOf[countryCode] ?? "en"] ??
      labels.en ??
      Object.values(labels)[0]
    )?.value.trim();
    if (name === undefined || name === "") return [];
    if (denied.some((term) => name.toLowerCase().includes(term))) return [];
    // «château Lafite Rothschild»: a name begins with a capital in a list.
    const shown = name.charAt(0).toLocaleUpperCase("en") + name.slice(1);
    const point = claim(entity, "P625") as { latitude: number; longitude: number } | undefined;
    return [
      {
        countryCode,
        id,
        latitude: point === undefined ? null : Math.round(point.latitude * 1e5) / 1e5,
        longitude: point === undefined ? null : Math.round(point.longitude * 1e5) / 1e5,
        name: shown,
      },
    ];
  })
  .sort((one, other) => one.name.localeCompare(other.name, "en"));

writeFileSync(
  resolve("data/kb/wineries.json"),
  `${JSON.stringify(
    {
      about:
        "Wineries, champagne houses, wine companies and firms whose product is wine, from Wikidata (CC0): name, country, point. `pnpm kb:fetch-wineries`.",
      wineries: list,
    },
    null,
    1,
  )}\n`,
);
console.info(
  `${list.length} wineries in ${new Set(list.map((one) => one.countryCode)).size} countries.`,
);
