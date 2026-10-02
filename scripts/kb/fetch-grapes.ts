import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Step one of the wine library: gather the open material for each grape.
 *
 * Wikidata says which items are grape varieties (Q958314), ranks them by how
 * many Wikipedias carry an article (a fair proxy for how much a reader will
 * meet them), and gives their names in the eight locales the app speaks.
 * Wikipedia gives the prose the later steps extract from — the full English
 * article, and the lead paragraph in each locale that has one.
 *
 * Everything lands in `.kb-cache/grapes/<qid>.json`, outside Git: it is raw
 * third-party text (Wikipedia is CC BY-SA 4.0), kept only to extract from and
 * to quote. What ships is the validated output of the next step.
 *
 * Usage: pnpm kb:fetch-grapes [--limit 160]
 */

const userAgent =
  "VaDeVi-kb-builder/0.1 (https://github.com/renecortelo/vadevi; library build, run by hand)";
const locales = ["en", "es", "ca", "fr", "de", "it", "nl", "pt"] as const;
const cacheDirectory = resolve(".kb-cache/grapes");

const limitFlag = process.argv.indexOf("--limit");
const limit = limitFlag === -1 ? 160 : Number(process.argv[limitFlag + 1]);

type WikidataEntity = {
  aliases?: Record<string, { value: string }[]>;
  claims?: Record<string, { mainsnak: { datavalue?: { value: unknown } } }[]>;
  id: string;
  labels?: Record<string, { value: string }>;
  sitelinks?: Record<string, { title: string }>;
};

async function getJson<T>(url: string): Promise<T> {
  // A polite pace: Wikimedia throttles bursts, and this is a one-off build.
  await new Promise((settle) => setTimeout(settle, 250));
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

async function topGrapes(count: number): Promise<{ qid: string; sitelinks: number }[]> {
  const query = `SELECT ?v ?links WHERE { ?v wdt:P31 wd:Q958314 ; wikibase:sitelinks ?links . } ORDER BY DESC(?links) LIMIT ${count}`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const body = await getJson<{
    results: { bindings: { links: { value: string }; v: { value: string } }[] };
  }>(url);
  return body.results.bindings.map((binding) => ({
    qid: binding.v.value.split("/").at(-1)!,
    sitelinks: Number(binding.links.value),
  }));
}

async function entities(ids: string[]): Promise<Record<string, WikidataEntity>> {
  const all: Record<string, WikidataEntity> = {};
  for (let start = 0; start < ids.length; start += 50) {
    const batch = ids.slice(start, start + 50).join("|");
    const url =
      "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json" +
      `&props=labels|aliases|sitelinks|claims&languages=${locales.join("|")}&ids=${batch}`;
    const body = await getJson<{ entities: Record<string, WikidataEntity> }>(url);
    Object.assign(all, body.entities);
  }
  return all;
}

/** ISO 3166-1 alpha-2 for each country item, from its P297 claim. */
async function countryCodes(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  const found = await entities(unique);
  const codes: Record<string, string> = {};
  for (const [id, entity] of Object.entries(found)) {
    const code = entity.claims?.P297?.[0]?.mainsnak.datavalue?.value;
    if (typeof code === "string") codes[id] = code.toUpperCase();
  }
  return codes;
}

async function wikipediaText(locale: string, title: string, full: boolean): Promise<string | null> {
  const url =
    `https://${locale}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2` +
    `&prop=extracts&explaintext=1&redirects=1${full ? "" : "&exintro=1"}` +
    `&titles=${encodeURIComponent(title)}`;
  const body = await getJson<{ query?: { pages?: { extract?: string; missing?: boolean }[] } }>(
    url,
  );
  const page = body.query?.pages?.[0];
  if (page === undefined || page.missing === true || page.extract === undefined) return null;
  return page.extract.trim();
}

/**
 * The grapes the library must carry whatever their prominence, by name: the
 * item a name resolves to is the first grape-variety item Wikidata's search
 * returns for it, in English, then Spanish, Catalan or Portuguese.
 */
async function included(): Promise<{ qid: string; sitelinks: number }[]> {
  const path = resolve("data/kb/grapes-include.txt");
  if (!existsSync(path)) return [];
  const names = [
    ...new Set(
      readFileSync(path, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#")),
    ),
  ];
  const found: { qid: string; sitelinks: number }[] = [];
  for (const name of names) {
    let qid: string | null = null;
    for (const language of ["en", "es", "ca", "pt"]) {
      const search = await getJson<{ search: { id: string }[] }>(
        `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&limit=7` +
          `&language=${language}&search=${encodeURIComponent(name)}`,
      );
      const ids = search.search.map((result) => result.id);
      if (ids.length === 0) continue;
      const candidates = await entities(ids);
      qid =
        ids.find((id) =>
          (candidates[id]?.claims?.P31 ?? []).some(
            (claim) =>
              (claim.mainsnak.datavalue?.value as { id?: string } | undefined)?.id === "Q958314",
          ),
        ) ?? null;
      if (qid !== null) break;
    }
    if (qid === null) {
      console.warn(`  "${name}": no grape-variety item found on Wikidata.`);
      continue;
    }
    const sitelinks = Object.keys((await entities([qid]))[qid]?.sitelinks ?? {}).length;
    found.push({ qid, sitelinks });
  }
  return found;
}

mkdirSync(cacheDirectory, { recursive: true });
const required = await included();
const ranked = [
  ...required,
  ...(await topGrapes(limit)).filter((entry) => !required.some((item) => item.qid === entry.qid)),
];
const found = await entities(ranked.map((entry) => entry.qid));
const originIds = Object.values(found).flatMap(
  (entity) =>
    entity.claims?.P495?.flatMap((claim) => {
      const value = claim.mainsnak.datavalue?.value as { id?: string } | undefined;
      return value?.id === undefined ? [] : [value.id];
    }) ?? [],
);
const codes = await countryCodes(originIds);

let written = 0;
for (const { qid, sitelinks } of ranked) {
  const path = resolve(cacheDirectory, `${qid}.json`);
  if (existsSync(path)) {
    written += 1;
    continue;
  }
  const entity = found[qid];
  if (entity === undefined) continue;
  const labels: Record<string, string> = {};
  const aliases: Record<string, string[]> = {};
  const leads: Record<string, string> = {};
  const titles: Record<string, string> = {};
  for (const locale of locales) {
    const label = entity.labels?.[locale]?.value;
    if (label !== undefined) labels[locale] = label;
    aliases[locale] = (entity.aliases?.[locale] ?? []).map((alias) => alias.value);
    const title = entity.sitelinks?.[`${locale}wiki`]?.title;
    if (title === undefined) continue;
    titles[locale] = title;
    // A lead that will not come is a missing translation, not a failed run.
    const lead = await wikipediaText(locale, title, false).catch(() => null);
    if (lead !== null) leads[locale] = lead;
  }
  const article = titles.en === undefined ? null : await wikipediaText("en", titles.en, true);
  const origin = (entity.claims?.P495 ?? []).flatMap((claim) => {
    const value = claim.mainsnak.datavalue?.value as { id?: string } | undefined;
    const code = value?.id === undefined ? undefined : codes[value.id];
    return code === undefined ? [] : [code];
  });
  writeFileSync(
    path,
    JSON.stringify(
      {
        aliases,
        article,
        fetchedAt: new Date().toISOString(),
        labels,
        leads,
        qid,
        sitelinks,
        titles,
        wikidataOrigin: origin,
      },
      null,
      2,
    ),
  );
  written += 1;
  if (written % 10 === 0) console.info(`  ${written} of ${ranked.length}`);
}

const index = ranked
  .map((entry) => entry.qid)
  .filter((qid) => existsSync(resolve(cacheDirectory, `${qid}.json`)));
writeFileSync(resolve(cacheDirectory, "index.json"), JSON.stringify(index, null, 2));
console.info(`Cached ${index.length} grapes in ${cacheDirectory}.`);
