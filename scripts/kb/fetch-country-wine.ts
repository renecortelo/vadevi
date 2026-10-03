import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { wikimedia } from "./wikimedia";

/**
 * The country articles of English Wikipedia ("Greek wine", "Bulgarian wine"…),
 * full text, for the registered names no article of their own describes: a
 * sentence there that names one becomes its summary (see the atlas build).
 * Many of these countries' names have no article in any language the app
 * speaks, and these articles are where they are described at all.
 *
 * Usage: pnpm kb:fetch-country-wine
 */
const articles: Record<string, string[]> = {
  AT: ["Austrian wine"],
  BG: ["Bulgarian wine"],
  CY: ["Cypriot wine"],
  CZ: ["Czech wine"],
  DE: ["German wine"],
  GR: ["Greek wine", "Cretan wine"],
  HR: ["Croatian wine"],
  HU: ["Hungarian wine"],
  PT: ["Portuguese wine"],
  RO: ["Romanian wine"],
  SI: ["Slovenian wine"],
  SK: ["Slovak wine"],
};

const texts: Record<string, { text: string; title: string; url: string }[]> = {};
for (const [country, titles] of Object.entries(articles)) {
  for (const title of titles) {
    const body = await wikimedia<{
      query?: { pages?: { extract?: string; missing?: boolean; title: string }[] };
    }>(
      "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2" +
        `&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`,
    );
    const page = body.query?.pages?.[0];
    if (page === undefined || page.missing === true || page.extract === undefined) continue;
    (texts[country] ??= []).push({
      text: page.extract,
      title: page.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
    });
  }
}
writeFileSync(resolve(".kb-cache/appellations/country-wine.json"), JSON.stringify(texts));
console.info(
  Object.entries(texts)
    .map(([country, list]) => `${country}: ${list.map((entry) => entry.title).join(", ")}`)
    .join("; "),
);
