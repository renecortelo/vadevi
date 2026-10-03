import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { type TopicEntry } from "./appellation-names";
import { summaryOf } from "./grape-validation";

/**
 * Styles and methods, step two: `data/kb/topics.json`, one entry per topic
 * with its names, the aliases readers use, and an explanation in each
 * language from its Wikipedia lead.
 *
 * Usage: pnpm kb:build-topics
 */
type Include = {
  aliases?: Record<string, string[]>;
  category: TopicEntry["category"];
  id: string;
  source: string;
};
const { topics } = JSON.parse(readFileSync(resolve("data/kb/topics-include.json"), "utf8")) as {
  topics: Include[];
};

// Where a language has no wine-specific article, a faithful translation of
// one that does, marked as such (`data/kb/topic-translations.json`).
const translations = JSON.parse(
  readFileSync(resolve("data/kb/topic-translations.json"), "utf8"),
) as Record<string, { from: string; sourceUrl: string; texts: Record<string, string> } | string>;

const entries: TopicEntry[] = [];
for (const topic of topics) {
  const path = resolve(".kb-cache/topics", `${topic.id}.json`);
  if (!existsSync(path)) {
    console.warn(`  ${topic.id}: not fetched yet; skipped.`);
    continue;
  }
  const cached = JSON.parse(readFileSync(path, "utf8")) as {
    aliases: Record<string, { value: string }[]>;
    labels: Record<string, { value: string }>;
    leads: Record<string, { lead: string; title: string }>;
    qid: string;
    sitelinks: number;
  };
  const summaries: TopicEntry["summaries"] = {};
  for (const [locale, { lead, title }] of Object.entries(cached.leads)) {
    const text = summaryOf(lead, 900, 3);
    if (text === null) continue;
    summaries[locale] = {
      text,
      url: `https://${locale}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
    };
  }
  const translation = translations[topic.id];
  if (translation !== undefined && typeof translation !== "string") {
    for (const [locale, text] of Object.entries(translation.texts)) {
      // Stored under Wikipedia's language codes, as the leads are.
      const key = locale === "pt-PT" ? "pt" : locale;
      summaries[key] = {
        text,
        translated: locale !== translation.from,
        url: translation.sourceUrl,
      };
    }
  }
  if (Object.keys(summaries).length === 0) {
    console.warn(`  ${topic.id}: no explanation in any language; skipped.`);
    continue;
  }
  const names: TopicEntry["names"] = {};
  for (const [locale, label] of Object.entries(cached.labels)) {
    // Wikidata labels are often lowercase ("natural wine"); a title is not.
    names[locale] = label.value.charAt(0).toLocaleUpperCase(locale) + label.value.slice(1);
  }
  entries.push({
    aliases: [
      // Wikidata's aliases include identifiers ("GO:0043464") and formulas;
      // only names a reader would say are kept.
      ...Object.entries(cached.aliases).flatMap(([locale, list]) =>
        list
          .map((alias) => ({ locale, name: alias.value }))
          .filter(({ name }) => !/[:\d=_]/.test(name) && name.length <= 60),
      ),
      ...Object.entries(topic.aliases ?? {}).flatMap(([locale, list]) =>
        list.map((name) => ({ locale, name })),
      ),
    ],
    category: topic.category,
    id: topic.id,
    names,
    prominence: cached.sitelinks,
    summaries,
    wikidataId: cached.qid,
  });
}

writeFileSync(resolve("data/kb/topics.json"), `${JSON.stringify(entries, null, 2)}\n`);
console.info(
  `${entries.length} topics: ${entries.filter((entry) => entry.summaries.es !== undefined).length} explained in Spanish, ` +
    `${entries.filter((entry) => entry.summaries.ca !== undefined).length} in Catalan.`,
);
