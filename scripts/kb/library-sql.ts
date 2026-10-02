import type { RegionEntry } from "./appellation-names";
import type { GrapeEntry } from "./grape-validation";

/**
 * The library as SQL: the statements that replace whatever is loaded with a
 * given build. Pure, so the loader runs it against D1 and the API tests run
 * it against their own database, from the same code.
 */

/** Must equal `normalizeWineText` in the API — a test holds them together. */
export function normalizeLibraryText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function literal(value: string | number | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function insert(table: string, columns: string[], rows: (string | number | null)[][]): string[] {
  const statements: string[] = [];
  // Small statements: D1 caps a statement's size, and a reload is rare.
  for (let start = 0; start < rows.length; start += 50) {
    const values = rows
      .slice(start, start + 50)
      .map((row) => `(${row.map(literal).join(", ")})`)
      .join(",\n  ");
    statements.push(`INSERT OR IGNORE INTO ${table} (${columns.join(", ")}) VALUES\n  ${values};`);
  }
  return statements;
}

/** Wikipedia's prose is CC BY-SA 4.0; Wikidata's names are CC0. */
const wikipediaLicense = "CC-BY-SA-4.0";

export type Vocabulary = Record<
  "aroma" | "pairing",
  { terms: Record<string, Record<string, string>>; variants: Record<string, string | null> }
>;

export function librarySql(
  grapes: readonly GrapeEntry[],
  version: string,
  vocabulary: Vocabulary = {
    aroma: { terms: {}, variants: {} },
    pairing: { terms: {}, variants: {} },
  },
  regions: readonly RegionEntry[] = [],
): string[] {
  const statements = [
    "DELETE FROM kb_region_grapes;",
    "DELETE FROM kb_regions;",
    "DELETE FROM kb_terms;",
    "DELETE FROM kb_evidence;",
    "DELETE FROM kb_grape_attributes;",
    "DELETE FROM kb_summaries;",
    "DELETE FROM kb_names;",
    "DELETE FROM kb_grapes;",
  ];
  statements.push(
    ...insert(
      "kb_grapes",
      [
        "id",
        "wikidata_id",
        "color",
        "origin_country_code",
        "acidity",
        "tannin",
        "body",
        "prominence",
        "wikipedia_url",
      ],
      grapes.map((grape) => [
        grape.id,
        grape.wikidataId,
        grape.color,
        grape.origin,
        grape.acidity,
        grape.tannin,
        grape.body,
        grape.prominence,
        grape.wikipediaUrl,
      ]),
    ),
  );

  const names: (string | number | null)[][] = [];
  for (const grape of grapes) {
    for (const [locale, name] of Object.entries(grape.names)) {
      names.push([
        "grape",
        grape.id,
        locale,
        name,
        normalizeLibraryText(name),
        "primary",
        "wikidata",
      ]);
    }
    for (const synonym of grape.synonyms) {
      names.push([
        "grape",
        grape.id,
        "*",
        synonym.name,
        normalizeLibraryText(synonym.name),
        "synonym",
        synonym.source,
      ]);
    }
  }
  statements.push(
    ...insert(
      "kb_names",
      ["entity_type", "entity_id", "locale", "name", "normalized_name", "kind", "source"],
      names.filter((row) => (row[4] as string).length > 0),
    ),
  );

  statements.push(
    ...insert(
      "kb_summaries",
      ["entity_type", "entity_id", "locale", "text", "source_url", "license", "translated"],
      grapes.flatMap((grape) =>
        Object.entries(grape.summaries).map(([locale, summary]) => [
          "grape",
          grape.id,
          // Wikipedia's Portuguese edition stands in for pt-PT.
          locale === "pt" ? "pt-PT" : locale,
          summary.text,
          summary.url,
          wikipediaLicense,
          summary.translated === true ? 1 : 0,
        ]),
      ),
    ),
  );

  statements.push(
    ...insert(
      "kb_grape_attributes",
      ["grape_id", "kind", "value", "country_code"],
      grapes.flatMap((grape) => [
        ...grape.aromas.map((aroma) => [grape.id, "aroma", aroma.toLowerCase(), null]),
        ...grape.regions.map((region) => [grape.id, "region", region.name, region.country]),
        ...grape.styles.map((style) => [grape.id, "style", style, null]),
        ...grape.pairings.map((food) => [grape.id, "pairing", food.toLowerCase(), null]),
      ]),
    ),
  );

  statements.push(
    ...insert(
      "kb_evidence",
      ["entity_type", "entity_id", "field", "value", "quote", "source_url"],
      grapes.flatMap((grape) =>
        grape.evidence.map((entry) => [
          "grape",
          grape.id,
          entry.field,
          entry.field === "aromas" || entry.field === "pairings"
            ? entry.value.toLowerCase()
            : entry.value,
          entry.quote,
          grape.wikipediaUrl,
        ]),
      ),
    ),
  );

  statements.push(
    ...insert(
      "kb_terms",
      ["kind", "term", "locale", "label"],
      (["aroma", "pairing"] as const).flatMap((kind) =>
        Object.entries(vocabulary[kind].terms).flatMap(([term, labels]) =>
          Object.entries(labels).map(([locale, label]) => [kind, term, locale, label]),
        ),
      ),
    ),
  );

  statements.push(
    ...insert(
      "kb_regions",
      [
        "id",
        "eambrosia_id",
        "name",
        "country_code",
        "gi_type",
        "registered_on",
        "legal_url",
        "latitude",
        "longitude",
        "wikidata_id",
        "prominence",
      ],
      regions.map((region) => [
        region.id,
        region.eambrosiaId,
        region.name,
        region.countryCode,
        region.giType,
        region.registeredOn,
        region.legalUrl,
        region.latitude,
        region.longitude,
        region.wikidataId,
        region.prominence,
      ]),
    ),
    ...insert(
      "kb_names",
      ["entity_type", "entity_id", "locale", "name", "normalized_name", "kind", "source"],
      regions
        .flatMap((region) =>
          region.names.map((entry) => [
            "region",
            region.id,
            entry.locale,
            entry.name,
            normalizeLibraryText(entry.name),
            entry.locale === "*" ? "synonym" : "primary",
            entry.source,
          ]),
        )
        .filter((row) => (row[4] as string).length > 0),
    ),
    ...insert(
      "kb_summaries",
      ["entity_type", "entity_id", "locale", "text", "source_url", "license", "translated"],
      regions.flatMap((region) =>
        Object.entries(region.summaries).map(([locale, summary]) => [
          "region",
          region.id,
          locale === "pt" ? "pt-PT" : locale,
          summary.text,
          summary.url,
          wikipediaLicense,
          0,
        ]),
      ),
    ),
    ...insert(
      "kb_region_grapes",
      ["region_id", "grape_id", "quote", "source_url"],
      regions.flatMap((region) =>
        region.grapes
          .filter((link) => grapes.some((grape) => grape.id === link.grapeId))
          .map((link) => [region.id, link.grapeId, link.quote, link.sourceUrl]),
      ),
    ),
  );

  statements.push(
    `INSERT OR REPLACE INTO kb_meta (key, value) VALUES ('version', ${literal(version)});`,
  );
  return statements;
}
