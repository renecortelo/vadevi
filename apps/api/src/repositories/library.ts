import type { LibraryGrape, LibraryRegion } from "@vadevi/contracts";

import { suggestedPairingsFor } from "../adapters/grape-pairing";
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
        AND (name.normalized_name = ? OR name.normalized_name LIKE ? || '%')
      ORDER BY (name.normalized_name = ?) DESC, grape.prominence DESC
      LIMIT ?`,
    )
    .bind(normalized, normalized, normalized, limit)
    .all<{ id: string }>();
  return rows.results.map((row) => row.id);
}

/**
 * The grapes named anywhere in a sentence — "¿a qué huele un Ull de Llebre?"
 * finds Tempranillo — matched on whole words, the longest name first, so
 * "Pinot Noir" wins over a lone "Pinot".
 */
export async function grapesMentionedIn(database: D1Database, message: string): Promise<string[]> {
  const padded = ` ${normalizeWineText(message)} `;
  if (padded.trim().length < 3) return [];
  const rows = await database
    .prepare(
      `SELECT name.entity_id AS id, max(length(name.normalized_name)) AS matched
      FROM kb_names name
      WHERE name.entity_type = 'grape' AND length(name.normalized_name) >= 4
        AND instr(?, ' ' || name.normalized_name || ' ') > 0
      GROUP BY name.entity_id
      ORDER BY matched DESC
      LIMIT 3`,
    )
    .bind(padded)
    .all<{ id: string }>();
  return rows.results.map((row) => row.id);
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

  const [names, summaries, attributes, evidence, labels, linkedRegions] = await database.batch([
    database
      .prepare(
        `SELECT locale, name, kind FROM kb_names
        WHERE entity_type = 'grape' AND entity_id = ? ORDER BY kind, name`,
      )
      .bind(grapeId),
    database
      .prepare(
        `SELECT locale, text, source_url, license, translated FROM kb_summaries
        WHERE entity_type = 'grape' AND entity_id = ? AND locale IN (?, 'en')`,
      )
      .bind(grapeId, locale),
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
  ]);
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
    nameRows.find((row) => row.kind === "primary" && row.locale === locale)?.name ??
    nameRows.find((row) => row.kind === "primary" && row.locale === "en")?.name ??
    grapeId;
  const summaryRows = (summaries?.results ?? []) as {
    license: string;
    locale: string;
    source_url: string;
    text: string;
    translated: number;
  }[];
  const summary =
    summaryRows.find((row) => row.locale === locale) ??
    summaryRows.find((row) => row.locale === "en") ??
    null;
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
      names: nameRows.map((row) => row.name),
      styles,
      tannin: grape.tannin,
    }),
    synonyms: [...new Set(nameRows.filter((row) => row.name !== primary).map((row) => row.name))],
    tannin: grape.tannin,
    wikidataId: grape.wikidata_id,
  };
}

/** Grapes whose name starts with or equals the query, for a picker. */
export async function searchLibraryGrapes(
  database: D1Database,
  query: string,
  locale: string,
): Promise<{ color: LibraryGrape["color"]; id: string; name: string }[]> {
  const ids = await findGrapesByName(database, query, 10);
  const cards = await Promise.all(ids.map((id) => getLibraryGrape(database, id, locale)));
  return cards.flatMap((card) =>
    card === null ? [] : [{ color: card.color, id: card.id, name: card.name }],
  );
}

/** Registered wine names named anywhere in a sentence, longest first. */
export async function regionsMentionedIn(database: D1Database, message: string): Promise<string[]> {
  const padded = ` ${normalizeWineText(message)} `;
  if (padded.trim().length < 3) return [];
  const rows = await database
    .prepare(
      `SELECT name.entity_id AS id, max(length(name.normalized_name)) AS matched
      FROM kb_names name
      WHERE name.entity_type = 'region' AND length(name.normalized_name) >= 4
        AND instr(?, ' ' || name.normalized_name || ' ') > 0
      GROUP BY name.entity_id
      ORDER BY matched DESC
      LIMIT 2`,
    )
    .bind(padded)
    .all<{ id: string }>();
  return rows.results.map((row) => row.id);
}

/** A registered wine name, best known first, by any of its names. */
export async function searchLibraryRegions(
  database: D1Database,
  query: string,
  country: string | null = null,
): Promise<{ countryCode: string; giType: "PDO" | "PGI"; id: string; name: string }[]> {
  const normalized = normalizeWineText(query);
  if (normalized.length === 0) return [];
  const rows = await database
    .prepare(
      `SELECT DISTINCT region.id, region.name, region.country_code, region.gi_type, region.prominence
      FROM kb_names name
      JOIN kb_regions region ON region.id = name.entity_id
      WHERE name.entity_type = 'region'
        AND (name.normalized_name = ? OR name.normalized_name LIKE ? || '%')
        AND (? IS NULL OR region.country_code = ?)
      ORDER BY (name.normalized_name = ?) DESC, region.prominence DESC, region.name
      LIMIT 10`,
    )
    .bind(normalized, normalized, country, country, normalized)
    .all<{ country_code: string; gi_type: "PDO" | "PGI"; id: string; name: string }>();
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
        latitude, longitude, wikidata_id
      FROM kb_regions WHERE id = ?`,
    )
    .bind(regionId)
    .first<{
      country_code: string;
      eambrosia_id: string;
      gi_type: "PDO" | "PGI";
      id: string;
      latitude: number | null;
      legal_url: string | null;
      longitude: number | null;
      name: string;
      registered_on: string | null;
      wikidata_id: string | null;
    }>();
  if (region === null) return null;
  const [names, summaries, grapes] = await database.batch([
    database
      .prepare(`SELECT locale, name FROM kb_names WHERE entity_type = 'region' AND entity_id = ?`)
      .bind(regionId),
    database
      .prepare(
        `SELECT locale, text, source_url, license FROM kb_summaries
        WHERE entity_type = 'region' AND entity_id = ? AND locale IN (?, 'en')`,
      )
      .bind(regionId, locale),
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
  ]);
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
  }[];
  const summary =
    summaryRows.find((row) => row.locale === locale) ??
    summaryRows.find((row) => row.locale === "en") ??
    null;
  return {
    countryCode: region.country_code,
    eambrosiaId: region.eambrosia_id,
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
    registeredOn: region.registered_on,
    summary:
      summary === null
        ? null
        : {
            license: summary.license,
            locale: summary.locale,
            sourceUrl: summary.source_url,
            text: summary.text,
          },
    wikidataId: region.wikidata_id,
  };
}
