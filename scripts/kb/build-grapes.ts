import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { leadIsAboutWine } from "./appellation-names";
import { type GrapeEntry, slug, summaryOf, validateExtraction } from "./grape-validation";

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

const entries: GrapeEntry[] = [];
const rejected: { field: string; grape: string; reason: string; value: string }[] = [];
let skipped = 0;
let basic = 0;
for (const qid of index) {
  const extractedPath = resolve(cache, `extracted/${qid}.json`);
  const raw = JSON.parse(readFileSync(resolve(cache, `grapes/${qid}.json`), "utf8")) as Raw;
  if (raw.article === null) continue;
  // A grape the model has not read yet still has a card: its names in every
  // language, its synonyms and its Wikipedia summary need no model, and a
  // wine of Picapoll should find Picapoll in the library today, not once the
  // day's allowance reaches it. Structure, aromas and regions arrive when it
  // is read. A grape grown for the table, not for wine, waits for the reading
  // that can tell.
  const extracted = existsSync(extractedPath);
  if (!extracted) {
    const lead = raw.leads.en ?? Object.values(raw.leads)[0] ?? "";
    const opening = lead.slice(0, 240);
    if (!leadIsAboutWine(lead) || /\b(table grapes?|raisins?|uvas? de mesa)\b/i.test(opening))
      continue;
  }
  const proposal = extracted
    ? (JSON.parse(readFileSync(extractedPath, "utf8")) as { extraction: unknown }).extraction
    : {};
  const result = validateExtraction(proposal, raw.article, raw.wikidataOrigin);
  if (!extracted) {
    basic += 1;
  }
  rejected.push(...result.rejected.map((entry) => ({ ...entry, grape: raw.labels.en ?? qid })));
  if (!result.isWineGrape) {
    skipped += 1;
    continue;
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
    wikipediaUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent((raw.titles.en ?? "").replaceAll(" ", "_"))}`,
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
