import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { leadIsAboutWine } from "./appellation-names";
import {
  type GrapeEntry,
  normalize,
  slug,
  summaryOf,
  validateExtraction,
} from "./grape-validation";

/**
 * Step three of the wine library: keep only what the sources say.
 *
 * Each grape's model proposal (`.kb-cache/extracted`) is checked against its
 * article (`.kb-cache/grapes`) by `validateExtraction`, and only what passes
 * is written to `data/kb/grapes.json` — the file that ships, and the one the
 * loader puts in D1. A rejected value is reported, not repaired.
 *
 * Usage: pnpm kb:build-grapes [--review 20]
 */

const cache = resolve(".kb-cache");
const index = JSON.parse(readFileSync(resolve(cache, "grapes/index.json"), "utf8")) as string[];

type Raw = {
  aliases: Record<string, string[]>;
  article: string | null;
  labels: Record<string, string>;
  leads: Record<string, string>;
  qid: string;
  sitelinks: number;
  titles: Record<string, string>;
  wikidataOrigin: string[];
};

/** The curated vocabulary: each variant a source uses, mapped to one term. */
const vocabulary = JSON.parse(readFileSync(resolve("data/kb/terms.json"), "utf8")) as Record<
  "aroma" | "pairing",
  { terms: Record<string, Record<string, string>>; variants: Record<string, string | null> }
>;
const unmapped = new Set<string>();

/** A source's word as the library's term; null for one the vocabulary drops. */
function term(kind: "aroma" | "pairing", value: string): string | null {
  const key = value.trim().toLowerCase();
  const { terms, variants } = vocabulary[kind];
  if (key in variants) return variants[key] ?? null;
  if (key in terms) return key;
  // Not yet in the vocabulary: kept as the source wrote it, and reported so
  // the vocabulary can be extended before it ships untranslated.
  unmapped.add(`${kind}: ${key}`);
  return key;
}

function terms(kind: "aroma" | "pairing", values: string[]): string[] {
  return [...new Set(values.flatMap((value) => term(kind, value) ?? []))];
}

/**
 * A grape's articles in other languages, each with the reading proposed from
 * it (`.kb-cache/grapes-extra/<qid>.<lang>.json` for the article,
 * `.kb-cache/extracted-extra/<qid>.<lang>.json` for the reading).
 */
function extraReadings(
  qid: string,
): { article: string; extraction: unknown; lang: string; url: string }[] {
  const directory = resolve(cache, "extracted-extra");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((file) => file.startsWith(`${qid}.`) && file.endsWith(".json"))
    .flatMap((file) => {
      const lang = file.slice(qid.length + 1, -".json".length);
      const articlePath = resolve(cache, "grapes-extra", `${qid}.${lang}.json`);
      if (!existsSync(articlePath)) return [];
      const article = JSON.parse(readFileSync(articlePath, "utf8")) as {
        text: string;
        title: string;
      };
      const reading = JSON.parse(readFileSync(resolve(directory, file), "utf8")) as {
        extraction: unknown;
      };
      return [
        {
          article: article.text,
          extraction: reading.extraction,
          lang,
          url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(article.title.replaceAll(" ", "_"))}`,
        },
      ];
    });
}

/**
 * Summaries translated from a grape's own-language article where no app
 * language has one (`data/kb/grape-translations.json`): each a faithful
 * translation of the passage named, adding nothing.
 */
const translations = (
  JSON.parse(readFileSync(resolve("data/kb/grape-translations.json"), "utf8")) as {
    grapes: Record<string, { from: string; sourceUrl: string; texts: Record<string, string> }>;
  }
).grapes;

const entries: GrapeEntry[] = [];
const rejected: { field: string; grape: string; reason: string; value: string }[] = [];
let skipped = 0;
let basic = 0;
for (const qid of index) {
  const extractedPath = resolve(cache, `extracted/${qid}.json`);
  const raw = JSON.parse(readFileSync(resolve(cache, `grapes/${qid}.json`), "utf8")) as Raw;
  // A grape no English Wikipedia covers — Kisi, Ojaleshi — is read from the
  // article in its own country's language instead, if one has been read; its
  // facts then cite that article, and its card links it.
  const extras = extraReadings(qid);
  const own = raw.article === null ? extras.shift() : undefined;
  const article = raw.article ?? own?.article;
  if (article === undefined) continue;
  // A grape the model has not read yet still has a card: its names in every
  // language, its synonyms and its Wikipedia summary need no model, and a
  // wine of Picapoll should find Picapoll in the library today, not once the
  // day's allowance reaches it. Structure, aromas and regions arrive when it
  // is read. A grape grown for the table, not for wine, waits for the reading
  // that can tell.
  const extracted = own !== undefined || existsSync(extractedPath);
  if (!extracted) {
    const lead = raw.leads.en ?? Object.values(raw.leads)[0] ?? "";
    const opening = lead.slice(0, 240);
    // The lead, or failing that the article's opening: "a Georgian red grape
    // variety" never says wine, and the next paragraph does.
    const aboutWine = leadIsAboutWine(lead) || leadIsAboutWine(article.slice(0, 2_000));
    // Grown for the table — unless the same opening says it makes wine too
    // ("used as a table grape and to make a variety of wines"). Raisins as
    // an aroma ("an aroma of grape juice and raisins") is not a use.
    const forTable =
      /\b(table grapes?|uvas? de mesa|raisin grapes?|(for|into) raisins)\b/i.test(opening) &&
      !/\b(wine grape|to make (a variety of )?(\w+ )?wines?)\b/i.test(opening);
    if (!aboutWine || forTable) continue;
  }
  const proposal =
    own?.extraction ??
    (extracted
      ? (JSON.parse(readFileSync(extractedPath, "utf8")) as { extraction: unknown }).extraction
      : {});
  const result = validateExtraction(proposal, article, raw.wikidataOrigin);
  if (!extracted) {
    basic += 1;
  }
  rejected.push(...result.rejected.map((entry) => ({ ...entry, grape: raw.labels.en ?? qid })));
  if (!result.isWineGrape) {
    skipped += 1;
    continue;
  }
  // The grape's article in another language — its home language, usually —
  // read where the English one is silent: it fills only what is still
  // missing, every value checked against that article's own words, and each
  // fact keeps the article it came from.
  for (const extra of extras) {
    const found = validateExtraction(extra.extraction, extra.article, raw.wikidataOrigin);
    rejected.push(
      ...found.rejected.map((entry) => ({
        ...entry,
        grape: `${raw.labels.en ?? qid} (${extra.lang})`,
      })),
    );
    const cite = (field: string) =>
      found.evidence
        .filter((entry) => entry.field === field)
        .map((entry) => ({ ...entry, sourceUrl: extra.url }));
    for (const axis of ["acidity", "tannin", "body"] as const) {
      if (result[axis] === null && found[axis] !== null) {
        result[axis] = found[axis];
        result.evidence.push(...cite(axis));
      }
    }
    for (const listField of ["aromas", "pairings", "styles"] as const) {
      const fresh = found[listField].filter((item) => !result[listField].includes(item));
      if (fresh.length === 0) continue;
      result[listField].push(...fresh);
      result.evidence.push(...cite(listField).filter((entry) => fresh.includes(entry.value)));
    }
    const knownRegions = new Set(result.regions.map((region) => normalize(region.name)));
    const freshRegions = found.regions.filter(
      (region) => !knownRegions.has(normalize(region.name)),
    );
    if (freshRegions.length > 0) {
      result.regions.push(...freshRegions);
      result.evidence.push(...cite("regions"));
    }
  }
  const names: Record<string, string> = {};
  // Some languages write a variety in lower case in running text ("la
  // garnacha"); as the name on a card it takes a capital.
  for (const [locale, label] of Object.entries(raw.labels)) {
    names[locale] =
      label === label.toLowerCase() ? label.charAt(0).toUpperCase() + label.slice(1) : label;
  }
  const summaries: GrapeEntry["summaries"] = {};
  for (const [locale, lead] of Object.entries(raw.leads)) {
    const text = summaryOf(lead);
    const title = raw.titles[locale];
    if (text === null || title === undefined) continue;
    summaries[locale] = {
      text,
      url: `https://${locale}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
    };
  }
  // Where no Wikipedia in the app's languages has the grape, its own
  // language's lead, translated by hand and marked as a translation.
  const translation = translations[qid];
  if (translation !== undefined) {
    for (const [locale, text] of Object.entries(translation.texts)) {
      summaries[locale] ??= { text, translated: true, url: translation.sourceUrl };
    }
  }
  // Synonyms: the article's (each quoted), Wikidata's aliases, and the
  // variety's own name in other languages — every one a name somebody uses.
  const seen = new Set<string>();
  const synonyms: GrapeEntry["synonyms"] = [];
  const add = (name: string, source: "article" | "wikidata") => {
    // Wikidata's aliases carry clone numbers and descriptions ("Aragonez 51",
    // "Alvarinho grape"); a name with a digit or the word grape is not one.
    if (/\d/.test(name) || /\b(grape|variety|uva|cepage)\b/i.test(name)) return;
    const key = slug(name);
    if (key.length === 0 || key === slug(raw.labels.en ?? "") || seen.has(key)) return;
    seen.add(key);
    synonyms.push({ name, source });
  };
  for (const synonym of result.synonyms) add(synonym, "article");
  for (const label of Object.values(raw.labels)) add(label, "wikidata");
  for (const list of Object.values(raw.aliases)) for (const alias of list) add(alias, "wikidata");

  entries.push({
    acidity: result.acidity,
    aromas: terms("aroma", result.aromas),
    body: result.body,
    color: result.color,
    evidence: result.evidence,
    id: slug(raw.labels.en ?? qid),
    names,
    origin: result.origin,
    pairings: terms("pairing", result.pairings),
    prominence: raw.sitelinks,
    regions: result.regions,
    styles: result.styles,
    summaries,
    synonyms,
    tannin: result.tannin,
    wikidataId: qid,
    wikipediaUrl:
      own?.url ??
      `https://en.wikipedia.org/wiki/${encodeURIComponent((raw.titles.en ?? "").replaceAll(" ", "_"))}`,
  });
}

mkdirSync(resolve("data/kb"), { recursive: true });
writeFileSync(resolve("data/kb/grapes.json"), `${JSON.stringify(entries, null, 2)}\n`);
writeFileSync(resolve(cache, "rejected-grapes.json"), JSON.stringify(rejected, null, 2));
const evidenceCount = entries.reduce((sum, entry) => sum + entry.evidence.length, 0);
if (unmapped.size > 0) {
  console.warn(
    `  Not in data/kb/terms.json yet (shipped untranslated): ${[...unmapped].join(", ")}`,
  );
}
console.info(
  `${entries.length} grapes kept (${basic} not read by the model yet, ${skipped} not wine grapes), ${evidenceCount} quoted facts, ${rejected.length} proposals rejected.`,
);
