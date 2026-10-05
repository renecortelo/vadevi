import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  type Citation,
  classicPairings,
  type PairingSourceId,
  pairingPrinciples,
  pairingSources,
  styleGrapeCitations,
} from "../../apps/api/src/adapters/pairing-knowledge";
import { wikimedia } from "./wikimedia";

/**
 * Every sentence the pairing rules stand on, found in its article word for
 * word — or the check fails and says which.
 *
 * The articles are fetched once as plain text and kept in
 * `.kb-cache/pairing/`; `--refresh` fetches them again, to see whether an
 * edit has taken a sentence away. Quotes from a grape's own article are
 * checked against the library, which already cites that article.
 *
 * Usage: pnpm kb:check-pairing-sources [--refresh]
 */

const cache = resolve(".kb-cache/pairing");
mkdirSync(cache, { recursive: true });
const refresh = process.argv.includes("--refresh");

/** Whitespace and quotation marks as typed, so a line break is not a difference. */
function plain(text: string): string {
  return text
    .replace(/[\u00a0\u202f\s]+/g, " ")
    .replace(/[“”«»]/g, '"')
    .trim();
}

async function article(id: PairingSourceId): Promise<string> {
  const path = resolve(cache, `${id}.txt`);
  if (!refresh && existsSync(path)) return readFileSync(path, "utf8");
  const { language, title } = pairingSources[id];
  const body = await wikimedia<{ query?: { pages?: { extract?: string; missing?: boolean }[] } }>(
    `https://${language}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2` +
      `&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`,
  );
  const page = body.query?.pages?.[0];
  if (page === undefined || page.missing === true || page.extract === undefined) {
    throw new Error(`${id}: no article "${title}" on ${language}.wikipedia.org`);
  }
  writeFileSync(path, page.extract);
  return page.extract;
}

const grapes = new Map(
  (JSON.parse(readFileSync("data/kb/grapes.json", "utf8")) as Array<{ id: string }>).map(
    (grape) => [grape.id, JSON.stringify(grape)],
  ),
);

const citations: Array<{ cite: Citation; where: string }> = [
  ...Object.entries(pairingPrinciples).map(([name, cite]) => ({
    cite,
    where: `principle ${name}`,
  })),
  ...classicPairings.map((classic) => ({
    cite: classic.cite,
    where: `classic ${classic.styles.join("/")} × ${classic.families.join("/")}`,
  })),
  ...Object.entries(styleGrapeCitations).flatMap(([style, entries]) =>
    entries.map((entry) => ({ cite: entry.cite, where: `${style}: ${entry.grapes.join(", ")}` })),
  ),
];

const texts = new Map<PairingSourceId, string>();
let missing = 0;
for (const { cite, where } of citations) {
  let haystack: string;
  if ("grape" in cite) {
    const grape = grapes.get(cite.grape);
    if (grape === undefined) {
      console.error(`✗ ${where}: no grape "${cite.grape}" in the library`);
      missing += 1;
      continue;
    }
    // The library stores its text as JSON; read it back as text.
    haystack = grape.replace(/\\"/g, '"');
  } else {
    if (!texts.has(cite.source)) texts.set(cite.source, await article(cite.source));
    haystack = texts.get(cite.source)!;
  }
  if (!plain(haystack).includes(plain(cite.quote))) {
    console.error(`✗ ${where}: not in its source — "${cite.quote.slice(0, 90)}…"`);
    missing += 1;
  }
}

console.log(
  `${citations.length - missing} of ${citations.length} citations found in ${texts.size} articles and the library.`,
);
if (missing > 0) process.exit(1);
