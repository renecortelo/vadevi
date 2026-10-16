/**
 * The hint a voice tasting's transcription is given: the words a wine is
 * described with in the reader's language, the best-known grapes, and the
 * registered names the reader's own wines come from — so the model hears
 * "Mencía" and "taninos", not "Menchia" and "zaninos" (tested on 16 October
 * 2026, docs/backlog.md P18). Names only: nothing the reader wrote.
 */
const tastingWords: Record<string, string> = {
  ca: "Tast de vi: color, nas, boca, acidesa, tanins, cos, final, anyada, raïm.",
  de: "Weinverkostung: Farbe, Nase, Gaumen, Säure, Tannine, Körper, Abgang, Jahrgang, Rebsorte.",
  en: "Wine tasting: colour, nose, palate, acidity, tannins, body, finish, vintage, grape.",
  es: "Cata de vino: color, nariz, boca, acidez, taninos, cuerpo, final, añada, uva.",
  fr: "Dégustation de vin : robe, nez, bouche, acidité, tanins, corps, finale, millésime, cépage.",
  it: "Degustazione di vino: colore, naso, bocca, acidità, tannini, corpo, finale, annata, vitigno.",
  nl: "Wijnproeverij: kleur, neus, smaak, zuren, tannines, body, afdronk, oogstjaar, druif.",
  pt: "Prova de vinho: cor, nariz, boca, acidez, taninos, corpo, final, colheita, casta.",
};

/** Whisper reads about 220 tokens of hint; this stays well inside them. */
const hintLimit = 700;

export async function voiceVocabulary(
  database: D1Database,
  options: { locale: string; spaceId: string },
): Promise<string> {
  const language = options.locale.split("-")[0]!;
  const [grapes, regions] = await database.batch([
    database
      .prepare(
        `SELECT coalesce(
            (SELECT name FROM kb_names WHERE entity_type = 'grape' AND entity_id = grape.id
              AND kind = 'primary' AND locale = ?),
            (SELECT name FROM kb_names WHERE entity_type = 'grape' AND entity_id = grape.id
              AND kind = 'primary' AND locale = 'en')
          ) AS name
        FROM kb_grapes grape ORDER BY grape.prominence DESC LIMIT 20`,
      )
      .bind(language),
    database
      .prepare(
        `SELECT DISTINCT region.name FROM wine_records wine
        JOIN kb_regions region ON region.id = wine.region_ref
        WHERE wine.space_id = ? AND wine.deleted_at IS NULL
        ORDER BY region.prominence DESC LIMIT 20`,
      )
      .bind(options.spaceId),
  ]);
  const names = (result: D1Result | undefined) =>
    ((result?.results ?? []) as { name: string | null }[]).flatMap((row) =>
      row.name === null ? [] : [row.name],
    );
  const hint = [
    tastingWords[language] ?? tastingWords.en!,
    names(regions).join(", "),
    names(grapes).join(", "),
  ]
    .filter((part) => part !== "")
    .join(" ");
  return hint.length <= hintLimit ? hint : hint.slice(0, hint.lastIndexOf(",", hintLimit));
}
