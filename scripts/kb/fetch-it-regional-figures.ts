import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { userAgent } from "./wikimedia";

/**
 * The vineyard area of Italian wine names from the two regions that publish
 * it by name as open data:
 *
 * - **Tuscany**: ARTEA's grape-harvest declarations («Artea - Raccolta Uva»,
 *   dati.toscana.it, CC BY 4.0), the latest year's: the area declared for
 *   each wine, summed over the wine's types («DOC MAREMMA TOSCANA
 *   SANGIOVESE…», «Chianti Classico Castellina») — each type goes to the
 *   longest registered name it begins with, so «Chianti Classico» never falls
 *   into «Chianti». Read through the portal's own query service, as the
 *   portal serves it.
 * - **Lombardy**: «Superfici rivendicate per la produzione vini DOC_DOCG_IGT»
 *   (dati.lombardia.it, CC0), the area claimed for each name at the 2013
 *   harvest.
 *
 * - **Umbria**: «Produzioni Certificate» (dati.regione.umbria.it, CC BY 4.0),
 *   the wine each name certified as fit for its DO («ettolitri vino idoneo»)
 *   in the latest year the table gives — its production as a DO, said as
 *   such; a name that certified none is left out.
 *
 * A name that spans another region (Colli di Luni with Liguria; Lugana, Garda
 * and San Martino della Battaglia with Veneto) takes none: one region's part
 * is not the name's area. Grapes in quintals are not wine, and are not used.
 *
 * Usage: pnpm kb:fetch-it-regional-figures
 */

type Entry = { countryCode: string; id: string; name: string; names?: { name: string }[] };
type Figure = {
  name: string;
  plantedHa: number;
  publisher: "artea" | "regione-lombardia";
  quote: string;
  sourceUrl: string;
  year: string;
};

const key = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const entries = (
  JSON.parse(readFileSync(resolve("data/kb/appellations.json"), "utf8")) as Entry[]
).filter((entry) => entry.countryCode === "IT");
const byName = new Map<string, Entry>();
for (const entry of entries) {
  for (const name of [entry.name, ...(entry.names ?? []).map((one) => one.name)]) {
    const plain = key(name.replace(/\s+(?:DOCG?|IGT|IGP)$/i, ""));
    if (!byName.has(plain)) byName.set(plain, entry);
  }
}
const interregional = new Set([
  "it-colli-di-luni",
  "it-garda",
  "it-lugana",
  "it-san-martino-della-battaglia",
]);

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { "User-Agent": userAgent } });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as T;
}

const figures: Record<string, Figure> = {};
const hectares = (value: number) => Math.round(value * 100) / 100;
const comma = (value: number) => String(hectares(value)).replace(".", ",");

// Tuscany: the newest year of harvest declarations the dataset lists.
const toscana = "https://dati.toscana.it/api/3/action";
const dataset = await json<{
  result: { resources: { id: string; name: string; url: string }[] };
}>(`${toscana}/package_show?id=artea-raccolta-uva-dal-2004`);
const yearly = dataset.result.resources
  .map((resource) => ({ ...resource, year: /(\d{4})\.csv$/i.exec(resource.url)?.[1] }))
  .filter((resource) => resource.year !== undefined)
  .sort((one, other) => Number(other.year) - Number(one.year))[0];
if (yearly === undefined) throw new Error("No yearly harvest resource on dati.toscana.it");
const harvest = await json<{ result: { records: { Vino: string; sup: string }[] } }>(
  `${toscana}/datastore_search_sql?${new URLSearchParams({
    sql: `SELECT "Vino", sum("SUP"::numeric) AS sup FROM "${yearly.id}" GROUP BY "Vino"`,
  })}`,
);
const aliases: [RegExp, string][] = [
  [/^nobile pieve /, "vino nobile di montepulciano"],
  [/^(?:bianco o bianco vergine )?valdichiana /, "valdichiana toscana"],
  [/^vin santo montepulciano/, "vin santo di montepulciano"],
];
const tuscan = new Map<string, { entry: Entry; lines: { area: number; wine: string }[] }>();
for (const { Vino: wine, sup } of harvest.result.records) {
  let plain = key(wine)
    .replace(/^(?:doc|docg|igt) /, "")
    .replace(/^toscano o toscana\b/, "toscano");
  for (const [pattern, name] of aliases) if (pattern.test(plain)) plain = name;
  let best: string | null = null;
  for (const name of byName.keys()) {
    if ((plain === name || plain.startsWith(`${name} `)) && name.length > (best?.length ?? 0)) {
      best = name;
    }
  }
  if (best === null) continue;
  const entry = byName.get(best)!;
  if (interregional.has(entry.id)) continue;
  const into = tuscan.get(entry.id) ?? { entry, lines: [] };
  into.lines.push({ area: Number(sup) / 10_000, wine: wine.trim() });
  tuscan.set(entry.id, into);
}
for (const [id, { entry, lines }] of tuscan) {
  const total = lines.reduce((sum, line) => sum + line.area, 0);
  if (total <= 0) continue;
  lines.sort((one, other) => other.area - one.area);
  const shown = lines.slice(0, 4).map((line) => `«${line.wine}» ${comma(line.area)} ha`);
  const more = lines.length > 4 ? `; e altre ${lines.length - 4} tipologie` : "";
  figures[id] = {
    name: entry.name,
    plantedHa: hectares(total),
    publisher: "artea",
    quote: `Superficie dichiarata alla raccolta uva ${yearly.year}: ${shown.join("; ")}${more} — in tutto ${comma(total)} ha`,
    sourceUrl: "https://dati.toscana.it/dataset/artea-raccolta-uva-dal-2004",
    year: yearly.year!,
  };
}

// Lombardy: the 2013 harvest, the newest the table gives.
const lombardia = await fetch(
  "https://www.dati.lombardia.it/api/views/gp6s-ezv4/rows.csv?accessType=DOWNLOAD",
  { headers: { "User-Agent": userAgent } },
);
if (!lombardia.ok) throw new Error(`dati.lombardia.it: ${lombardia.status}`);
const [header, ...rows] = (await lombardia.text()).trim().split(/\r?\n/);
const columns = header!.split(",");
const area2013 = columns.indexOf("SUPERFICIE_RIVENDICATA_VENDEMMIA_2013_HA");
for (const row of rows) {
  // No name in the table has a comma of its own.
  const cells = row.split(",");
  const name = cells[0]!.replace(/^"|"$/g, "");
  if (/PROVVISORI/i.test(name)) continue;
  const amount = Number(cells[area2013]);
  if (!Number.isFinite(amount) || amount <= 0) continue;
  const candidates = [name, ...name.split(/\s+O\s+/)].map(key);
  if (key(name) === "colleoni") candidates.push("terre del colleoni");
  const entry = candidates.map((one) => byName.get(one)).find(Boolean);
  if (entry === undefined || interregional.has(entry.id) || figures[entry.id] !== undefined) {
    continue;
  }
  figures[entry.id] = {
    name: entry.name,
    plantedHa: amount,
    publisher: "regione-lombardia",
    quote: `${name} — SUPERFICIE_RIVENDICATA_VENDEMMIA_2013_HA: ${cells[area2013]}`,
    sourceUrl:
      "https://www.dati.lombardia.it/Agricoltura/Superfici-rivendicate-per-la-produzione-vini-DOC_D/gp6s-ezv4",
    year: "2013",
  };
}

// Umbria: each wine's latest year of certified wine.
type Certified = { ANNO: number; ETTOLITRI_VINO_IDONEO: string; VINO: string };
const umbriaApi = "https://dati.regione.umbria.it/api/3/action";
const umbriaDataset = await json<{ result: { resources: { id: string; name: string }[] } }>(
  `${umbriaApi}/package_show?id=produzioni_certificate`,
);
const wines = umbriaDataset.result.resources.find((resource) =>
  /^VINI_DOC_IGT/i.test(resource.name),
);
if (wines === undefined) throw new Error("No VINI_DOC_IGT resource on dati.regione.umbria.it");
const umbria = await json<{ result: { records: Certified[] } }>(
  `${umbriaApi}/datastore_search?resource_id=${wines.id}&limit=1000`,
);
const latest = new Map<string, Certified>();
for (const record of umbria.result.records) {
  const known = latest.get(record.VINO);
  if (known === undefined || record.ANNO > known.ANNO) latest.set(record.VINO, record);
}
const production: Record<
  string,
  { amountHl: number; publisher: "regione-umbria"; quote: string; sourceUrl: string; year: string }
> = {};
for (const [wine, record] of latest) {
  const entry = byName.get(key(wine));
  const amount = Number(record.ETTOLITRI_VINO_IDONEO.replace(",", "."));
  if (entry === undefined || interregional.has(entry.id) || !(amount > 0)) continue;
  production[entry.id] = {
    amountHl: Math.round(amount),
    publisher: "regione-umbria",
    quote: `${wine} — ETTOLITRI_VINO_IDONEO ${record.ANNO}: ${record.ETTOLITRI_VINO_IDONEO}`,
    sourceUrl: "https://dati.regione.umbria.it/dataset/produzioni_certificate",
    year: String(record.ANNO),
  };
}

writeFileSync(
  resolve("data/kb/it-regional-figures.json"),
  `${JSON.stringify(
    {
      about:
        "Vineyard area (ha) of Italian wine names from the regions that publish it by name as open data: Tuscany, the area declared at the latest grape harvest (ARTEA «Raccolta Uva», dati.toscana.it, CC BY 4.0, credited «Fonte: ARTEA – Regione Toscana»), summed over each name's types; Lombardy, the area claimed at the 2013 harvest («Superfici rivendicate per la produzione vini DOC_DOCG_IGT», dati.lombardia.it, CC0). Umbria (under «production»), the wine each name certified as fit for its DO in the latest year («Produzioni Certificate», dati.regione.umbria.it, CC BY 4.0). Names that span another region take none. Built by scripts/kb/fetch-it-regional-figures.ts.",
      production: Object.fromEntries(
        Object.entries(production).sort(([one], [other]) => one.localeCompare(other)),
      ),
      regions: Object.fromEntries(
        Object.entries(figures).sort(([one], [other]) => one.localeCompare(other)),
      ),
    },
    null,
    1,
  )}\n`,
);
const count = (publisher: Figure["publisher"]) =>
  Object.values(figures).filter((figure) => figure.publisher === publisher).length;
console.info(
  `Vineyard area for ${count("artea")} Tuscan names (${yearly.year}) and ${count("regione-lombardia")} Lombard ones (2013); certified wine for ${Object.keys(production).length} Umbrian ones.`,
);
