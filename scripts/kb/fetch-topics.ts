import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { wikimedia } from "./wikimedia";

/**
 * Styles and methods, step one: each topic in `data/kb/topics-include.json`
 * resolved to its Wikidata item, with its names and aliases in eight
 * languages and its Wikipedia lead in each. No model is involved.
 *
 * Usage: pnpm kb:fetch-topics
 */
const locales = ["en", "es", "ca", "fr", "de", "it", "nl", "pt"] as const;
const cache = resolve(".kb-cache/topics");
mkdirSync(cache, { recursive: true });

type Include = {
  aliases?: Record<string, string[]>;
  /** By language, an article to read instead of the one Wikidata links. */
  articles?: Record<string, string>;
  category: string;
  id: string;
  source: string;
};
const { topics } = JSON.parse(readFileSync(resolve("data/kb/topics-include.json"), "utf8")) as {
  topics: Include[];
};

async function qidOf(source: string): Promise<string | null> {
  if (/^Q\d+$/.test(source)) return source;
  const [lang, ...rest] = source.split(":");
  const title = rest.join(":");
  const body = await wikimedia<{
    query?: { pages?: Record<string, { pageprops?: { wikibase_item?: string } }> };
  }>(
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageprops` +
      `&ppprop=wikibase_item&redirects=1&titles=${encodeURIComponent(title)}`,
  );
  return Object.values(body.query?.pages ?? {})[0]?.pageprops?.wikibase_item ?? null;
}

type Entity = {
  aliases?: Record<string, { value: string }[]>;
  labels?: Record<string, { value: string }>;
  sitelinks?: Record<string, { title: string }>;
};

for (const topic of topics) {
  const path = resolve(cache, `${topic.id}.json`);
  if (existsSync(path)) continue;
  const qid = await qidOf(topic.source);
  if (qid === null) {
    console.warn(`  ${topic.id}: ${topic.source} has no Wikidata item; skipped.`);
    continue;
  }
  const entity = (
    await wikimedia<{ entities: Record<string, Entity> }>(
      "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json" +
        `&props=labels|aliases|sitelinks&languages=${locales.join("|")}&ids=${qid}`,
    )
  ).entities[qid];
  const leads: Record<string, { lead: string; title: string }> = {};
  for (const locale of locales) {
    const title = topic.articles?.[locale] ?? entity?.sitelinks?.[`${locale}wiki`]?.title;
    if (title === undefined) continue;
    const body = await wikimedia<{ query?: { pages?: { extract?: string }[] } }>(
      `https://${locale}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2` +
        `&prop=extracts&explaintext=1&exintro=1&redirects=1&titles=${encodeURIComponent(title)}`,
    );
    const lead = body.query?.pages?.[0]?.extract?.trim();
    if (lead !== undefined && lead.length > 0) leads[locale] = { lead, title };
  }
  writeFileSync(
    path,
    JSON.stringify(
      {
        aliases: entity?.aliases ?? {},
        labels: entity?.labels ?? {},
        leads,
        qid,
        sitelinks: Object.keys(entity?.sitelinks ?? {}).length,
      },
      null,
      2,
    ),
  );
  console.info(`  ${topic.id}: ${qid}, ${Object.keys(leads).length} languages`);
}
