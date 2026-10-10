import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { RegionEntry } from "./appellation-names";
import { cellarAddress } from "./fetch-appellation-areas";
import { journalLanguages, type JournalLocale, linkSummary } from "./register-links";

/**
 * A summary, in seven languages, for every registered wine name no
 * encyclopedia describes: the opening of the link with the geographical area
 * from its single document, as the Official Journal publishes it in each
 * language. The Union translates the Journal itself, so nothing here is
 * translated by us.
 *
 * Usage: pnpm kb:fetch-register-links — cached, so a second run reads
 * nothing it has read before; writes data/kb/register-summaries.json.
 */
const userAgent =
  "VaDeVi-kb-builder/0.1 (https://github.com/renecortelo/vadevi; library build, run by hand)";
const register = resolve(".kb-cache/appellations/register");
const journal = resolve(".kb-cache/appellations/journal");
mkdirSync(journal, { recursive: true });

type Publication = { date?: string; text: string; uri: string };
type Summaries = Record<
  string,
  { summaries: Record<string, { text: string; url: string }>; uri: string }
>;

/** The same publication on EUR-Lex, in another language. */
export function eurLexUrl(uri: string, locale: JournalLocale): string {
  const two = locale === "pt-PT" ? "PT" : locale.toUpperCase();
  const three = journalLanguages[locale].toUpperCase();
  const eli = /data\.europa\.eu\/eli\/(C\/\d{4}\/\d+\/oj)/.exec(uri);
  if (eli !== null) return `https://eur-lex.europa.eu/eli/${eli[1]}/${three.toLowerCase()}`;
  return uri
    .replace("http://", "https://")
    .replace(/\/legal-content\/[A-Z]{2}\//, `/legal-content/${two}/`)
    .replace(/\.(ENG|EN)(?=&|$)/, `.${three}`);
}

let last = 0;
async function read(uri: string, locale: JournalLocale): Promise<string | null> {
  const key = uri.replace(/[^A-Za-z0-9]+/g, "_").slice(-120);
  const path = resolve(journal, `${key}.${journalLanguages[locale]}.txt`);
  if (existsSync(path)) return readFileSync(path, "utf8");
  const english = cellarAddress(uri);
  if (english === null) return null;
  const three = journalLanguages[locale];
  // A uriserv address names its language; the others are negotiated.
  const address = english.replace(/\.ENG$/, `.${three.toUpperCase()}`);
  await new Promise((settle) => setTimeout(settle, Math.max(0, last + 1_100 - Date.now())));
  last = Date.now();
  let response: Response;
  try {
    response = await fetch(address, {
      headers: {
        Accept: "application/xhtml+xml",
        "Accept-Language": three,
        "User-Agent": userAgent,
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    writeFileSync(path, "");
    return null;
  }
  const text = (await response.text())
    .replace(/<\/(p|div|tr|li|h\d)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n\s*\n+/g, "\n");
  writeFileSync(path, text);
  return text;
}

async function main() {
  const entries = JSON.parse(
    readFileSync(resolve("data/kb/appellations.json"), "utf8"),
  ) as RegionEntry[];
  const output = resolve("data/kb/register-summaries.json");
  const found: Summaries = existsSync(output)
    ? (JSON.parse(readFileSync(output, "utf8")) as Summaries)
    : {};
  const wanted = entries.filter(
    (entry) => Object.keys(entry.summaries).length === 0 || found[entry.eambrosiaId] !== undefined,
  );
  let done = 0;
  for (const entry of wanted) {
    done += 1;
    if (done % 25 === 0) console.info(`  ${done} of ${wanted.length}`);
    if (found[entry.eambrosiaId] !== undefined) continue;
    const recordPath = resolve(register, `${entry.eambrosiaId}.json`);
    if (!existsSync(recordPath)) continue;
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as { publications?: Publication[] };
    // Newest first: the single document as it now stands.
    const publications = (record.publications ?? [])
      .filter((publication) => /^Of+icial Journal C/.test(publication.text))
      .sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""));
    for (const publication of publications) {
      const english = await read(publication.uri, "en");
      const opening = english === null ? null : linkSummary(english, "en");
      if (opening === null) continue;
      const summaries: Summaries[string]["summaries"] = {
        en: { text: opening, url: eurLexUrl(publication.uri, "en") },
      };
      for (const locale of Object.keys(journalLanguages) as JournalLocale[]) {
        if (locale === "en") continue;
        const text = await read(publication.uri, locale);
        const summary = text === null ? null : linkSummary(text, locale);
        if (summary !== null)
          summaries[locale] = { text: summary, url: eurLexUrl(publication.uri, locale) };
      }
      found[entry.eambrosiaId] = { summaries, uri: publication.uri };
      writeFileSync(output, `${JSON.stringify(found, null, 2)}\n`);
      break;
    }
  }
  const languages = Object.values(found).map((entry) => Object.keys(entry.summaries).length);
  console.info(
    `${Object.keys(found).length} names described from the Official Journal; ` +
      `${languages.filter((count) => count === 7).length} in all seven languages.`,
  );
}

if (process.argv[1]?.endsWith("fetch-register-links.ts")) await main();
