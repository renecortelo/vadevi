import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Every name Wikidata gives each library grape, in every language: the
 * labels (the variety's own name there) and the aliases. Registers write
 * their varieties in the country's language — «Каберне совиньон», «Frankovka»,
 * «Rulandské šedé» — and the eight app languages do not hold those names, so
 * without them a register's variety stays unlinked to its card.
 *
 * Wikidata is CC0. Output: `data/kb/grape-wikidata-labels.json`, read by
 * `build-appellations.ts`, where the labels link like the grape's own names
 * and the aliases like its synonyms (with the same guards).
 *
 * Usage: pnpm kb:fetch-grape-labels (after kb:build-grapes)
 */

const userAgent =
  "VaDeVi-kb-builder/0.1 (https://github.com/renecortelo/vadevi; library build, run by hand)";

type Entity = {
  aliases?: Record<string, { value: string }[]>;
  labels?: Record<string, { value: string }>;
};

async function getJson<T>(url: string): Promise<T> {
  // A polite pace: Wikimedia throttles bursts, and this is a one-off build.
  await new Promise((settle) => setTimeout(settle, 1_000));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": userAgent },
    });
    if (response.ok) return (await response.json()) as T;
    // Wikimedia asks callers to back off on 429 and 5xx rather than retry hot.
    await new Promise((settle) => setTimeout(settle, 5_000 * (attempt + 1)));
  }
  throw new Error(`Failed after retries: ${url}`);
}

const grapes = JSON.parse(readFileSync(resolve("data/kb/grapes.json"), "utf8")) as {
  id: string;
  wikidataId: string | null;
}[];
const byQid = new Map(
  grapes.flatMap((grape) => (grape.wikidataId === null ? [] : [[grape.wikidataId, grape.id]])),
);
const qids = [...byQid.keys()].sort();
const out: Record<string, { aliases: string[]; labels: string[] }> = {};
for (let start = 0; start < qids.length; start += 50) {
  const url =
    "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|aliases" +
    `&ids=${qids.slice(start, start + 50).join("|")}`;
  const body = await getJson<{ entities: Record<string, Entity> }>(url);
  for (const [qid, entity] of Object.entries(body.entities)) {
    const id = byQid.get(qid);
    if (id === undefined) continue;
    const labels = [...new Set(Object.values(entity.labels ?? {}).map((label) => label.value))];
    const aliases = [
      ...new Set(
        Object.values(entity.aliases ?? {}).flatMap((list) => list.map((alias) => alias.value)),
      ),
    ].filter((alias) => !labels.includes(alias));
    out[id] = { aliases: aliases.sort(), labels: labels.sort() };
  }
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(
  resolve("data/kb/grape-wikidata-labels.json"),
  JSON.stringify(
    {
      $comment:
        "Each library grape's labels and aliases in every language, from Wikidata (CC0), by pnpm kb:fetch-grape-labels. Used only to link the varieties registers name to their cards.",
      grapes: sorted,
    },
    null,
    2,
  ) + "\n",
);
console.info(`Wrote the Wikidata names of ${Object.keys(sorted).length} grapes.`);
