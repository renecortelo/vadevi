import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { figureLanguages, type RegionFigure, regionFigures } from "./region-figures";
import { wikimedia } from "./wikimedia";

/**
 * Each registered name's planted area and production, from the infobox of
 * the Wikipedia articles that already describe it (its summaries' sources),
 * in English, French, Spanish and German. Where several give one, the most
 * recent year wins; then French, English, Spanish, German.
 *
 * Usage: pnpm kb:fetch-region-figures
 */
type Entry = { id: string; summaries: Record<string, { translated?: boolean; url?: string }> };

const entries = JSON.parse(readFileSync(resolve("data/kb/appellations.json"), "utf8")) as Entry[];

// The articles to read: language → title → the names they describe.
const wanted = new Map<string, Map<string, string[]>>();
for (const entry of entries) {
  for (const summary of Object.values(entry.summaries)) {
    if (summary.translated === true || summary.url === undefined) continue;
    const match = /^https:\/\/([a-z]+)\.wikipedia\.org\/wiki\/(.+)$/.exec(summary.url);
    if (match === null || !figureLanguages.includes(match[1]!)) continue;
    const title = decodeURIComponent(match[2]!).replaceAll("_", " ");
    const titles = wanted.get(match[1]!) ?? new Map<string, string[]>();
    titles.set(title, [...new Set([...(titles.get(title) ?? []), entry.id])]);
    wanted.set(match[1]!, titles);
  }
}

type Found = RegionFigure & { language: string; sourceUrl: string };
const found = new Map<string, { planted: Found[]; production: Found[] }>();

type Response = {
  query?: {
    normalized?: { from: string; to: string }[];
    pages?: Record<string, { revisions?: { slots: { main: { "*": string } } }[]; title: string }>;
    redirects?: { from: string; to: string }[];
  };
};

for (const [language, titles] of wanted) {
  const all = [...titles.keys()];
  for (let start = 0; start < all.length; start += 50) {
    const batch = all.slice(start, start + 50);
    const url = `https://${language}.wikipedia.org/w/api.php?${new URLSearchParams({
      action: "query",
      format: "json",
      prop: "revisions",
      redirects: "1",
      rvprop: "content",
      rvslots: "main",
      titles: batch.join("|"),
    })}`;
    const response = await wikimedia<Response>(url);
    // Back from the page's title to the one asked for.
    const asked = new Map<string, string>(batch.map((title) => [title, title]));
    for (const step of [
      ...(response.query?.normalized ?? []),
      ...(response.query?.redirects ?? []),
    ]) {
      asked.set(step.to, asked.get(step.from) ?? step.from);
    }
    for (const page of Object.values(response.query?.pages ?? {})) {
      const text = page.revisions?.[0]?.slots.main["*"];
      const original = asked.get(page.title);
      if (text === undefined || original === undefined) continue;
      const figures = regionFigures(text, language);
      if (figures === null) continue;
      const sourceUrl = `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`;
      for (const id of titles.get(original) ?? []) {
        const into = found.get(id) ?? { planted: [], production: [] };
        if (figures.planted !== null)
          into.planted.push({ ...figures.planted, language, sourceUrl });
        if (figures.production !== null) {
          into.production.push({ ...figures.production, language, sourceUrl });
        }
        found.set(id, into);
      }
    }
    console.info(`  ${language}: ${Math.min(start + 50, all.length)} of ${all.length} articles.`);
  }
}

const preference = ["fr", "en", "es", "de"];
const yearOf = (figure: Found) => Number(/(\d{4})\D*$/.exec(figure.year ?? "")?.[1] ?? 0);
const best = (figures: Found[]) =>
  [...figures].sort(
    (one, other) =>
      yearOf(other) - yearOf(one) ||
      preference.indexOf(one.language) - preference.indexOf(other.language),
  )[0] ?? null;

const regions = Object.fromEntries(
  [...found]
    .map(
      ([id, figures]) =>
        [id, { planted: best(figures.planted), production: best(figures.production) }] as const,
    )
    .filter(([, figures]) => figures.planted !== null || figures.production !== null)
    .sort(([one], [other]) => one.localeCompare(other)),
);
writeFileSync(
  resolve("data/kb/region-figures.json"),
  `${JSON.stringify(
    {
      about:
        "Planted area (ha) and production (hl) of registered wine names, read from the infobox of the Wikipedia articles that describe them, with the line each came from and its year where the article gives one. Wikipedia text is CC BY-SA 4.0. Built by scripts/kb/fetch-region-figures.ts.",
      regions,
    },
    null,
    1,
  )}\n`,
);
const count = (field: "planted" | "production") =>
  Object.values(regions).filter((figures) => figures[field] !== null).length;
console.info(`Planted area for ${count("planted")} names, production for ${count("production")}.`);
