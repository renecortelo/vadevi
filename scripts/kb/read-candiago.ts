import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { matchKey } from "./appellation-names";

/**
 * The varieties of the EU's wine PDOs in Candiago et al., «A geospatial
 * inventory of regulatory information for wine protected designations of origin
 * in Europe», Scientific Data 9 (2022), from its dataset as downloaded into
 * `.kb-cache/candiago/` (`PDO_EU_id.csv`, CC0, read as of November 2021).
 *
 * A name is matched by the file number the EU register gives it, or else by the
 * name itself, any of the forms a slash separates. Only names with no grape yet
 * are kept: everywhere else the register's own single document says more.
 *
 * Usage: pnpm kb:read-candiago
 */
type Row = { Country: string; PDOid: string; PDOnam: string; Varieties: string[] };

/** One CSV record per line of the file, quoted fields included. */
function records(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let at = 0; at < text.length; at += 1) {
    const character = text[at]!;
    if (quoted) {
      if (character !== '"') field += character;
      else if (text[at + 1] === '"') {
        field += '"';
        at += 1;
      } else quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      rows.push([...row, field.replace(/\r$/, "")]);
      row = [];
      field = "";
    } else field += character;
  }
  return rows;
}

const [header, ...lines] = records(
  readFileSync(resolve(".kb-cache/candiago/PDO_EU_id.csv"), "utf8").replace(/^[^A-Z]+/, ""),
);
const column = (name: string) => header!.indexOf(name);
const given = (value: string | undefined) =>
  (value ?? "")
    .split("/")
    // The OIV's berry colour follows the name: «Chardonnay B», «Bobal N».
    .map((name) => name.trim().replace(/\s(?:B|N|G|Rs|Rg)$/, ""))
    .filter((name) => name.length > 0 && name !== "na");
const pdos: Row[] = lines.map((line) => ({
  Country: line[column("Country")]!,
  PDOid: line[column("PDOid")]!,
  PDOnam: line[column("PDOnam")]!,
  Varieties: [...given(line[column("Varieties_OIV")]), ...given(line[column("Varieties_Other")])],
}));

const fileNumbers = new Map<string, string>();
const register = JSON.parse(
  readFileSync(resolve(".kb-cache/appellations/eambrosia.json"), "utf8"),
) as { appUniqueId: string }[];
for (const record of register) {
  const number = /PDO-[A-Z]{2}-[A-Z]?\d+/.exec(JSON.stringify(record))?.[0];
  if (number !== undefined) fileNumbers.set(record.appUniqueId, number);
}
const byNumber = new Map(pdos.map((pdo) => [pdo.PDOid, pdo]));
const byName = new Map(
  pdos.flatMap((pdo) =>
    pdo.PDOnam.split("/").map((name): [string, Row] => [
      `${pdo.Country}:${matchKey(name.trim())}`,
      pdo,
    ]),
  ),
);

const entries = JSON.parse(readFileSync(resolve("data/kb/appellations.json"), "utf8")) as {
  countryCode: string;
  eambrosiaId?: string | null;
  giType: string;
  grapes: { by?: string }[];
  id: string;
  name: string;
  register?: { grapes: unknown[] };
}[];
const regions: Record<string, { pdo: string; varieties: string[] }> = {};
for (const entry of entries) {
  if (entry.giType !== "PDO" || (entry.eambrosiaId ?? null) === null) continue;
  // Its own earlier links do not count: this runs on the built file.
  const others = entry.grapes.filter((grape) => grape.by !== "Candiago et al., 2022");
  if ((entry.register?.grapes.length ?? 0) > 0 || others.length > 0) continue;
  const pdo =
    byNumber.get(fileNumbers.get(entry.eambrosiaId!) ?? "") ??
    byName.get(`${entry.countryCode}:${matchKey(entry.name)}`);
  if (pdo === undefined || pdo.Varieties.length === 0) continue;
  regions[entry.id] = { pdo: pdo.PDOid, varieties: pdo.Varieties };
}
writeFileSync(
  resolve("data/kb/candiago-region-grapes.json"),
  `${JSON.stringify({ regions }, null, 2)}\n`,
);
console.info(`${Object.keys(regions).length} names with their varieties from Candiago et al.`);
