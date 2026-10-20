import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { wikimedia } from "./wikimedia";

/**
 * Each grape's full articles in the other languages its facts may be read
 * from — Spanish, French, Italian, German, Portuguese, Catalan, and the
 * languages of the grapes' own countries and of the Soviet ampelography
 * many of them were described in (Russian, Ukrainian, Bulgarian, Hungarian,
 * Croatian, Romanian, Czech, Slovenian, Greek, Polish, Georgian), Dutch, and
 * the other languages with many grape articles (Swedish, Japanese, Turkish,
 * Finnish, Norwegian, Danish, Chinese, Galician, Basque) — into
 * `.kb-cache/grapes-extra/<qid>.<lang>.json`, beside its English one. An
 * article already there is kept. Its titles come from the grape's own cache
 * (`.kb-cache/grapes/<qid>.json`, from Wikidata's sitelinks), or for the
 * languages beyond the app's from every sitelink, read in one pass
 * (`.kb-cache/grapes-sitelinks/sitelinks.json`).
 *
 * These are what body, alcohol and sweetness are read from by hand
 * (`data/kb/grape-readings.json`) where the English article says nothing.
 *
 * With `--every`, every other language a grape with a fact still missing has
 * an article in (`data/kb/grapes.json`), from its sitelinks.
 *
 * Usage: pnpm kb:fetch-grape-articles [--every]
 */
const cache = resolve(".kb-cache");
const languages = [
  "es",
  "fr",
  "it",
  "de",
  "pt",
  "ca",
  "ru",
  "uk",
  "bg",
  "hu",
  "hr",
  "ro",
  "cs",
  "sl",
  "el",
  "pl",
  "ka",
  "nl",
  "sv",
  "ja",
  "tr",
  "fi",
  "no",
  "da",
  "zh",
  "gl",
  "eu",
];
const sitelinksPath = resolve(cache, "grapes-sitelinks", "sitelinks.json");
const sitelinks = (
  existsSync(sitelinksPath) ? JSON.parse(readFileSync(sitelinksPath, "utf8")) : {}
) as Record<string, Record<string, string>>;

// Wikis that are not a language's encyclopedia.
const notLanguages = new Set(["commons", "meta", "simple", "species", "wikidata"]);
const every = process.argv.includes("--every");
const missing = (grape: Record<string, unknown>) =>
  ["acidity", "alcohol", "body", "origin", "sweetness"].some((field) => grape[field] === null) ||
  (grape.color !== "white" && grape.tannin === null) ||
  (grape.aromas as unknown[]).length === 0 ||
  (grape.pairings as unknown[]).length === 0;
const withGaps = new Set(
  (JSON.parse(readFileSync(resolve("data/kb/grapes.json"), "utf8")) as Record<string, unknown>[])
    .filter(missing)
    .map((grape) => grape.wikidataId as string),
);
const languagesOf = (qid: string) =>
  every && withGaps.has(qid)
    ? [
        ...new Set([
          ...languages,
          ...Object.keys(sitelinks[qid] ?? {})
            .filter((site) => site.endsWith("wiki"))
            .map((site) => site.slice(0, -"wiki".length))
            .filter((lang) => !notLanguages.has(lang) && lang !== "en"),
        ]),
      ]
    : languages;

type Pages = { query?: { pages?: Record<string, { extract?: string; title: string }> } };

let fetched = 0;
let kept = 0;
for (const file of readdirSync(resolve(cache, "grapes")).filter((name) => name.endsWith(".json"))) {
  const grape = JSON.parse(readFileSync(resolve(cache, "grapes", file), "utf8")) as {
    qid: string;
    titles?: Record<string, string>;
  };
  for (const lang of languagesOf(grape.qid)) {
    const title = grape.titles?.[lang] ?? sitelinks[grape.qid]?.[`${lang}wiki`];
    if (title === undefined) continue;
    const path = resolve(cache, "grapes-extra", `${grape.qid}.${lang}.json`);
    if (existsSync(path)) {
      kept += 1;
      continue;
    }
    const url = `https://${lang.replaceAll("_", "-")}.wikipedia.org/w/api.php?${new URLSearchParams(
      {
        action: "query",
        explaintext: "1",
        format: "json",
        prop: "extracts",
        redirects: "1",
        titles: title,
      },
    )}`;
    const page = Object.values((await wikimedia<Pages>(url)).query?.pages ?? {})[0];
    if (page?.extract === undefined || page.extract.length < 200) continue;
    writeFileSync(path, `${JSON.stringify({ text: page.extract, title: page.title })}\n`);
    fetched += 1;
  }
}
console.info(`${fetched} articles fetched, ${kept} already cached.`);
