import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Portugal's wine production by name, from Statistics Portugal (INE), where
 * a name's ground can be read off its table without guessing.
 *
 * The INE publishes the wine its producers declared, in hectolitres, by the
 * municipality it was made in and by quality — with a PDO, with a PGI, with a
 * variety, or without — on dados.gov.pt under CC BY 4.0 (indicator 0012835).
 * A Portuguese PDO or PGI is drawn on municipalities and parishes, so the
 * municipalities' figures are its production only where:
 *
 * - its demarcated area, as its technical file in the EU register writes it,
 *   is whole districts, an autonomous region or a set of municipalities, and
 * - no other name of its kind (PDO or PGI) lies in those municipalities, so
 *   the PDO (or PGI) wine made there can only be its own.
 *
 * Setúbal and Palmela share their ground, as do Madeira and Madeirense, Óbidos
 * and Encostas d'Aire, Douro and Porto: none of them is read. A PDO's figure
 * is its wine and its fortified wine. The INE counts wine where it was made,
 * not where its grapes grew. A name the table shows none for takes none.
 *
 * Usage: pnpm kb:fetch-pt-production
 */
const indicator = "0012835";
const year = "2025";
const sourceUrl = `https://www.ine.pt/xurl/indx/${indicator}/PT`;

type Name = {
  /** The area, in the technical file's words, abridged. */
  area: string;
  kind: "PDO" | "PGI";
  /** Districts (by the INE's two-digit code), regions or municipalities. */
  places: {
    districts?: string[];
    except?: string[];
    municipalities?: string[];
    regions?: string[];
  };
};
const names: Record<string, Name> = {
  "pt-acores": { area: "todas as Ilhas do Arquipélago", kind: "PGI", places: { regions: ["200"] } },
  "pt-alentejano": {
    area: "todos os concelhos dos distritos de Beja, Évora e Portalegre",
    kind: "PGI",
    places: { districts: ["02", "07", "12"] },
  },
  "pt-alentejo": {
    area: "as sub-regiões, nos distritos de Beja, Évora e Portalegre (a única DOP desses distritos)",
    kind: "PDO",
    places: { districts: ["02", "07", "12"] },
  },
  "pt-algarve": { area: "todo o Distrito de Faro", kind: "PGI", places: { regions: ["150"] } },
  "pt-biscoitos": {
    area: "no concelho da Praia da Vitória, a freguesia dos Biscoitos",
    kind: "PDO",
    places: { municipalities: ["Vila da Praia da Vitória"] },
  },
  "pt-bucelas": {
    area: "a freguesia de Bucelas e parte das de Fanhões e Santo Antão do Tojal, do concelho de Loures",
    kind: "PDO",
    places: { municipalities: ["Loures"] },
  },
  "pt-carcavelos": {
    area: "freguesias dos concelhos de Cascais e de Oeiras",
    kind: "PDO",
    places: { municipalities: ["Cascais", "Oeiras"] },
  },
  "pt-colares": {
    area: "as freguesias de Colares, São Martinho e São João das Lampas, do concelho de Sintra",
    kind: "PDO",
    places: { municipalities: ["Sintra"] },
  },
  "pt-graciosa": {
    area: "no concelho de Santa Cruz, as freguesias de Santa Cruz, Guadalupe, Praia e Luz",
    kind: "PDO",
    places: { municipalities: ["Santa Cruz da Graciosa"] },
  },
  "pt-lagoa": {
    area: "os concelhos de Albufeira, Lagoa, Loulé (parte) e Silves (parte)",
    kind: "PDO",
    places: { municipalities: ["Albufeira", "Lagoa", "Loulé", "Silves"] },
  },
  "pt-lagos": {
    area: "os concelhos de Aljezur, Vila do Bispo e Lagos (parte de cada)",
    kind: "PDO",
    places: { municipalities: ["Aljezur", "Vila do Bispo", "Lagos"] },
  },
  "pt-peninsula-de-setubal": {
    area: "todo o distrito de Setúbal",
    kind: "PGI",
    places: { districts: ["15"] },
  },
  "pt-pico": {
    area: "os concelhos da Madalena, São Roque e Lajes (parte de cada)",
    kind: "PDO",
    places: { municipalities: ["Lajes do Pico", "Madalena", "São Roque do Pico"] },
  },
  "pt-portimao": {
    area: "o concelho de Portimão (parte)",
    kind: "PDO",
    places: { municipalities: ["Portimão"] },
  },
  "pt-tavira": {
    area: "os concelhos de Faro, Olhão, São Brás de Alportel, Castro Marim, Tavira e Vila Real de Santo António (parte de alguns)",
    kind: "PDO",
    places: {
      municipalities: [
        "Faro",
        "Olhão",
        "São Brás de Alportel",
        "Castro Marim",
        "Tavira",
        "Vila Real de Santo António",
      ],
    },
  },
  "pt-tejo": {
    area: "todo o concelho de Azambuja e todo o distrito de Santarém, excepto o concelho de Ourém",
    kind: "PGI",
    places: { districts: ["14"], except: ["Ourém"], municipalities: ["Azambuja"] },
  },
  "pt-terras-madeirenses": {
    area: "a Região Demarcada da Madeira",
    kind: "PGI",
    places: { regions: ["300"] },
  },
};

type Row = { dim_3_t: string; geocod: string; geodsg: string; valor?: string };
const response = (await (
  await fetch(`https://www.ine.pt/ine/json_indicador/pindica.jsp?op=2&varcd=${indicator}&lang=PT`)
).json()) as { Dados: Record<string, Row[]> }[];
const rows = response[0]?.Dados[year];
if (rows === undefined) throw new Error(`The INE has no ${year} for indicator ${indicator}.`);

const value = new Map<string, Map<string, number>>();
const placeName = new Map<string, string>();
for (const row of rows) {
  placeName.set(row.geocod, row.geodsg);
  const byQuality = value.get(row.geocod) ?? new Map<string, number>();
  byQuality.set(row.dim_3_t, Number(row.valor ?? 0));
  value.set(row.geocod, byQuality);
}
// Municipalities have seven-character codes: NUTS III, district, municipality.
const municipalities = [...placeName].filter(([code]) => code.length === 7);
const codeOf = (name: string) => {
  const found = municipalities.filter(([, label]) => label === name);
  if (found.length !== 1) throw new Error(`${found.length} municipalities named ${name}.`);
  return found[0]![0];
};
const qualities = {
  PDO: [
    "Vinho com denominação de origem protegida",
    "Vinho licoroso com denominação de origem protegida",
  ],
  PGI: ["Vinho com indicação geográfica protegida"],
};

const regions: Record<string, { amountHl: number; places: string[]; quote: string }> = {};
for (const [id, { area, kind, places }] of Object.entries(names)) {
  const codes = [
    ...(places.regions ?? []),
    ...municipalities
      .filter(
        ([code, label]) =>
          places.districts?.includes(code.slice(3, 5)) === true && !places.except?.includes(label),
      )
      .map(([code]) => code),
    ...(places.municipalities ?? []).map(codeOf),
  ];
  const amount = codes.reduce(
    (sum, code) =>
      sum +
      qualities[kind].reduce((part, quality) => part + (value.get(code)?.get(quality) ?? 0), 0),
    0,
  );
  if (amount === 0) continue;
  const where = codes.map((code) => placeName.get(code)!);
  regions[id] = {
    amountHl: amount,
    places: where,
    quote: `Produção vinícola declarada, ${kind === "PDO" ? "vinho e vinho licoroso com DOP" : "vinho com IGP"}, local de vinificação: ${where.length > 3 ? `${where.length} concelhos (${area})` : where.join(", ")}, ${year} (hl): ${amount}`,
  };
}

writeFileSync(
  resolve("data/kb/pt-production-figures.json"),
  `${JSON.stringify(
    {
      about:
        "Wine declared by producers (hl) in 2025 for the Portuguese names whose ground the table can be read for, from Statistics Portugal's indicator 0012835 «Produção vinícola declarada em vinho (hl) pelos produtores por Local de vinificação (NUTS - 2024) e Qualidade e cor do vinho» (dados.gov.pt, CC BY 4.0): the PDO wine and PDO fortified wine (or the PGI wine) made in the municipalities, districts or region of the name's demarcated area, as its technical file writes it, where no other name of its kind lies in them. Changed: municipalities summed. Wine is counted where it was made, not where its grapes grew. Built by scripts/kb/fetch-pt-production.ts.",
      campaign: year,
      regions: Object.fromEntries(
        Object.entries(regions).sort(([one], [other]) => one.localeCompare(other)),
      ),
      sourceUrl,
    },
    null,
    1,
  )}\n`,
);
console.info(`INE Portugal: production for ${Object.keys(regions).length} names.`);
