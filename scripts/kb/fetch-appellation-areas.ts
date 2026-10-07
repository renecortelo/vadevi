import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { matchKey, type RegionEntry } from "./appellation-names";
import { userAgent } from "./wikimedia";

/**
 * Where the register itself says a wine is made: the NUTS regions its single
 * document (the technical file each PDO and PGI was registered with) names
 * under "demarcated area". For the registered names Wikidata could not place,
 * or placed only by a town of the same name, `fetch-appellations.ts` reads
 * these regions to choose among places of the wine's name (the Naoussa in
 * Imathia, not the one on Paros) or, failing one, to give the region's own
 * approximate point.
 *
 * eAmbrosia answers each name's record (`gi-applications/id/…`) and serves its
 * documents as PDF attachments; the text is read with Ghostscript
 * (`gs -sDEVICE=txtwrite`), which must be installed. One request a second;
 * records, documents and their text are cached under
 * `.kb-cache/appellations/register/`, so a rerun asks only for what is new.
 * Writes `.kb-cache/appellations/nuts.json`; fetch and build again afterwards.
 *
 * Usage: pnpm kb:fetch-appellation-areas
 */
const api = "https://ec.europa.eu/geographical-indications-register/eambrosia-public-api/api/";
const cache = resolve(".kb-cache/appellations");
const folder = resolve(cache, "register");
mkdirSync(folder, { recursive: true });

let last = 0;
async function get(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((settle) => setTimeout(settle, Math.max(0, last + 1_100 - Date.now())));
    last = Date.now();
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (response.ok) return response;
    await new Promise((settle) => setTimeout(settle, 10_000 * (attempt + 1)));
  }
  throw new Error(`Failed after retries: ${url}`);
}

type RegisterRecord = {
  publications?: { date?: string; text: string; uri: string }[] | null;
  singleDocTechFile?: { text: string; uri: string }[] | null;
};

/**
 * The NUTS regions a technical file lists for its demarcated area, each code
 * with the name written after it ("GR121 Ημαθία"), most specific first: a
 * region whose code begins another listed one ("PT18" before "PT181") is the
 * larger one, and left out.
 */
export function nutsRegions(text: string, country: string): { code: string; name: string }[] {
  // Greece is "EL" in the register and in today's NUTS, "GR" in the older
  // files; the United Kingdom was "UK".
  const prefixes = new Set([country, country === "GR" ? "EL" : country]);
  const lines = text.split("\n");
  const found = new Map<string, string>();
  lines.forEach((line, index) => {
    if (!/NUTS/.test(line)) return;
    // The codes follow the heading, one per line, before the map's heading.
    for (const next of lines.slice(index, index + 25)) {
      for (const match of next.matchAll(
        /(?<![A-Z0-9])([A-Z]{2}[0-9A-Z]{0,3})\s+(\S[^\n]*?)\s*$/gm,
      )) {
        const code = match[1]!;
        // A bare country code ("CY", "LU") says only the country.
        if (prefixes.has(code.slice(0, 2)) && code.length > 2 && !found.has(code))
          found.set(code, match[2]!.trim());
      }
      if (
        next !== line &&
        /(?<!\p{L})(map|carte|Karte|mapa|mappa|kaart|χάρτης|harta|térkép|karta|mapy|zemljevid|zemljovid)(?!\p{L})/iu.test(
          next,
        )
      )
        break;
    }
  });
  const codes = [...found.keys()];
  return codes
    .filter((code) => !codes.some((other) => other !== code && other.startsWith(code)))
    .map((code) => ({ code, name: found.get(code)! }));
}

/**
 * A registered name's technical file as text, fetched once and cached: its
 * record, the PDF of its single document, and Ghostscript's reading of it.
 * Null where the register holds no document for the name.
 */
export async function readTechnicalFile(
  eambrosiaId: string,
): Promise<{ document: string; text: string } | null> {
  const recordPath = resolve(folder, `${eambrosiaId}.json`);
  if (!existsSync(recordPath)) {
    const response = await get(`${api}gi-applications/id/${eambrosiaId}`);
    writeFileSync(recordPath, await response.text());
  }
  const record = JSON.parse(readFileSync(recordPath, "utf8")) as RegisterRecord;
  const document = record.singleDocTechFile?.[0]?.uri;
  if (document === undefined) return null;
  const pdf = resolve(folder, `${document}.pdf`);
  const text = resolve(folder, `${document}.txt`);
  if (!existsSync(pdf)) {
    const response = await get(`${api}v1/attachments/${document}`);
    writeFileSync(pdf, new Uint8Array(await response.arrayBuffer()));
  }
  if (!existsSync(text)) {
    execFileSync("gs", [
      "-q",
      "-dNOPAUSE",
      "-dBATCH",
      "-sDEVICE=txtwrite",
      `-sOutputFile=${text}`,
      pdf,
    ]);
  }
  return { document, text: readFileSync(text, "utf8") };
}

/**
 * A registered name's single document as published in the Official Journal,
 * in English, for names the register holds no technical file for (those
 * registered or amended since 2019). Read through the Publications Office's
 * Cellar service, the machine-readable home of the same text EUR-Lex shows.
 * Cached as `oj-<id>.txt`, with the document's paragraphs as lines.
 */
export async function readOfficialJournal(
  eambrosiaId: string,
): Promise<{ text: string; url: string } | null> {
  const recordPath = resolve(folder, `${eambrosiaId}.json`);
  if (!existsSync(recordPath)) return null;
  const path = resolve(folder, `oj-${eambrosiaId}.txt`);
  const urlPath = resolve(folder, `oj-${eambrosiaId}.url`);
  if (existsSync(path)) {
    return {
      text: readFileSync(path, "utf8"),
      url: existsSync(urlPath) ? readFileSync(urlPath, "utf8").trim() : "",
    };
  }
  const record = JSON.parse(readFileSync(recordPath, "utf8")) as RegisterRecord;
  // Newest first: the single document as it now stands, or, where the latest
  // communication carries only an amendment, the one before it.
  const publications = (record.publications ?? [])
    .filter((entry) => /^Of+icial Journal C/.test(entry.text))
    .sort((left, right) => (right.date ?? "").localeCompare(left.date ?? ""));
  for (const publication of publications) {
    const cellar = cellarAddress(publication.uri);
    if (cellar === null) continue;
    await new Promise((settle) => setTimeout(settle, Math.max(0, last + 1_100 - Date.now())));
    last = Date.now();
    const response = await fetch(cellar, {
      headers: {
        Accept: "application/xhtml+xml",
        "Accept-Language": "eng",
        "User-Agent": userAgent,
      },
    });
    if (!response.ok) continue;
    const text = (await response.text())
      .replace(/<\/(p|div|tr|li|h\d)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n");
    if (!/Categories of grapevine products/i.test(text)) continue;
    writeFileSync(path, text);
    writeFileSync(urlPath, publication.uri);
    return { text, url: publication.uri };
  }
  return null;
}

/**
 * Where the Publications Office's Cellar serves an Official Journal text the
 * register links on EUR-Lex: by its "uriserv" identifier, its act number
 * (C/2023/1187), its ELI or its CELEX number.
 */
export function cellarAddress(uri: string): string | null {
  const decoded = decodeURIComponent(uri);
  const uriserv = /uri=uriserv:([^&]+)/.exec(decoded)?.[1];
  if (uriserv !== undefined) {
    // Some links end in "EN" rather than the "ENG" Cellar knows.
    return `http://publications.europa.eu/resource/uriserv/${uriserv.replace(/\.EN$/, ".ENG")}`;
  }
  const journal = /uri=OJ:(JOC_[\dA-Z_]+)/.exec(decoded)?.[1];
  if (journal !== undefined) return `http://publications.europa.eu/resource/oj/${journal}`;
  const act = /uri=OJ:(C_\d+)/.exec(decoded)?.[1];
  if (act !== undefined) return `http://publications.europa.eu/resource/oj/${act}`;
  const eli = /eli\/C\/(\d{4})\/(\d+)\/oj/.exec(decoded);
  if (eli !== null) {
    return `http://publications.europa.eu/resource/oj/C_${eli[1]}${eli[2]!.padStart(5, "0")}`;
  }
  const celex = /uri=CELEX:([^&]+)/.exec(decoded)?.[1];
  if (celex !== undefined) {
    const encoded = encodeURIComponent(celex).replace(/\(/g, "%28").replace(/\)/g, "%29");
    return `http://publications.europa.eu/resource/celex/${encoded}`;
  }
  return null;
}

async function main() {
  const regions = JSON.parse(
    readFileSync(resolve("data/kb/appellations.json"), "utf8"),
  ) as RegionEntry[];
  const wikidata = JSON.parse(readFileSync(resolve(cache, "wikidata.json"), "utf8")) as Record<
    string,
    { latitude: number | null; pointSource?: string | null }
  >;
  const nutsPath = resolve(cache, "nuts.json");
  const nuts = (existsSync(nutsPath) ? JSON.parse(readFileSync(nutsPath, "utf8")) : {}) as Record<
    string,
    { document: string; regions: { code: string; name: string }[] }
  >;
  let read = 0;
  for (const region of regions) {
    // The names Wikidata could not place, and those it placed by a town of
    // the same name, which the register's regions confirm or refute: the
    // rest have the wine's own point, or its own areas'.
    const known = wikidata[region.eambrosiaId];
    if (known?.latitude != null && known.pointSource !== "place") continue;
    if (matchKey(region.name).startsWith("alsace grand cru ")) continue;
    const file = await readTechnicalFile(region.eambrosiaId);
    if (file === null) continue;
    const { document, text } = file;
    nuts[region.eambrosiaId] = {
      document,
      regions: nutsRegions(text, region.countryCode),
    };
    read += 1;
    if (read % 20 === 0) {
      writeFileSync(nutsPath, JSON.stringify(nuts, null, 1));
      console.info(`  ${read} technical files read`);
    }
  }
  writeFileSync(nutsPath, JSON.stringify(nuts, null, 1));
  const found = Object.values(nuts).filter((entry) => entry.regions.length > 0).length;
  console.info(`${read} technical files read; ${found} name their NUTS regions.`);
}

if (process.argv[1]?.endsWith("fetch-appellation-areas.ts")) await main();
