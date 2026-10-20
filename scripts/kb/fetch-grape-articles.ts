import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { wikimedia } from "./wikimedia";

/**
 * Each grape's full articles in the other languages its facts may be read
 * from — Spanish, French, Italian, German, Portuguese, Catalan, and the
 * languages of the grapes' own countries and of the Soviet ampelography
 * many of them were described in (Russian, Ukrainian, Bulgarian, Hungarian,
 * Croatian, Romanian, Czech, Slovenian, Greek, Polish, Georgian) — into
 * `.kb-cache/grapes-extra/<qid>.<lang>.json`, beside its English one. An
 * article already there is kept. Its titles come from the grape's own cache
 * (`.kb-cache/grapes/<qid>.json`, from Wikidata's sitelinks), or for the
 * languages beyond the app's from every sitelink, read in one pass
 * (`.kb-cache/grapes-sitelinks/sitelinks.json`).
 *
 * These are what body, alcohol and sweetness are read from by hand
 * (`data/kb/grape-readings.json`) where the English article says nothing.
 *
 * Usage: pnpm kb:fetch-grape-articles
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
];
const sitelinksPath = resolve(cache, "grapes-sitelinks", "sitelinks.json");
const sitelinks = (
  existsSync(sitelinksPath) ? JSON.parse(readFileSync(sitelinksPath, "utf8")) : {}
) as Record<string, Record<string, string>>;

type Pages = { query?: { pages?: Record<string, { extract?: string; title: string }> } };

let fetched = 0;
let kept = 0;
for (const file of readdirSync(resolve(cache, "grapes")).filter((name) => name.endsWith(".json"))) {
  const grape = JSON.parse(readFileSync(resolve(cache, "grapes", file), "utf8")) as {
    qid: string;
    titles?: Record<string, string>;
  };
  for (const lang of languages) {
    const title = grape.titles?.[lang] ?? sitelinks[grape.qid]?.[`${lang}wiki`];
    if (title === undefined) continue;
    const path = resolve(cache, "grapes-extra", `${grape.qid}.${lang}.json`);
    if (existsSync(path)) {
      kept += 1;
      continue;
    }
    const url = `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({
      action: "query",
      explaintext: "1",
      format: "json",
      prop: "extracts",
      redirects: "1",
      titles: title,
    })}`;
    const page = Object.values((await wikimedia<Pages>(url)).query?.pages ?? {})[0];
    if (page?.extract === undefined || page.extract.length < 200) continue;
    writeFileSync(path, `${JSON.stringify({ text: page.extract, title: page.title })}\n`);
    fetched += 1;
  }
}
console.info(`${fetched} articles fetched, ${kept} already cached.`);
