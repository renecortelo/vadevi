import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { matchKey } from "./appellation-names";
import { wikimedia } from "./wikimedia";

/**
 * The grapes a wine region's English Wikipedia infobox lists («Infobox wine
 * region», its `grapes` line), for registered names no register or article
 * sentence gives varieties for. Each name in the line is matched to a library
 * grape by the grape's own names in the eight languages or a fixed alias
 * («Shiraz», «Petite Sirah»); a name that is not one grape («Muscat»,
 * «Pinot») is left out. The line is kept as the quote, with a link.
 *
 * Usage: pnpm kb:fetch-region-infobox-grapes
 */
type Entry = {
  grapes: unknown[];
  id: string;
  register?: { grapes: unknown[] } | null;
  wikidataId: string | null;
};
type Grape = { id: string; names: Record<string, string> };

const entries = JSON.parse(readFileSync(resolve("data/kb/appellations.json"), "utf8")) as Entry[];
const grapes = JSON.parse(readFileSync(resolve("data/kb/grapes.json"), "utf8")) as Grape[];

// The library's names for each grape, and the aliases its articles use.
const byName = new Map<string, string>();
for (const grape of grapes) {
  for (const name of Object.values(grape.names)) {
    const key = matchKey(name);
    if (byName.has(key) && byName.get(key) !== grape.id) byName.set(key, "");
    else byName.set(key, grape.id);
  }
}
const aliases: Record<string, string> = {
  "petite sirah": "durif",
  "petite syrah": "durif",
  "pinot grigio": "pinot-gris",
  sauvignon: "sauvignon-blanc",
  semillon: "semillon",
  shiraz: "syrah",
  "white riesling": "riesling",
  "johannisberg riesling": "riesling",
  "fumé blanc": "sauvignon-blanc",
  "french colombard": "colombard",
  carignane: "carignan",
  mataro: "mourvedre",
  "tinta roriz": "tempranillo",
  "touriga franca": "touriga-francesa",
};
// Names that are a family or a colour, not one grape.
const ambiguous = new Set([
  "muscat",
  "moscato",
  "pinot",
  "malvasia",
  "cabernet",
  "riesling hybrids",
]);
const grapeOf = (name: string): string | null => {
  const key = matchKey(name.replace(/\s*\(.*?\)\s*/g, " "));
  if (key === "" || ambiguous.has(key)) return null;
  return aliases[key] ?? (byName.get(key) || null);
};

const wanting = entries.filter(
  (entry) =>
    entry.wikidataId !== null && entry.grapes.length === 0 && !entry.register?.grapes.length,
);
// Their English articles, from Wikidata.
const titles = new Map<string, string>();
for (let start = 0; start < wanting.length; start += 50) {
  const batch = wanting.slice(start, start + 50).map((entry) => entry.wikidataId!);
  const response = await wikimedia<{
    entities?: Record<string, { sitelinks?: Record<string, { title: string }> }>;
  }>(
    `https://www.wikidata.org/w/api.php?${new URLSearchParams({
      action: "wbgetentities",
      format: "json",
      ids: batch.join("|"),
      props: "sitelinks",
      sitefilter: "enwiki",
    })}`,
  );
  for (const [item, entity] of Object.entries(response.entities ?? {})) {
    const title = entity.sitelinks?.enwiki?.title;
    if (title !== undefined) titles.set(item, title);
  }
}

type Pages = {
  query?: {
    pages?: Record<string, { revisions?: { slots: { main: { "*": string } } }[]; title: string }>;
  };
};
const regions: Record<string, { grapes: string[]; quote: string; sourceUrl: string }> = {};
for (const entry of wanting) {
  const title = titles.get(entry.wikidataId!);
  if (title === undefined) continue;
  const response = await wikimedia<Pages>(
    `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
      action: "query",
      format: "json",
      prop: "revisions",
      redirects: "1",
      rvprop: "content",
      rvslots: "main",
      titles: title,
    })}`,
  );
  const page = Object.values(response.query?.pages ?? {})[0];
  const text = page?.revisions?.[0]?.slots.main["*"] ?? "";
  if (!/\{\{\s*Infobox wine region/i.test(text)) continue;
  const line = /^\s*\|\s*grapes\s*=([^\n]*)$/im.exec(text)?.[1];
  if (line === undefined) continue;
  // The line as a reader sees it: links by their text, no references.
  const plain = line
    .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>|<!--[\s\S]*?-->/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\{\{[^}]*\}\}|'''|''/g, "")
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/\s+/g, " ")
    .trim();
  const found = [
    ...new Set(
      plain
        .replace(/^.*?(?:such as|including|include|includes)\s+/i, "")
        .split(/,|;|\band\b|\bor\b|\//)
        .map((name) => grapeOf(name.replace(/\betc\.?$/i, "").trim()))
        .filter((grape): grape is string => grape !== null),
    ),
  ];
  if (found.length === 0) continue;
  regions[entry.id] = {
    grapes: found,
    quote: plain,
    sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent((page?.title ?? title).replaceAll(" ", "_"))}`,
  };
}

writeFileSync(
  resolve("data/kb/region-infobox-grapes.json"),
  `${JSON.stringify(
    {
      about:
        "Grapes a wine region's English Wikipedia infobox lists (its «grapes» line), for registered names no register or article sentence gives varieties for, each name matched to a library grape by the grape's own names or a fixed alias; a name that is not one grape («Muscat», «Pinot») is left out. The line is kept as the quote. Wikipedia text is CC BY-SA 4.0. Built by scripts/kb/fetch-region-infobox-grapes.ts.",
      regions: Object.fromEntries(
        Object.entries(regions).sort(([one], [other]) => one.localeCompare(other)),
      ),
    },
    null,
    1,
  )}\n`,
);
console.info(`Infobox grapes for ${Object.keys(regions).length} of ${wanting.length} names.`);
