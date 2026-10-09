import type { TasteDeclaration, UpdateTasteDeclarationRequest } from "@vadevi/contracts";

import type { FirebasePrincipal } from "../types";

type Row = {
  budget_currency: string | null;
  budget_high_minor: number | null;
  budget_low_minor: number | null;
  dislikes_text: string | null;
  exploring_text: string | null;
  likes_text: string | null;
  note_text: string | null;
  updated_at: string;
  version: number;
};

const empty: TasteDeclaration = {
  budget: null,
  dislikes: null,
  exploring: null,
  likes: null,
  note: null,
  updatedAt: null,
  version: 0,
};

function fromRow(row: Row): TasteDeclaration {
  return {
    budget:
      row.budget_currency === null
        ? null
        : {
            currency: row.budget_currency as NonNullable<TasteDeclaration["budget"]>["currency"],
            highMinor: row.budget_high_minor,
            lowMinor: row.budget_low_minor,
          },
    dislikes: row.dislikes_text,
    exploring: row.exploring_text,
    likes: row.likes_text,
    note: row.note_text,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

async function readerId(
  database: D1Database,
  principal: FirebasePrincipal,
): Promise<string | null> {
  const row = await database
    .prepare(`SELECT id FROM users WHERE firebase_uid = ? AND deleted_at IS NULL`)
    .bind(principal.firebaseUid)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/** What the reader has said of their taste; empty, at version 0, until they say it. */
export async function getTasteDeclaration(
  database: D1Database,
  principal: FirebasePrincipal,
): Promise<TasteDeclaration | null> {
  const userId = await readerId(database, principal);
  if (userId === null) return null;
  const row = await database
    .prepare(`SELECT * FROM taste_declarations WHERE user_id = ?`)
    .bind(userId)
    .first<Row>();
  return row === null ? empty : fromRow(row);
}

/**
 * Saved over the version the reader was looking at, or not at all: two
 * devices editing at once get a conflict, not a silent overwrite.
 */
export async function saveTasteDeclaration(
  database: D1Database,
  principal: FirebasePrincipal,
  request: UpdateTasteDeclarationRequest,
): Promise<
  | { declaration: TasteDeclaration; kind: "saved" }
  | { current: TasteDeclaration; kind: "conflict" }
  | { kind: "unavailable" }
> {
  const userId = await readerId(database, principal);
  if (userId === null) return { kind: "unavailable" };
  const now = new Date().toISOString();
  const blank = (value: string | null) => (value === null || value.length === 0 ? null : value);
  const values = [
    blank(request.likes),
    blank(request.dislikes),
    blank(request.exploring),
    blank(request.note),
    request.budget?.currency ?? null,
    request.budget?.lowMinor ?? null,
    request.budget?.highMinor ?? null,
  ];
  const result =
    request.version === 0
      ? await database
          .prepare(
            `INSERT INTO taste_declarations (
              user_id, likes_text, dislikes_text, exploring_text, note_text,
              budget_currency, budget_low_minor, budget_high_minor, version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            ON CONFLICT(user_id) DO NOTHING`,
          )
          .bind(userId, ...values, now, now)
          .run()
      : await database
          .prepare(
            `UPDATE taste_declarations SET likes_text = ?, dislikes_text = ?, exploring_text = ?,
              note_text = ?, budget_currency = ?, budget_low_minor = ?, budget_high_minor = ?,
              version = version + 1, updated_at = ?
            WHERE user_id = ? AND version = ?`,
          )
          .bind(...values, now, userId, request.version)
          .run();
  const current = await getTasteDeclaration(database, principal);
  if (current === null) return { kind: "unavailable" };
  return result.meta.changes === 1
    ? { declaration: current, kind: "saved" }
    : { current, kind: "conflict" };
}
