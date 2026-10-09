import { normalizeWineText } from "./wine-memory";

/**
 * One grape, however it was written.
 *
 * A wine records its grapes as the label or the reader wrote them: "Tinto
 * Fino", "Tempranillo", "tempranillo" and "Ull de Llebre" are one variety, and
 * counting them apart split the reader's favourite grape four ways. A name the
 * wine library knows — by any of its names or synonyms, and for one grape only
 * — is read as that grape, named as the library names it in the reader's
 * language. A name it does not know is read as itself, accents and case aside,
 * in the spelling its wines use most.
 *
 * Nothing is written: the wine keeps the name it was recorded with.
 */
export async function readGrapes(
  database: D1Database,
  names: readonly string[],
  locale: string,
): Promise<Map<string, string>> {
  const recorded = names.map((name) => name.trim()).filter((name) => name.length > 0);
  const normalized = [...new Set(recorded.map(normalizeWineText))].filter(
    (name) => name.length > 0,
  );
  const known = new Map<string, string>();
  if (normalized.length > 0) {
    const rows = await database
      .prepare(
        `SELECT normalized_name AS name, COUNT(DISTINCT entity_id) AS grapes, MIN(entity_id) AS id
        FROM kb_names
        WHERE entity_type = 'grape' AND normalized_name IN (SELECT value FROM json_each(?))
        GROUP BY normalized_name`,
      )
      .bind(JSON.stringify(normalized))
      .all<{ grapes: number; id: string; name: string }>();
    // A synonym two grapes share names neither for certain.
    const certain = rows.results.filter((row) => row.grapes === 1);
    const short = locale.split("-")[0]!;
    const labels =
      certain.length === 0
        ? { results: [] }
        : await database
            .prepare(
              `SELECT entity_id AS id, locale, name FROM kb_names
              WHERE entity_type = 'grape' AND kind = 'primary' AND locale IN (?, 'en')
                AND entity_id IN (SELECT value FROM json_each(?))`,
            )
            .bind(short, JSON.stringify([...new Set(certain.map((row) => row.id))]))
            .all<{ id: string; locale: string; name: string }>();
    const labelOf = new Map<string, string>();
    for (const row of labels.results) {
      if (row.locale === short || !labelOf.has(row.id)) labelOf.set(row.id, row.name);
    }
    for (const row of certain) {
      const label = labelOf.get(row.id);
      if (label !== undefined) known.set(row.name, label);
    }
  }
  // Otherwise the spelling used most, accents first on a tie.
  const spellings = new Map<string, Map<string, number>>();
  for (const name of recorded) {
    const key = normalizeWineText(name);
    const counts = spellings.get(key) ?? new Map<string, number>();
    counts.set(name, (counts.get(name) ?? 0) + 1);
    spellings.set(key, counts);
  }
  const capitalised = (name: string) => (/^\p{Lu}/u.test(name) ? 1 : 0);
  const accents = (name: string) =>
    [...name.normalize("NFD")].filter((letter) => /\p{M}/u.test(letter)).length;
  const readings = new Map<string, string>();
  for (const name of new Set(recorded)) {
    const key = normalizeWineText(name);
    const spelled = [...(spellings.get(key) ?? new Map<string, number>())].sort(
      ([leftName, left], [rightName, right]) =>
        right - left ||
        accents(rightName) - accents(leftName) ||
        capitalised(rightName) - capitalised(leftName) ||
        leftName.localeCompare(rightName),
    )[0]?.[0];
    readings.set(name, known.get(key) ?? spelled ?? name);
  }
  return readings;
}
