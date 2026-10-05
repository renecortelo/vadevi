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

type RegisterRecord = { singleDocTechFile?: { text: string; uri: string }[] | null };

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
    const recordPath = resolve(folder, `${region.eambrosiaId}.json`);
    if (!existsSync(recordPath)) {
      const response = await get(`${api}gi-applications/id/${region.eambrosiaId}`);
      writeFileSync(recordPath, await response.text());
    }
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as RegisterRecord;
    const document = record.singleDocTechFile?.[0]?.uri;
    if (document === undefined) continue;
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
    nuts[region.eambrosiaId] = {
      document,
      regions: nutsRegions(readFileSync(text, "utf8"), region.countryCode),
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
