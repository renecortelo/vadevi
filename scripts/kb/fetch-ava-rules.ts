import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { userAgent } from "./wikimedia";

/**
 * The Federal Register rule that established each American Viticultural Area
 * with no vineyard area yet, from govinfo.gov: a work of the US federal
 * government, in the public domain in the United States. Its preamble often
 * gives the acres of vineyards the petition counted — the figure
 * `data/kb/us-ava-figures.json` quotes, read by hand.
 *
 * The rule is found from the citation 27 CFR part 9 gives the AVA's section
 * («T.D. TTB-41, 71 FR 40400, July 17, 2006»). Only rules from 1994 on, which
 * govinfo serves as text; earlier ones exist only as the whole day's scanned
 * issue. A page shared by two rules may lead to the other one: then the day's
 * whole issue, as govinfo's bulk data gives it in XML, names the rule and its
 * document number, which is the rule's own page (the public API's
 * demonstration key was spent within the hour, 20 October 2026).
 *
 * Serial, one request at a time, each cached in `.kb-cache/us-fr/`.
 *
 * Usage: pnpm kb:fetch-ava-rules
 */

const cache = resolve(".kb-cache/us-fr");
mkdirSync(cache, { recursive: true });

const pause = (ms: number) => new Promise((settle) => setTimeout(settle, ms));

async function get(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await pause(1_500);
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (response.ok) return response;
    if (response.status === 429) await pause(60_000);
    else if (response.status < 500) return null;
  }
  return null;
}

const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();

const regulation = readdirSync(resolve(".kb-cache/world"))
  .filter((name) => /^27cfr9-.*\.xml$/.test(name))
  .sort()
  .at(-1);
if (regulation === undefined) throw new Error("No 27 CFR part 9 in .kb-cache/world.");
const xml = readFileSync(resolve(".kb-cache/world", regulation), "utf8");
const citationOf = new Map(
  [...xml.matchAll(/<DIV8 N="(9\.\d+)"[^>]*>([\s\S]*?)<\/DIV8>/g)].map((match) => [
    match[1]!,
    /<CITA[^>]*>([\s\S]*?)<\/CITA>/.exec(match[2]!)?.[1] ?? "",
  ]),
);

const regions = JSON.parse(readFileSync(resolve("data/kb/appellations.json"), "utf8")) as {
  countryCode: string;
  figures?: { planted: unknown } | null;
  id: string;
  legalUrl: string;
  name: string;
  names: { name: string }[];
}[];
const wanted = regions.filter((region) => region.countryCode === "US" && !region.figures?.planted);

const months: Record<string, string> = {
  Apr: "04",
  Aug: "08",
  Dec: "12",
  Feb: "02",
  Jan: "01",
  July: "07",
  June: "06",
  Mar: "03",
  May: "05",
  Nov: "11",
  Oct: "10",
  Sept: "09",
};

const found: { file: string; id: string; name: string; url: string }[] = [];
let skipped = 0;
for (const region of wanted) {
  const section = region.legalUrl.split("section-").at(-1)!;
  // The first citation is the rule that established it.
  const first = /(\d+) FR (\d+), (\w+)\.? (\d+), (\d{4})/.exec(citationOf.get(section) ?? "");
  if (first === null || Number(first[1]) < 59) {
    skipped += 1;
    continue;
  }
  const [, volume, page, month, day, year] = first;
  const file = resolve(cache, `${section}.htm`);
  const names = [region.name, ...region.names.map((entry) => entry.name)].map((name) =>
    name.toLowerCase(),
  );
  const isIt = (html: string) => names.some((name) => plain(html).includes(name));
  if (!existsSync(file)) {
    let url = `https://www.govinfo.gov/link/fr/${volume}/${page}?link-type=html`;
    let response = await get(url);
    let html = response === null ? "" : await response.text();
    if (response !== null) url = response.url;
    if (!isIt(html)) {
      // Another rule on the same page: the day's issue names it, and its
      // document number is its page.
      const date = `${year}-${months[month!] ?? "01"}-${day!.padStart(2, "0")}`;
      const issuePath = resolve(cache, "issues", `FR-${date}.xml`);
      mkdirSync(resolve(cache, "issues"), { recursive: true });
      if (!existsSync(issuePath)) {
        const issue = await get(
          `https://www.govinfo.gov/bulkdata/FR/${year}/${months[month!] ?? "01"}/FR-${date}.xml`,
        );
        if (issue !== null) writeFileSync(issuePath, await issue.text());
      }
      const issue = existsSync(issuePath) ? readFileSync(issuePath, "utf8") : "";
      const rule = [...issue.matchAll(/<RULE>([\s\S]*?)<\/RULE>/g)]
        .map((match) => match[1]!)
        .find((text) => {
          const subject = /<SUBJECT>([\s\S]*?)<\/SUBJECT>/.exec(text)?.[1] ?? "";
          return names.some((name) => plain(subject).includes(name));
        });
      const number = rule === undefined ? undefined : /FR Doc\.\s*([\dE-]+)/.exec(rule)?.[1];
      if (number !== undefined) {
        url = `https://www.govinfo.gov/content/pkg/FR-${date}/html/${number}.htm`;
        response = await get(url);
        html = response === null ? "" : await response.text();
      }
    }
    if (!isIt(html)) {
      console.warn(`  ${region.name}: no rule found at ${volume} FR ${page}`);
      continue;
    }
    writeFileSync(file, `<!-- ${url} -->\n${html}`);
  }
  const url = /^<!-- (\S+) -->/.exec(readFileSync(file, "utf8"))?.[1] ?? "";
  found.push({ file: `.kb-cache/us-fr/${section}.htm`, id: region.id, name: region.name, url });
}
writeFileSync(resolve(cache, "found.json"), `${JSON.stringify(found, null, 1)}\n`);
console.info(
  `${found.length} rules cached for ${wanted.length} AVAs without an area; ${skipped} established before 1994.`,
);
