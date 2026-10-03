import type { ImageEntry, RegionEntry, TopicEntry } from "./appellation-names";
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

type Value = string | number | null;

/** One library table as the build wants it: its key, and every row. */
export type LibraryTable = {
  columns: string[];
  /** Indexes besides the table itself, for counting what a write costs. */
  indexes: number;
  key: string[];
  rows: Value[][];
  table: string;
};

/**
 * The library as tables, parents before children. Rows are unique by key —
 * the first wins, as `INSERT OR IGNORE` would have it.
 */
export function libraryTables(
  grapes: readonly GrapeEntry[],
  version: string,
  vocabulary: Vocabulary = {
    aroma: { terms: {}, variants: {} },
    pairing: { terms: {}, variants: {} },
  },
  regions: readonly RegionEntry[] = [],
  extras: { images?: Record<string, ImageEntry>; topics?: readonly TopicEntry[] } = {},
): LibraryTable[] {
  const topics = extras.topics ?? [];
  const images = extras.images ?? {};
  const table = (
    name: string,
    columns: string[],
    key: string[],
    indexes: number,
    rows: Value[][],
  ): LibraryTable => {
    const seen = new Set<string>();
    const positions = key.map((column) => columns.indexOf(column));
    return {
      columns,
      indexes,
      key,
      rows: rows.filter((row) => {
        const id = JSON.stringify(positions.map((position) => row[position]));
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      }),
      table: name,
    };
  };
  const nameColumns = [
    "entity_type",
    "entity_id",
    "locale",
    "name",
    "normalized_name",
    "kind",
    "source",
  ];
  const summaryColumns = [
    "entity_type",
    "entity_id",
    "locale",
    "text",
    "source_url",
    "license",
    "translated",
  ];

  return [
    table(
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
      ["id"],
      2,
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
    table(
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
      ["id"],
      3,
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
    table(
      "kb_topics",
      ["id", "category", "wikidata_id", "prominence"],
      ["id"],
      1,
      topics.map((topic) => [topic.id, topic.category, topic.wikidataId, topic.prominence]),
    ),
    table(
      "kb_names",
      nameColumns,
      ["entity_type", "entity_id", "locale", "normalized_name"],
      2,
      [
        ...grapes.flatMap((grape) => [
          ...Object.entries(grape.names).map(([locale, name]) => [
            "grape",
            grape.id,
            locale,
            name,
            normalizeLibraryText(name),
            "primary",
            "wikidata",
          ]),
          ...grape.synonyms.map((synonym) => [
            "grape",
            grape.id,
            "*",
            synonym.name,
            normalizeLibraryText(synonym.name),
            "synonym",
            synonym.source,
          ]),
        ]),
        ...regions.flatMap((region) =>
          region.names.map((entry) => [
            "region",
            region.id,
            entry.locale,
            entry.name,
            normalizeLibraryText(entry.name),
            entry.locale === "*" ? "synonym" : "primary",
            entry.source,
          ]),
        ),
        ...topics.flatMap((topic) => [
          ...Object.entries(topic.names).map(([locale, name]) => [
            "style",
            topic.id,
            locale,
            name,
            normalizeLibraryText(name),
            "primary",
            "wikidata",
          ]),
          ...topic.aliases.map((alias) => [
            "style",
            topic.id,
            alias.locale,
            alias.name,
            normalizeLibraryText(alias.name),
            "synonym",
            "curated",
          ]),
        ]),
      ].filter((row) => (row[4] as string).length > 0),
    ),
    table("kb_summaries", summaryColumns, ["entity_type", "entity_id", "locale"], 1, [
      ...grapes.flatMap((grape) =>
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
      ...topics.flatMap((topic) =>
        Object.entries(topic.summaries).map(([locale, summary]) => [
          "style",
          topic.id,
          locale === "pt" ? "pt-PT" : locale,
          summary.text,
          summary.url,
          wikipediaLicense,
          0,
        ]),
      ),
      ...regions.flatMap((region) =>
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
    ]),
    table(
      "kb_grape_attributes",
      ["grape_id", "kind", "value", "country_code"],
      ["grape_id", "kind", "value"],
      2,
      grapes.flatMap((grape) => [
        ...grape.aromas.map((aroma) => [grape.id, "aroma", aroma.toLowerCase(), null]),
        ...grape.regions.map((region) => [grape.id, "region", region.name, region.country]),
        ...grape.styles.map((style) => [grape.id, "style", style, null]),
        ...grape.pairings.map((food) => [grape.id, "pairing", food.toLowerCase(), null]),
      ]),
    ),
    table(
      "kb_evidence",
      ["entity_type", "entity_id", "field", "value", "quote", "source_url"],
      ["entity_type", "entity_id", "field", "value"],
      1,
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
    table(
      "kb_terms",
      ["kind", "term", "locale", "label"],
      ["kind", "term", "locale"],
      1,
      (["aroma", "pairing"] as const).flatMap((kind) =>
        Object.entries(vocabulary[kind].terms).flatMap(([term, labels]) =>
          Object.entries(labels).map(([locale, label]) => [kind, term, locale, label]),
        ),
      ),
    ),
    table(
      "kb_region_grapes",
      ["region_id", "grape_id", "quote", "source_url"],
      ["region_id", "grape_id"],
      2,
      regions.flatMap((region) =>
        region.grapes
          .filter((link) => grapes.some((grape) => grape.id === link.grapeId))
          .map((link) => [region.id, link.grapeId, link.quote, link.sourceUrl]),
      ),
    ),
    table(
      "kb_images",
      ["entity_type", "entity_id", "path", "author", "license", "license_url", "source_url"],
      ["entity_type", "entity_id"],
      1,
      Object.entries(images)
        .filter(([grapeId]) => grapes.some((grape) => grape.id === grapeId))
        .map(([grapeId, image]) => [
          "grape",
          grapeId,
          image.path,
          image.author,
          image.license,
          image.licenseUrl,
          image.sourceUrl,
        ]),
    ),
    table("kb_meta", ["key", "value"], ["key"], 1, [["version", version]]),
  ];
}

/** Every table emptied and filled again: for a new database, and the tests. */
export function librarySql(...args: Parameters<typeof libraryTables>): string[] {
  const tables = libraryTables(...args);
  return [
    ...tables.toReversed().map(({ table }) => `DELETE FROM ${table};`),
    ...tables.flatMap(({ columns, rows, table }) => insert(table, columns, rows)),
  ];
}

/**
 * Only what changed, against what the database holds now: rows gone are
 * deleted (children first), rows new or different are upserted (parents
 * first). Rewriting the whole library on every change wrote some 35,000 rows
 * a load — a third of the free plan's daily writes — and three loads in a day
 * left the live application unable to save anything until midnight UTC.
 *
 * `writes` estimates the rows D1 will bill, index entries included.
 */
export function libraryDiffSql(
  tables: readonly LibraryTable[],
  current: Record<string, Record<string, Value>[]>,
): { statements: string[]; writes: number } {
  const deletes: string[] = [];
  const upserts: string[] = [];
  let writes = 0;
  const keyOf = (values: Value[]) => JSON.stringify(values);
  for (const { columns, indexes, key, rows, table } of tables.toReversed()) {
    const wanted = new Set(
      rows.map((row) => keyOf(key.map((column) => row[columns.indexOf(column)] ?? null))),
    );
    for (const existing of current[table] ?? []) {
      const values = key.map((column) => existing[column] ?? null);
      if (wanted.has(keyOf(values))) continue;
      deletes.push(
        `DELETE FROM ${table} WHERE ${key
          .map((column, index) => `${column} = ${literal(values[index]!)}`)
          .join(" AND ")};`,
      );
      writes += 1 + indexes;
    }
  }
  for (const { columns, indexes, key, rows, table } of tables) {
    const held = new Map(
      (current[table] ?? []).map((existing) => [
        keyOf(key.map((column) => existing[column] ?? null)),
        keyOf(columns.map((column) => existing[column] ?? null)),
      ]),
    );
    const changed = rows.filter(
      (row) =>
        held.get(keyOf(key.map((column) => row[columns.indexOf(column)] ?? null))) !==
        keyOf(row.map((value) => value ?? null)),
    );
    const others = columns.filter((column) => !key.includes(column));
    for (let start = 0; start < changed.length; start += 50) {
      const values = changed
        .slice(start, start + 50)
        .map((row) => `(${row.map(literal).join(", ")})`)
        .join(",\n  ");
      upserts.push(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES\n  ${values}\n` +
          `ON CONFLICT (${key.join(", ")}) DO ${
            others.length === 0
              ? "NOTHING"
              : `UPDATE SET ${others.map((column) => `${column} = excluded.${column}`).join(", ")}`
          };`,
      );
    }
    writes += changed.length * (1 + indexes);
  }
  return { statements: [...deletes, ...upserts], writes };
}
