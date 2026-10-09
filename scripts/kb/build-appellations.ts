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
import { allowedItem } from "./appellation-exclusions";
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

// A registered name the register describes as several others ("Istočna
// kontinentalna Hrvatska consists of two subregions: Hrvatsko Podunavlje and
// Slavonija"): the median of their points, approximate.
for (const entry of entries) {
  const parts = curatedAreas[entry.eambrosiaId]?.parts;
  if (parts === undefined || entry.pointSource === "item") continue;
  const points = entries.filter(
    (other) => parts.includes(other.eambrosiaId) && other.latitude !== null,
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
for (const entry of entries) {
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
  const document = documents.get(entry.eambrosiaId);
  if (document === undefined) continue;
  const categories = registerCategories(document.text);
  const names = varietiesOf.get(entry.eambrosiaId) ?? [];
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
