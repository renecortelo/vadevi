import type { CurrencyCode, TasteProfile } from "@vadevi/contracts";
import { supportedCurrencies } from "@vadevi/contracts";

import {
  buildTasteProfile,
  type TasteCellarWine,
  type TasteNote,
  type TastePurchase,
} from "../services/taste-profile";
import type { FirebasePrincipal } from "../types";
import { readGrapes } from "./grape-names";
import { readPlaces } from "./region-names";

function isCurrency(value: string): value is CurrencyCode {
  return (supportedCurrencies as readonly string[]).includes(value);
}

/**
 * The reader's taste, from their own submitted tastings in every Space they
 * are an active member of, what they bought there, and the bottles waiting in
 * those cellars. Read on demand: nothing is stored, so it is never stale and
 * costs no write. Null for a reader with no account yet.
 */
export async function getTasteProfile(
  database: D1Database,
  principal: FirebasePrincipal,
  locale = "en",
  now = new Date(),
): Promise<TasteProfile | null> {
  const memberships = await database
    .prepare(
      `SELECT actor.id AS user_id, membership.space_id
      FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
        AND membership.status = 'active'
      JOIN spaces space ON space.id = membership.space_id AND space.deleted_at IS NULL
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL`,
    )
    .bind(principal.firebaseUid)
    .all<{ space_id: string; user_id: string }>();
  const first = memberships.results[0];
  if (first === undefined) return null;
  const userId = first.user_id;
  const spaces = JSON.stringify(memberships.results.map((row) => row.space_id));
  const mine = `note.author_user_id = ? AND note.space_id IN (SELECT value FROM json_each(?))
    AND note.state = 'submitted' AND note.deleted_at IS NULL`;

  const [noteRows, descriptorRows, purchaseRows, cellarRows] = await database.batch([
    database
      .prepare(
        `SELECT note.id, note.wine_id, note.space_id, note.score_100, note.sentiment,
          note.would_drink_again, note.acidity, note.tannin_level, note.body, note.sweetness,
          note.finish_length, note.tasted_at, wine.display_name,
          coalesce(wine.wine_type_free, wine.wine_type) AS type, wine.country_code, wine.region
        FROM tasting_notes note
        JOIN wine_records wine ON wine.id = note.wine_id AND wine.deleted_at IS NULL
        WHERE ${mine}
        ORDER BY note.tasted_at DESC LIMIT 2000`,
      )
      .bind(userId, spaces),
    database
      .prepare(
        `SELECT descriptor.tasting_note_id, descriptor.descriptor_code, descriptor.label_snapshot
        FROM tasting_descriptors descriptor
        WHERE descriptor.tasting_note_id IN (SELECT note.id FROM tasting_notes note WHERE ${mine})`,
      )
      .bind(userId, spaces),
    database
      .prepare(
        `SELECT purchase.wine_id, purchase.space_id, purchase.currency,
          purchase.unit_amount_minor, wine.display_name
        FROM purchases purchase
        JOIN wine_records wine ON wine.id = purchase.wine_id AND wine.deleted_at IS NULL
        WHERE purchase.purchaser_user_id = ? AND purchase.deleted_at IS NULL
          AND purchase.space_id IN (SELECT value FROM json_each(?))`,
      )
      .bind(userId, spaces),
    // Bottles waiting in any of their cellars, theirs or shared.
    database
      .prepare(
        `SELECT DISTINCT bottle.wine_id, bottle.space_id, wine.display_name,
          coalesce(wine.wine_type_free, wine.wine_type) AS type, wine.country_code, wine.region
        FROM bottles bottle
        JOIN wine_records wine ON wine.id = bottle.wine_id AND wine.deleted_at IS NULL
        WHERE bottle.state = 'owned' AND bottle.deleted_at IS NULL
          AND bottle.space_id IN (SELECT value FROM json_each(?))`,
      )
      .bind(spaces),
  ]);

  type WineRow = {
    country_code: string | null;
    display_name: string;
    region: string | null;
    space_id: string;
    type: string | null;
    wine_id: string;
  };
  const notes = (noteRows?.results ?? []) as (WineRow & {
    acidity: number | null;
    body: number | null;
    finish_length: number | null;
    id: string;
    score_100: number | null;
    sentiment: TasteNote["sentiment"];
    sweetness: number | null;
    tannin_level: number | null;
    tasted_at: string;
    would_drink_again: TasteNote["wouldDrinkAgain"];
  })[];
  const cellarWines = (cellarRows?.results ?? []) as WineRow[];
  const purchaseList = (
    (purchaseRows?.results ?? []) as {
      currency: string;
      display_name: string;
      space_id: string;
      unit_amount_minor: number;
      wine_id: string;
    }[]
  ).flatMap((row): TastePurchase[] =>
    isCurrency(row.currency)
      ? [
          {
            currency: row.currency,
            spaceId: row.space_id,
            unitMinor: row.unit_amount_minor,
            wineId: row.wine_id,
            wineName: row.display_name,
          },
        ]
      : [],
  );

  // Grapes, and each wine's region as one name and its country.
  const wineIds = [...new Set([...notes, ...cellarWines].map((row) => row.wine_id))];
  const grapeRows =
    wineIds.length === 0
      ? { results: [] }
      : await database
          .prepare(
            `SELECT wine_id, name_snapshot FROM wine_grapes
            WHERE wine_id IN (SELECT value FROM json_each(?)) ORDER BY position`,
          )
          .bind(JSON.stringify(wineIds))
          .all<{ name_snapshot: string; wine_id: string }>();
  // Each grape as one name: "Tinto Fino" and "Tempranillo" are one taste.
  const grapeNames = await readGrapes(
    database,
    grapeRows.results.map((row) => row.name_snapshot),
    locale,
  );
  const grapesOf = new Map<string, string[]>();
  for (const row of grapeRows.results) {
    const name = grapeNames.get(row.name_snapshot.trim()) ?? row.name_snapshot;
    grapesOf.set(row.wine_id, [...(grapesOf.get(row.wine_id) ?? []), name]);
  }
  const places = await readPlaces(
    database,
    [...new Map([...notes, ...cellarWines].map((row) => [row.wine_id, row])).values()].map(
      (row) => ({ countryCode: row.country_code, id: row.wine_id, region: row.region }),
    ),
  );
  const descriptorsOf = new Map<string, { code: string; label: string }[]>();
  for (const row of (descriptorRows?.results ?? []) as {
    descriptor_code: string;
    label_snapshot: string;
    tasting_note_id: string;
  }[]) {
    descriptorsOf.set(row.tasting_note_id, [
      ...(descriptorsOf.get(row.tasting_note_id) ?? []),
      { code: row.descriptor_code, label: row.label_snapshot },
    ]);
  }
  // What each wine cost them, at the least they paid.
  const priceOf = new Map<string, { currency: CurrencyCode; unitMinor: number }>();
  for (const purchase of purchaseList) {
    const known = priceOf.get(purchase.wineId);
    if (
      known === undefined ||
      (known.currency === purchase.currency && purchase.unitMinor < known.unitMinor)
    ) {
      priceOf.set(purchase.wineId, { currency: purchase.currency, unitMinor: purchase.unitMinor });
    }
  }

  const tasteNotes: TasteNote[] = notes.map((row) => ({
    acidity: row.acidity,
    body: row.body,
    country: places.get(row.wine_id)?.country ?? row.country_code,
    descriptors: descriptorsOf.get(row.id) ?? [],
    finish: row.finish_length,
    grapes: grapesOf.get(row.wine_id) ?? [],
    price: priceOf.get(row.wine_id) ?? null,
    region: places.get(row.wine_id)?.region ?? null,
    score: row.score_100,
    sentiment: row.sentiment,
    spaceId: row.space_id,
    sweetness: row.sweetness,
    tannin: row.tannin_level,
    tastedAt: row.tasted_at,
    type: row.type,
    wineId: row.wine_id,
    wineName: row.display_name,
    wouldDrinkAgain: row.would_drink_again,
  }));
  const cellar: TasteCellarWine[] = cellarWines.map((row) => ({
    country: places.get(row.wine_id)?.country ?? row.country_code,
    grapes: grapesOf.get(row.wine_id) ?? [],
    region: places.get(row.wine_id)?.region ?? null,
    spaceId: row.space_id,
    type: row.type,
    wineId: row.wine_id,
    wineName: row.display_name,
  }));
  return buildTasteProfile(tasteNotes, purchaseList, cellar, now);
}
