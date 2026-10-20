import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { wikimedia } from "./wikimedia";

/**
 * The whole Wikipedia article — not only its opening — of each registered
 * name that still lacks its vineyard area or its production, in each language
 * its summaries come from, into `.kb-cache/appellations/articles/<qid>.<lang>.json`
 * (`{ title, text }`), where `build-appellations.ts` reads them. An article's
 * body often gives the hectares of vines or the hectolitres made where its
 * infobox says nothing; those sentences are read by hand into
 * `data/kb/region-text-figures.json`. An article already cached is kept.
 * Serial, one request at a time.
 *
 * Usage: pnpm kb:fetch-region-articles
 */
type Entry = {
  figures?: { planted: unknown; production: unknown } | null;
  summaries: Record<string, { translated?: boolean; url?: string }>;
  wikidataId: string | null;
};

const folder = resolve(".kb-cache/appellations/articles");
mkdirSync(folder, { recursive: true });
const entries = JSON.parse(readFileSync(resolve("data/kb/appellations.json"), "utf8")) as Entry[];

type Pages = { query?: { pages?: Record<string, { extract?: string; title: string }> } };

let fetched = 0;
let kept = 0;
for (const entry of entries) {
  if (entry.wikidataId === null) continue;
  if (entry.figures?.planted && entry.figures.production) continue;
  for (const summary of Object.values(entry.summaries)) {
    if (summary.translated === true || summary.url === undefined) continue;
    const match = /^https:\/\/([a-z-]+)\.wikipedia\.org\/wiki\/(.+)$/.exec(summary.url);
    if (match === null) continue;
    const [, lang, encoded] = match;
    const path = resolve(folder, `${entry.wikidataId}.${lang}.json`);
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
      titles: decodeURIComponent(encoded!).replaceAll("_", " "),
    })}`;
    const page = Object.values((await wikimedia<Pages>(url)).query?.pages ?? {})[0];
    if (page?.extract === undefined || page.extract.length < 200) continue;
    writeFileSync(path, `${JSON.stringify({ text: page.extract, title: page.title })}\n`);
    fetched += 1;
  }
}
console.info(`${fetched} region articles fetched, ${kept} already cached.`);
