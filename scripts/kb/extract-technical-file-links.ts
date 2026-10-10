import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { RegionEntry } from "./appellation-names";
import { fileLines, technicalFileLink } from "./technical-file-links";
import { languageOf, type Language } from "./translation-check";

/**
 * A summary, in its own language, for every registered wine name that neither
 * an encyclopedia nor the Official Journal describes: the opening of the link
 * with the geographical area in its technical file, as the register holds it
 * (`pnpm kb:fetch-register-documents` caches the files). Translations into the
 * app's languages are made from these, by hand, and checked against them
 * (`appellation-translations.json`).
 *
 * Usage: pnpm kb:extract-technical-file-links — reads only the cache; writes
 * data/kb/technical-file-summaries.json.
 */
const register = resolve(".kb-cache/appellations/register");
const api = "https://ec.europa.eu/geographical-indications-register/eambrosia-public-api/api/";

/** The languages a country files in; the text itself decides among several. */
const countryLanguages: Record<string, Language[]> = {
  AT: ["de"],
  BE: ["fr", "nl", "de"],
  BG: ["bg"],
  CY: ["el"],
  CZ: ["cs"],
  DE: ["de"],
  DK: ["da"],
  ES: ["es"],
  FR: ["fr"],
  GR: ["el"],
  HR: ["hr"],
  HU: ["hu"],
  IT: ["it"],
  LU: ["fr", "de"],
  MT: ["en"],
  NL: ["nl"],
  PT: ["pt"],
  RO: ["ro"],
  SI: ["sl"],
  SK: ["sk"],
};

export type TechnicalFileSummaries = Record<
  string,
  { document: string; language: Language; text: string; url: string }
>;

function main() {
  const entries = JSON.parse(
    readFileSync(resolve("data/kb/appellations.json"), "utf8"),
  ) as RegionEntry[];
  const journal = JSON.parse(
    readFileSync(resolve("data/kb/register-summaries.json"), "utf8"),
  ) as Record<string, unknown>;
  const found: TechnicalFileSummaries = {};
  let without = 0;
  for (const entry of entries) {
    // Only where neither an article (nor a translation of one) nor the
    // Journal says anything: the register's own texts carry its licence.
    const article = Object.values(entry.summaries).some((summary) => summary.license === undefined);
    if (article || journal[entry.eambrosiaId] !== undefined) continue;
    const recordPath = resolve(register, `${entry.eambrosiaId}.json`);
    if (!existsSync(recordPath)) continue;
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as {
      singleDocTechFile?: { uri: string }[];
    };
    const document = record.singleDocTechFile?.[0]?.uri;
    const pdf = resolve(register, `${document}.pdf`);
    if (document === undefined || !existsSync(pdf)) continue;
    const xml = resolve(register, `${document}.xml`);
    if (!existsSync(xml)) {
      execFileSync("gs", [
        "-q",
        "-dNOPAUSE",
        "-dBATCH",
        "-sDEVICE=txtwrite",
        "-dTextFormat=1",
        `-sOutputFile=${xml}`,
        pdf,
      ]);
    }
    const text = technicalFileLink(fileLines(readFileSync(xml, "utf8")));
    const candidates = countryLanguages[entry.countryCode];
    const language =
      text === null || candidates === undefined ? null : languageOf(text, candidates);
    if (text === null || language === null) {
      without += 1;
      continue;
    }
    found[entry.eambrosiaId] = {
      document,
      language,
      text,
      url: `${api}v1/attachments/${document}`,
    };
  }
  writeFileSync(
    resolve("data/kb/technical-file-summaries.json"),
    `${JSON.stringify(found, null, 2)}\n`,
  );
  console.info(
    `${Object.keys(found).length} names described from their technical file; ${without} without a usable link.`,
  );
}

if (process.argv[1]?.endsWith("extract-technical-file-links.ts")) main();
