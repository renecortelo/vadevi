import { ulid } from "ulid";

import { regionRefOf } from "./region-names";
import { normalizeWineText } from "./wine-memory";

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

/** How many single-letter edits turn one word into the other. */
function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}

/**
 * The registered name a heard region is, if any: as the cellar reads one
 * (`regionRefOf`), or else the one name of the country within a couple of
 * letters of it — speech to text hears "Ries Baixes" for Rías Baixas, "Docai"
 * for Tokaj (16 October 2026). Only one candidate that close is taken; two
 * equally close are no answer.
 */
export async function placeHeardRegion(
  database: D1Database,
  heard: string,
  countryCode: string | null,
): Promise<{ name: string; regionId: string } | null> {
  const exact = await regionRefOf(database, heard, countryCode);
  if (exact !== null) {
    const row = await database
      .prepare(`SELECT name FROM kb_regions WHERE id = ?`)
      .bind(exact)
      .first<{ name: string }>();
    return row === null ? null : { name: row.name, regionId: exact };
  }
  if (countryCode === null) return null;
  const target = normalizeWineText(heard);
  if (target.length < 4) return null;
  const rows = await database
    .prepare(
      `SELECT DISTINCT name.normalized_name AS form, region.id, region.name
      FROM kb_names name JOIN kb_regions region ON region.id = name.entity_id
      WHERE name.entity_type = 'region' AND region.country_code = ?`,
    )
    .bind(countryCode)
    .all<{ form: string; id: string; name: string }>();
  const allowed = Math.max(1, Math.floor(target.length / 5));
  let best: { distance: number; ids: Set<string>; name: string } | null = null;
  for (const row of rows.results) {
    const distance = editDistance(target, row.form);
    if (distance > allowed) continue;
    if (best === null || distance < best.distance) {
      best = { distance, ids: new Set([row.id]), name: row.name };
    } else if (distance === best.distance) best.ids.add(row.id);
  }
  return best === null || best.ids.size !== 1
    ? null
    : { name: best.name, regionId: [...best.ids][0]! };
}

/**
 * Of the grapes a note names, those the library knows as grapes, by any of
 * their names — a model offered "Soave", an appellation, as one (16 October
 * 2026). A variety the library lacks is left out rather than guessed.
 */
export async function knownGrapes(database: D1Database, names: readonly string[]) {
  if (names.length === 0) return [];
  const forms = names.map((name) => normalizeWineText(name));
  const rows = await database
    .prepare(
      `SELECT DISTINCT normalized_name AS form FROM kb_names
      WHERE entity_type = 'grape' AND normalized_name IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(forms))
    .all<{ form: string }>();
  const known = new Set(rows.results.map((row) => row.form));
  return names.filter((_, index) => known.has(forms[index]!));
}

/** How long a note sent for review is kept, and how many a member may send a day. */
export const voiceReviewDays = 30;
const voiceReviewsPerDay = 30;

/**
 * Keep a spoken note the reader chose to send for review: the transcript as
 * they corrected it, what the app proposed and the form as they left it —
 * never the audio — for thirty days. Null when the reader is not an active
 * member of the Space; "LIMIT" past a day's sending.
 */
export async function saveVoiceReview(
  database: D1Database,
  options: {
    firebaseUid: string;
    form: Record<string, unknown>;
    kind: "deep" | "quick" | "wine";
    locale: string;
    nowIso: string;
    proposal: unknown;
    spaceId: string;
    text: string;
  },
): Promise<{ expiresAt: string; id: string } | "LIMIT" | null> {
  const member = await database
    .prepare(
      `SELECT actor.id AS id FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
        AND membership.space_id = ? AND membership.status = 'active'
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL`,
    )
    .bind(options.spaceId, options.firebaseUid)
    .first<{ id: string }>();
  if (member === null) return null;
  const since = new Date(Date.parse(options.nowIso) - 86_400_000).toISOString();
  const sent = await database
    .prepare(`SELECT COUNT(*) AS count FROM voice_reviews WHERE user_id = ? AND created_at > ?`)
    .bind(member.id, since)
    .first<{ count: number }>();
  if ((sent?.count ?? 0) >= voiceReviewsPerDay) return "LIMIT";
  const id = ulid();
  const expiresAt = new Date(
    Date.parse(options.nowIso) + voiceReviewDays * 86_400_000,
  ).toISOString();
  await database
    .prepare(
      `INSERT INTO voice_reviews
        (id, space_id, user_id, form, locale, transcript, proposal_json, form_json, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      options.spaceId,
      member.id,
      options.kind,
      options.locale,
      options.text,
      JSON.stringify(options.proposal),
      JSON.stringify(options.form),
      options.nowIso,
      expiresAt,
    )
    .run();
  return { expiresAt, id };
}
