import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  leadIsAboutWine,
  matchKey,
  type RegionEntry,
  registerCountries,
  registerNames,
  transliterate,
} from "./appellation-names";
import { type GrapeEntry, normalize, slug, summaryOf } from "./grape-validation";

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
  const linked = wikidata[row.appUniqueId] ?? null;
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
  entries.push({
    countryCode: country,
    eambrosiaId: row.appUniqueId,
    giType,
    grapes: [],
    id,
    latitude:
      linked?.latitude ??
      grandCrus[matchKey(row.protectedName)]?.latitude ??
      geocoded[row.appUniqueId]?.latitude ??
      null,
    legalUrl: `https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/details/${row.appUniqueId}`,
    longitude:
      linked?.longitude ??
      grandCrus[matchKey(row.protectedName)]?.longitude ??
      geocoded[row.appUniqueId]?.longitude ??
      null,
    pointSource:
      linked?.latitude != null
        ? (linked.pointSource ?? "item")
        : grandCrus[matchKey(row.protectedName)] !== undefined
          ? "item"
          : geocoded[row.appUniqueId] !== undefined
            ? "place"
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

// Grapes, by their own articles: a grape's region that is a registered name
// in the same country links the two, with the grape's quoted sentence.
const byName = new Map<string, RegionEntry>();
for (const entry of entries) {
  for (const { name } of entry.names) byName.set(`${entry.countryCode}:${normalize(name)}`, entry);
}
let links = 0;
for (const grape of grapes) {
  for (const region of grape.regions) {
    const entry = byName.get(`${region.country}:${normalize(region.name)}`);
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
  const dropped = notTheirSummary[entry.eambrosiaId];
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
  const translation = translations[entry.eambrosiaId];
  if (translation === undefined) continue;
  for (const [locale, text] of Object.entries(translation.texts)) {
    const key = locale === "pt-PT" ? "pt" : locale;
    if (entry.summaries[key] !== undefined) continue;
    entry.summaries[key] = { text, translated: true, url: translation.sourceUrl };
    translated += 1;
  }
}
console.info(`  ${translated} summaries translated from another language's article.`);

writeFileSync(resolve("data/kb/appellations.json"), `${JSON.stringify(entries, null, 2)}\n`);
const withSummary = entries.filter((entry) => Object.keys(entry.summaries).length > 0).length;
const withPoint = entries.filter((entry) => entry.latitude !== null).length;
console.info(
  `${entries.length} registered wine names: ${withSummary} with a summary, ${withPoint} on the map, ${links} grape links.`,
);
