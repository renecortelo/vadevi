import type {
  LibraryGrape,
  LibraryRegion,
  LibraryTopic,
  RegionDesignation,
  RegionLevel,
} from "@vadevi/contracts";

import { suggestedPairingsFor } from "../adapters/grape-pairing";
import { nameForms } from "./region-names";
import { normalizeWineText } from "./wine-memory";

/**
 * The wine library, read.
 *
 * Global reference knowledge (migration 0025), the same for every reader and
 * never written by the application. Built offline from open sources by the
 * `pnpm kb:*` scripts, every structured value with the sentence it came from.
 */

type GrapeRow = {
  acidity: LibraryGrape["acidity"];
  body: LibraryGrape["body"];
  color: LibraryGrape["color"];
  id: string;
  origin_country_code: string | null;
  tannin: LibraryGrape["tannin"];
  wikidata_id: string;
  wikipedia_url: string | null;
};

/** Every grape any of whose names is `text`, best known first. */
export async function findGrapesByName(
  database: D1Database,
  text: string,
  limit = 5,
): Promise<string[]> {
  const normalized = normalizeWineText(text);
  if (normalized.length === 0) return [];
  const rows = await database
    .prepare(
      `SELECT DISTINCT name.entity_id AS id, grape.prominence
      FROM kb_names name
      JOIN kb_grapes grape ON grape.id = name.entity_id
      WHERE name.entity_type = 'grape'
        AND name.normalized_name >= ? AND name.normalized_name < ? || '~'
      ORDER BY (name.normalized_name = ?) DESC, grape.prominence DESC
      LIMIT ?`,
    )
    .bind(normalized, normalized, normalized, limit)
    .all<{ id: string }>();
  return rows.results.map((row) => row.id);
}

/**
 * The phrases of a sentence a name could be: every run of one to eight
 * words, four characters or longer. Looked up by equality, they use the
 * names index — a lookup per phrase rather than a scan of every name in the
 * library for every message, which is what D1 bills as rows read.
 */
function phrasesOf(message: string): string[] {
  const words = normalizeWineText(message).split(" ").filter(Boolean).slice(0, 400);
  const phrases = new Set<string>();
  for (let start = 0; start < words.length; start += 1) {
    for (let end = start + 1; end <= Math.min(words.length, start + 8); end += 1) {
      const phrase = words.slice(start, end).join(" ");
      if (phrase.length >= 4) phrases.add(phrase);
    }
  }
  return [...phrases];
}

/** Entities of one kind named in a sentence, the longest name first. */
async function namedIn(
  database: D1Database,
  message: string,
  entityType: "grape" | "region" | "style",
  limit: number,
): Promise<string[]> {
  const phrases = phrasesOf(message);
  if (phrases.length === 0) return [];
  // D1 binds at most 100 parameters to a statement.
  const chunks: string[][] = [];
  for (let start = 0; start < phrases.length; start += 90) {
    chunks.push(phrases.slice(start, start + 90));
  }
  const results = await database.batch(
    chunks.map((chunk) =>
      database
        .prepare(
          `SELECT entity_id AS id, max(length(normalized_name)) AS matched
          FROM kb_names
          WHERE normalized_name IN (${chunk.map(() => "?").join(", ")}) AND entity_type = ?
          GROUP BY entity_id`,
        )
        .bind(...chunk, entityType),
    ),
  );
  const best = new Map<string, number>();
  for (const result of results) {
    for (const row of result.results as { id: string; matched: number }[]) {
      best.set(row.id, Math.max(best.get(row.id) ?? 0, row.matched));
    }
  }
  return [...best.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([id]) => id);
}

/**
 * The grapes named anywhere in a sentence — "¿a qué huele un Ull de Llebre?"
 * finds Tempranillo — matched on whole words, the longest name first, so
 * "Pinot Noir" wins over a lone "Pinot".
 */
export async function grapesMentionedIn(database: D1Database, message: string): Promise<string[]> {
  return namedIn(database, message, "grape", 3);
}

/** One grape's card in the reader's language, English where theirs is missing. */
export async function getLibraryGrape(
  database: D1Database,
  grapeId: string,
  locale: string,
): Promise<LibraryGrape | null> {
  const grape = await database
    .prepare(
      `SELECT id, wikidata_id, color, origin_country_code, acidity, tannin, body, wikipedia_url
      FROM kb_grapes WHERE id = ?`,
    )
    .bind(grapeId)
    .first<GrapeRow>();
  if (grape === null) return null;

  const [names, summaries, attributes, evidence, labels, linkedRegions, images] =
    await database.batch([
      database
        .prepare(
          `SELECT locale, name, kind FROM kb_names
        WHERE entity_type = 'grape' AND entity_id = ? ORDER BY kind, name`,
        )
        .bind(grapeId),
      database
        .prepare(
          `SELECT locale, text, source_url, license, translated FROM kb_summaries
        WHERE entity_type = 'grape' AND entity_id = ?`,
        )
        .bind(grapeId),
      database
        .prepare(
          `SELECT kind, value, country_code FROM kb_grape_attributes WHERE grape_id = ? ORDER BY rowid`,
        )
        .bind(grapeId),
      database
        .prepare(
          `SELECT field, value, quote, source_url FROM kb_evidence
        WHERE entity_type = 'grape' AND entity_id = ? ORDER BY field, value`,
        )
        .bind(grapeId),
      // Aromas and foods are stored as the library's English terms; this is
      // their label in the reader's language.
      database
        .prepare(
          `SELECT term.kind, term.term, term.label FROM kb_terms term
        JOIN kb_grape_attributes attribute
          ON attribute.kind = term.kind AND attribute.value = term.term
        WHERE attribute.grape_id = ? AND term.locale = ?`,
        )
        .bind(grapeId, locale),
      // The grape's regions that are registered names, to link to the atlas.
      database
        .prepare(
          `SELECT region.id, region.country_code, name.normalized_name
        FROM kb_region_grapes link
        JOIN kb_regions region ON region.id = link.region_id
        JOIN kb_names name ON name.entity_type = 'region' AND name.entity_id = region.id
        WHERE link.grape_id = ?`,
        )
        .bind(grapeId),
      database
        .prepare(
          `SELECT path, author, license, license_url, source_url FROM kb_images
        WHERE entity_type = 'grape' AND entity_id = ?`,
        )
        .bind(grapeId),
    ]);
  const imageRow = (images?.results ?? [])[0] as
    | {
        author: string;
        license: string;
        license_url: string | null;
        path: string;
        source_url: string;
      }
    | undefined;
  const regionOf = new Map(
    (
      (linkedRegions?.results ?? []) as {
        country_code: string;
        id: string;
        normalized_name: string;
      }[]
    ).map((row) => [`${row.country_code}:${row.normalized_name}`, row.id]),
  );

  const nameRows = (names?.results ?? []) as { kind: string; locale: string; name: string }[];
  const primary =
    // Names are stored under Wikidata's language codes ("pt", not "pt-PT").
    nameRows.find((row) => row.kind === "primary" && row.locale === locale.split("-")[0])?.name ??
    nameRows.find((row) => row.kind === "primary" && row.locale === "en")?.name ??
    grapeId;
  const summaryRows = (summaries?.results ?? []) as {
    license: string;
    locale: string;
    source_url: string;
    text: string;
    translated: number;
  }[];
  const summary = inReadersLanguage(summaryRows, locale);
  const attributeRows = (attributes?.results ?? []) as {
    country_code: string | null;
    kind: string;
    value: string;
  }[];
  const labelOf = new Map(
    ((labels?.results ?? []) as { kind: string; label: string; term: string }[]).map((row) => [
      `${row.kind}:${row.term}`,
      row.label,
    ]),
  );
  // A term with no label in this language is shown as the source wrote it.
  const of = (kind: string) =>
    attributeRows
      .filter((row) => row.kind === kind)
      .map((row) => labelOf.get(`${kind}:${row.value}`) ?? row.value);

  const styles = of("style");
  return {
    acidity: grape.acidity,
    aromas: of("aroma"),
    aromaTerms: attributeRows.filter((row) => row.kind === "aroma").map((row) => row.value),
    body: grape.body,
    color: grape.color,
    evidence: (
      (evidence?.results ?? []) as {
        field: string;
        quote: string;
        source_url: string;
        value: string;
      }[]
    ).map((row) => ({
      field: row.field,
      quote: row.quote,
      sourceUrl: row.source_url,
      value: row.value,
    })),
    id: grape.id,
    image:
      imageRow === undefined
        ? null
        : {
            author: imageRow.author,
            license: imageRow.license,
            licenseUrl: imageRow.license_url,
            path: imageRow.path,
            sourceUrl: imageRow.source_url,
          },
    name: primary,
    originCountryCode: grape.origin_country_code,
    pairings: of("pairing"),
    regions: attributeRows
      .filter((row) => row.kind === "region")
      .map((row) => ({
        countryCode: row.country_code,
        name: row.value,
        regionId: regionOf.get(`${row.country_code ?? ""}:${normalizeWineText(row.value)}`) ?? null,
      })),
    styles,
    summary:
      summary === null
        ? null
        : {
            license: summary.license,
            locale: summary.locale,
            sourceUrl: summary.source_url,
            text: summary.text,
            translated: summary.translated === 1,
          },
    suggestedPairings: suggestedPairingsFor({
      acidity: grape.acidity,
      body: grape.body,
      color: grape.color,
      id: grape.id,
      sourcePairings: attributeRows.filter((row) => row.kind === "pairing").map((row) => row.value),
      styles,
      tannin: grape.tannin,
    }),
    synonyms: [...new Set(nameRows.filter((row) => row.name !== primary).map((row) => row.name))],
    tannin: grape.tannin,
    wikidataId: grape.wikidata_id,
  };
}

type GrapeListItem = {
  color: LibraryGrape["color"];
  id: string;
  imagePath: string | null;
  name: string;
  originCountryCode: string | null;
};

/**
 * Grapes whose name starts with or equals the query, for a picker — or,
 * without one, every grape in the library, named in the reader's language.
 */
export async function searchLibraryGrapes(
  database: D1Database,
  query: string | undefined,
  locale: string,
): Promise<GrapeListItem[]> {
  const ids = query === undefined ? null : await findGrapesByName(database, query, 10);
  if (ids !== null && ids.length === 0) return [];
  const rows = await database
    .prepare(
      `SELECT grape.id, grape.color, grape.origin_country_code, grape.prominence, image.path,
        coalesce(
          (SELECT name FROM kb_names WHERE entity_type = 'grape' AND entity_id = grape.id
            AND kind = 'primary' AND locale = ?),
          (SELECT name FROM kb_names WHERE entity_type = 'grape' AND entity_id = grape.id
            AND kind = 'primary' AND locale = 'en'),
          grape.id
        ) AS name
      FROM kb_grapes grape
      LEFT JOIN kb_images image ON image.entity_type = 'grape' AND image.entity_id = grape.id
      ${ids === null ? "" : `WHERE grape.id IN (${ids.map(() => "?").join(", ")})`}`,
    )
    .bind(locale.split("-")[0], ...(ids ?? []))
    .all<{
      color: LibraryGrape["color"];
      id: string;
      name: string;
      origin_country_code: string | null;
      path: string | null;
      prominence: number;
    }>();
  const items = rows.results.map((row) => ({
    color: row.color,
    id: row.id,
    imagePath: row.path,
    name: row.name,
    originCountryCode: row.origin_country_code,
  }));
  // A search keeps its own order (exact name first, then the best known); the
  // full list reads alphabetically.
  return ids === null
    ? items.sort((left, right) => left.name.localeCompare(right.name, locale))
    : ids.flatMap((id) => items.filter((item) => item.id === id));
}

/** Registered wine names named anywhere in a sentence, longest first. */
export async function regionsMentionedIn(database: D1Database, message: string): Promise<string[]> {
  return namedIn(database, message, "region", 2);
}

/** A registered wine name, best known first, by any of its names. */
/**
 * The atlas in figures, country by country: what the library knows of each
 * country's registered names in the reader's language and in all eight. A
 * point without a recorded source is counted as the wine's own item, the
 * oldest way the EU atlas was placed.
 */
export async function libraryAtlasCoverage(database: D1Database, locale: string) {
  const [version, rows] = await database.batch([
    database.prepare(`SELECT value FROM kb_meta WHERE key = 'version'`),
    database
      .prepare(
        `SELECT region.country_code AS country, COUNT(*) AS names,
          SUM(EXISTS (SELECT 1 FROM kb_summaries summary WHERE summary.entity_type = 'region'
            AND summary.entity_id = region.id AND summary.locale = ?)) AS described,
          SUM((SELECT COUNT(DISTINCT summary.locale) FROM kb_summaries summary
            WHERE summary.entity_type = 'region' AND summary.entity_id = region.id
              AND summary.locale IN (SELECT value FROM json_each(?))) = ?) AS every_language,
          SUM(region.latitude IS NULL) AS no_point,
          SUM(region.latitude IS NOT NULL AND region.point_source = 'boundary') AS boundary,
          SUM(region.latitude IS NOT NULL AND coalesce(region.point_source, 'item') = 'item') AS item,
          SUM(region.latitude IS NOT NULL AND region.point_source = 'place') AS place,
          SUM(region.latitude IS NOT NULL AND region.point_source = 'area') AS area,
          -- Its grapes: those its register's own document lists, or those
          -- whose articles say they are grown there.
          SUM(EXISTS (SELECT 1 FROM kb_region_grapes link WHERE link.region_id = region.id)
            OR coalesce(json_array_length(region.register_grapes), 0) > 0) AS with_grapes
        FROM kb_regions region
        -- Registered names only: a wine region no register protects is in
        -- the atlas, not in its count of registered names.
        WHERE region.gi_type <> 'WR'
        GROUP BY region.country_code ORDER BY names DESC, country`,
      )
      .bind(locale, JSON.stringify(fallbackOrder), fallbackOrder.length),
  ]);
  type Row = {
    area: number;
    boundary: number;
    country: string;
    described: number;
    every_language: number;
    item: number;
    names: number;
    no_point: number;
    place: number;
    with_grapes: number;
  };
  return {
    countries: (rows!.results as Row[]).map((row) => ({
      countryCode: row.country,
      described: row.described,
      describedInEveryLanguage: row.every_language,
      names: row.names,
      points: {
        area: row.area,
        boundary: row.boundary,
        item: row.item,
        none: row.no_point,
        place: row.place,
      },
      withGrapes: row.with_grapes,
    })),
    libraryVersion: (version!.results[0] as { value: string } | undefined)?.value ?? null,
  };
}

export async function searchLibraryRegions(
  database: D1Database,
  query: string | undefined,
  country: string | null = null,
): Promise<
  {
    countryCode: string;
    giType: RegionDesignation;
    id: string;
    name: string;
    point?: { approximate: boolean; latitude: number; longitude: number } | null;
  }[]
> {
  if (query === undefined) {
    // A country's names, all of them, for the library's list.
    if (country === null) return [];
    const rows = await database
      .prepare(
        `SELECT id, name, country_code, gi_type, latitude, longitude, point_source
        FROM kb_regions WHERE country_code = ? ORDER BY name LIMIT 1000`,
      )
      .bind(country)
      .all<{
        country_code: string;
        gi_type: RegionDesignation;
        id: string;
        latitude: number | null;
        longitude: number | null;
        name: string;
        point_source: string | null;
      }>();
    return rows.results.map((row) => ({
      countryCode: row.country_code,
      giType: row.gi_type,
      id: row.id,
      name: row.name,
      point:
        row.latitude === null || row.longitude === null
          ? null
          : {
              approximate: row.point_source === "area" || row.point_source === "place",
              latitude: row.latitude,
              longitude: row.longitude,
            },
    }));
  }
  const typed = normalizeWineText(query);
  if (typed.length === 0) return [];
  const find = (normalized: string) =>
    database
      .prepare(
        `SELECT DISTINCT region.id, region.name, region.country_code, region.gi_type, region.prominence
        FROM kb_names name
        JOIN kb_regions region ON region.id = name.entity_id
        WHERE name.entity_type = 'region'
          AND name.normalized_name >= ? AND name.normalized_name < ? || '~'
          AND (? IS NULL OR region.country_code = ?)
        ORDER BY (name.normalized_name = ?) DESC, region.prominence DESC, region.name
        LIMIT 10`,
      )
      .bind(normalized, normalized, country, country, normalized)
      .all<{ country_code: string; gi_type: RegionDesignation; id: string; name: string }>();
  let rows = await find(typed);
  // As a wine's region may be written: with its label ("Rioja DOCa"), its
  // country ("New Zealand Marlborough"), where it is ("Margaret River,
  // Western Australia"), or in English for a Spanish name ("Maipo Valley").
  for (const form of nameForms(query).forms) {
    if (rows.results.length > 0) break;
    if (form !== typed) rows = await find(form);
  }
  return rows.results.map((row) => ({
    countryCode: row.country_code,
    giType: row.gi_type,
    id: row.id,
    name: row.name,
  }));
}

/** One registered wine name's atlas entry in the reader's language. */
export async function getLibraryRegion(
  database: D1Database,
  regionId: string,
  locale: string,
): Promise<LibraryRegion | null> {
  const region = await database
    .prepare(
      `SELECT id, eambrosia_id, name, country_code, gi_type, registered_on, legal_url,
        latitude, longitude, wikidata_id, point_source,
        register_categories, register_grapes, register_source_url, register_ref,
        register_level, within, climate, figures
      FROM kb_regions WHERE id = ?`,
    )
    .bind(regionId)
    .first<{
      climate: string | null;
      country_code: string;
      eambrosia_id: string | null;
      figures: string | null;
      gi_type: RegionDesignation;
      id: string;
      latitude: number | null;
      legal_url: string | null;
      longitude: number | null;
      name: string;
      point_source: "area" | "boundary" | "item" | "place" | null;
      register_categories: string | null;
      register_grapes: string | null;
      register_level: RegionLevel | null;
      register_ref: string | null;
      register_source_url: string | null;
      registered_on: string | null;
      wikidata_id: string | null;
      within: string | null;
    }>();
  if (region === null) return null;
  const withinIds = JSON.parse(region.within ?? "[]") as string[];
  const [names, summaries, grapes, holders, held] = await database.batch([
    database
      .prepare(`SELECT locale, name FROM kb_names WHERE entity_type = 'region' AND entity_id = ?`)
      .bind(regionId),
    database
      .prepare(
        `SELECT locale, text, source_url, license, translated FROM kb_summaries
        WHERE entity_type = 'region' AND entity_id = ?`,
      )
      .bind(regionId),
    database
      .prepare(
        `SELECT link.grape_id, link.quote, link.source_url,
          coalesce(
            (SELECT name FROM kb_names WHERE entity_type = 'grape' AND entity_id = link.grape_id
              AND kind = 'primary' AND locale = ?),
            (SELECT name FROM kb_names WHERE entity_type = 'grape' AND entity_id = link.grape_id
              AND kind = 'primary' AND locale = 'en'),
            link.grape_id
          ) AS name
        FROM kb_region_grapes link
        JOIN kb_grapes grape ON grape.id = link.grape_id
        WHERE link.region_id = ?
        ORDER BY grape.prominence DESC`,
      )
      .bind(locale.split("-")[0], regionId),
    database
      .prepare(
        `SELECT id, name, register_level FROM kb_regions
        WHERE id IN (SELECT value FROM json_each(?))`,
      )
      .bind(JSON.stringify(withinIds)),
    // Every name inside this one, to keep those directly inside it.
    database
      .prepare(
        `SELECT id, name, register_level, within FROM kb_regions
        WHERE within IS NOT NULL AND EXISTS (SELECT 1 FROM json_each(within) WHERE value = ?)
        ORDER BY name`,
      )
      .bind(regionId),
  ]);
  type Linked = { id: string; name: string; register_level: RegionLevel | null };
  const link = (row: Linked) => ({ id: row.id, level: row.register_level, name: row.name });
  const holderRows = (holders?.results ?? []) as Linked[];
  const heldRows = (held?.results ?? []) as (Linked & { within: string })[];
  const inside = new Set(heldRows.map((row) => row.id));
  const nameRows = (names?.results ?? []) as { locale: string; name: string }[];
  const shortLocale = locale.split("-")[0];
  const primary =
    nameRows.find((row) => row.locale === shortLocale)?.name ??
    nameRows.find((row) => row.locale === "*")?.name ??
    region.name;
  const summaryRows = (summaries?.results ?? []) as {
    license: string;
    locale: string;
    source_url: string;
    text: string;
    translated: number;
  }[];
  const summary = inReadersLanguage(summaryRows, locale);
  const climate =
    region.climate === null ? null : (JSON.parse(region.climate) as LibraryRegion["climate"]);
  const figures =
    region.figures === null
      ? { planted: null, production: null }
      : (JSON.parse(region.figures) as LibraryRegion["figures"]);
  return {
    climate:
      climate === null
        ? null
        : {
            growingDegreeDays: climate.growingDegreeDays,
            koppen: climate.koppen,
            meanTemperature: climate.meanTemperature,
            pr: climate.pr,
            rainfall: climate.rainfall,
            tas: climate.tas,
            winkler: climate.winkler,
          },
    // Directly: not also inside another name that is inside this one.
    contains: heldRows
      .filter((row) => (JSON.parse(row.within) as string[]).every((holder) => !inside.has(holder)))
      .map(link),
    countryCode: region.country_code,
    eambrosiaId: region.eambrosia_id,
    figures,
    giType: region.gi_type,
    grapes: (
      (grapes?.results ?? []) as {
        grape_id: string;
        name: string;
        quote: string;
        source_url: string;
      }[]
    ).map((row) => ({
      id: row.grape_id,
      name: row.name,
      quote: row.quote,
      sourceUrl: row.source_url,
    })),
    id: region.id,
    latitude: region.latitude,
    legalUrl: region.legal_url,
    longitude: region.longitude,
    name: primary,
    otherNames: [...new Set(nameRows.map((row) => row.name).filter((name) => name !== primary))],
    pointSource: region.point_source,
    register:
      region.register_source_url === null
        ? null
        : {
            categories: JSON.parse(region.register_categories ?? "[]") as number[],
            grapes: JSON.parse(region.register_grapes ?? "[]") as {
              grapeId: string | null;
              name: string;
            }[],
            sourceUrl: region.register_source_url,
          },
    registeredOn: region.registered_on,
    registerLevel: region.register_level,
    registerRef: region.register_ref,
    summary:
      summary === null
        ? null
        : {
            license: summary.license,
            locale: summary.locale,
            sourceUrl: summary.source_url,
            text: summary.text,
            translated: summary.translated === 1,
          },
    wikidataId: region.wikidata_id,
    within: withinIds.flatMap((id) => {
      const row = holderRows.find((holder) => holder.id === id);
      return row === undefined ? [] : [link(row)];
    }),
  };
}

/** Styles and methods named anywhere in a sentence, longest name first. */
export async function topicsMentionedIn(database: D1Database, message: string): Promise<string[]> {
  return namedIn(database, message, "style", 2);
}

type TopicRow = { category: LibraryTopic["category"]; id: string };

/**
 * The text to show a reader: in their language; else in its sibling (a
 * Catalan reader reads Spanish, and the other way round); else in English;
 * else in the first of the app's languages, in the order the library is
 * translated into them.
 */
const fallbackOrder = ["es", "ca", "fr", "en", "nl", "pt-PT", "it", "de"];
const siblings: Record<string, string> = { ca: "es", es: "ca" };
export function inReadersLanguage<Row extends { locale: string }>(
  rows: readonly Row[],
  locale: string,
): Row | null {
  const order = [locale, siblings[locale], "en", ...fallbackOrder];
  for (const wanted of order) {
    const row = rows.find((candidate) => candidate.locale === wanted);
    if (row !== undefined) return row;
  }
  return rows[0] ?? null;
}

async function topicsFor(
  database: D1Database,
  topics: TopicRow[],
  locale: string,
): Promise<LibraryTopic[]> {
  if (topics.length === 0) return [];
  const ids = topics.map((topic) => topic.id);
  const placeholders = ids.map(() => "?").join(", ");
  const shortLocale = locale.split("-")[0]!;
  const [names, summaries, images] = await database.batch([
    database
      .prepare(
        `SELECT entity_id, locale, name, kind FROM kb_names
        WHERE entity_type = 'style' AND entity_id IN (${placeholders})`,
      )
      .bind(...ids),
    database
      .prepare(
        `SELECT entity_id, locale, text, source_url, license, translated FROM kb_summaries
        WHERE entity_type = 'style' AND entity_id IN (${placeholders})`,
      )
      .bind(...ids),
    database
      .prepare(
        `SELECT entity_id, path, author, license, license_url, source_url FROM kb_images
        WHERE entity_type = 'style' AND entity_id IN (${placeholders})`,
      )
      .bind(...ids),
  ]);
  const imageRows = (images?.results ?? []) as {
    author: string;
    entity_id: string;
    license: string;
    license_url: string | null;
    path: string;
    source_url: string;
  }[];
  const nameRows = (names?.results ?? []) as {
    entity_id: string;
    kind: "primary" | "synonym";
    locale: string;
    name: string;
  }[];
  const summaryRows = (summaries?.results ?? []) as {
    entity_id: string;
    license: string;
    locale: string;
    source_url: string;
    text: string;
    translated: number;
  }[];
  return topics.map((topic) => {
    const own = nameRows.filter((row) => row.entity_id === topic.id);
    const name =
      own.find((row) => row.kind === "primary" && row.locale === shortLocale)?.name ??
      own.find((row) => row.kind === "primary" && row.locale === "en")?.name ??
      topic.id;
    const mine = summaryRows.filter((row) => row.entity_id === topic.id);
    const summary = inReadersLanguage(mine, locale);
    const image = imageRows.find((row) => row.entity_id === topic.id);
    return {
      category: topic.category,
      id: topic.id,
      image:
        image === undefined
          ? null
          : {
              author: image.author,
              license: image.license,
              licenseUrl: image.license_url,
              path: image.path,
              sourceUrl: image.source_url,
            },
      name,
      // The names a reader of this language might use, and the language-free
      // ones ("pet nat"); not every language's label.
      otherNames: [
        ...new Set(
          own
            .filter(
              (row) => row.name !== name && (row.locale === shortLocale || row.locale === "*"),
            )
            .map((row) => row.name),
        ),
      ].slice(0, 12),
      summary:
        summary === null
          ? null
          : {
              license: summary.license,
              locale: summary.locale,
              sourceUrl: summary.source_url,
              text: summary.text,
              translated: summary.translated === 1,
            },
    };
  });
}

/** Every style and method, best known first within each category. */
export async function listLibraryTopics(
  database: D1Database,
  locale: string,
): Promise<LibraryTopic[]> {
  const rows = await database
    .prepare(`SELECT id, category FROM kb_topics ORDER BY category, prominence DESC, id`)
    .all<TopicRow>();
  return topicsFor(database, rows.results, locale);
}

/** One style or method, in the reader's language. */
export async function getLibraryTopic(
  database: D1Database,
  topicId: string,
  locale: string,
): Promise<LibraryTopic | null> {
  const row = await database
    .prepare(`SELECT id, category FROM kb_topics WHERE id = ?`)
    .bind(topicId)
    .first<TopicRow>();
  if (row === null) return null;
  return (await topicsFor(database, [row], locale))[0] ?? null;
}

/**
 * Registered names by id, as the register writes them — the legal name a
 * label carries in every language (Bourgogne, Rioja, Empordà) — what a wine
 * linked to one shows instead of however it was typed.
 */
export async function libraryRegionNames(
  database: D1Database,
  ids: readonly string[],
): Promise<{ id: string; name: string }[]> {
  const wanted = [...new Set(ids)].slice(0, 100);
  if (wanted.length === 0) return [];
  const rows = await database
    .prepare(`SELECT id, name FROM kb_regions WHERE id IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(wanted))
    .all<{ id: string; name: string }>();
  return rows.results;
}
