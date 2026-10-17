import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { leadLanguages } from "./world-sources";

/**
 * The Wikipedia leads of the articles chosen by hand for names beyond the EU
 * (`data/kb/article-items.json`), in the library's languages, cached beside
 * the others. `pnpm kb:build-appellations` then describes each name by its
 * article where nothing else does.
 *
 * Usage: pnpm kb:fetch-article-items
 */
const path = resolve("data/kb/article-items.json");
if (existsSync(path)) {
  const { items } = JSON.parse(readFileSync(path, "utf8")) as {
    items: Record<string, { qid: string }>;
  };
  const qids = [...new Set(Object.values(items).map((item) => item.qid))];
  await leadLanguages(qids);
  console.info(`  Leads for ${qids.length} articles chosen by hand.`);
}
