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
 * With `--every`, also the articles its Wikidata item links in the languages
 * whose articles give figures in their text (German, French, Italian,
 * Spanish, Portuguese, Catalan, Dutch, English) — the German Wikipedia
 * describes almost every Italian DOC on its own page.
 *
 * Usage: pnpm kb:fetch-region-articles [--every]
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

const every = process.argv.includes("--every");
const languages = ["de", "fr", "it", "es", "pt", "ca", "nl", "en"];
const wanting = entries.filter(
  (entry) => entry.wikidataId !== null && !(entry.figures?.planted && entry.figures.production),
);
// Each wanting item's articles in those languages, from Wikidata.
const linked = new Map<string, Record<string, string>>();
if (every) {
  const items = wanting.map((entry) => entry.wikidataId!);
  for (let start = 0; start < items.length; start += 50) {
    const response = await wikimedia<{
      entities?: Record<string, { sitelinks?: Record<string, { title: string }> }>;
    }>(
      `https://www.wikidata.org/w/api.php?${new URLSearchParams({
        action: "wbgetentities",
        format: "json",
        ids: items.slice(start, start + 50).join("|"),
        props: "sitelinks",
        sitefilter: languages.map((lang) => `${lang}wiki`).join("|"),
      })}`,
    );
    for (const [item, entity] of Object.entries(response.entities ?? {})) {
      linked.set(
        item,
        Object.fromEntries(
          Object.entries(entity.sitelinks ?? {}).map(([site, link]) => [
            site.slice(0, -"wiki".length),
            link.title,
          ]),
        ),
      );
    }
  }
}

let fetched = 0;
let kept = 0;
for (const entry of wanting) {
  const titles = new Map<string, string>();
  for (const summary of Object.values(entry.summaries)) {
    if (summary.translated === true || summary.url === undefined) continue;
    const match = /^https:\/\/([a-z-]+)\.wikipedia\.org\/wiki\/(.+)$/.exec(summary.url);
    if (match !== null) titles.set(match[1]!, decodeURIComponent(match[2]!).replaceAll("_", " "));
  }
  for (const [lang, title] of Object.entries(linked.get(entry.wikidataId!) ?? {})) {
    if (!titles.has(lang)) titles.set(lang, title);
  }
  for (const [lang, title] of titles) {
    const path = resolve(folder, `${entry.wikidataId!}.${lang}.json`);
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
console.info(`${fetched} region articles fetched, ${kept} already cached.`);
