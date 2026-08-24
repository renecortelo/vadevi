import type {
  ConfirmIdentificationRequest,
  IdentificationCandidate,
  IdentificationRequest,
  IdentificationResponse,
  IdentificationWarning,
} from "@vadevi/contracts";
import type { OcrLine, OcrPort, ProductLookupPort } from "@vadevi/domain";
import { ulid } from "ulid";

import type { FirebasePrincipal } from "../types";
import { createWine, normalizeWineText } from "./wine-memory";

/** §10.6 drafts expire; a stale proposal must not be confirmable hours later. */
export const identificationTtlSeconds = 30 * 60;

type ActorRow = { user_id: string };

type WineMatchRow = {
  country_code: string | null;
  display_name: string;
  id: string;
  producer_name: string;
  region: string | null;
  vintage_year: number | null;
  wine_type: string | null;
};

export type IdentificationPorts = Readonly<{
  ocr: OcrPort | null;
  product: ProductLookupPort | null;
}>;

function field<T>(
  value: T | null | undefined,
  confidence: "high" | "low" | "medium",
  evidence: "inferred" | "observed" | "personal" | "researched",
  sourceIds: string[] = [],
) {
  return value === null || value === undefined
    ? undefined
    : { confidence, evidence, sourceIds, value };
}

/**
 * A wine already in this Space, matched by barcode or by name.
 *
 * This is the strongest candidate available and needs no external provider: the
 * user confirmed these values before, so they are `observed` evidence. A
 * barcode hit is exact, so it outranks a fuzzy text match.
 */
function spaceCandidate(
  row: WineMatchRow,
  origin: "space_barcode" | "space_text",
): IdentificationCandidate {
  const confidence = origin === "space_barcode" ? "high" : "medium";
  const fields: IdentificationCandidate["fields"] = {};
  const producer = field(row.producer_name, "high", "observed");
  if (producer !== undefined) fields.producerName = producer;
  const display = field(row.display_name, confidence, "observed");
  if (display !== undefined) fields.displayName = display;
  const vintage = field(row.vintage_year, confidence, "observed");
  if (vintage !== undefined) fields.vintageYear = vintage;
  const region = field(row.region, "medium", "observed");
  if (region !== undefined) fields.region = region;
  const country = field(row.country_code, "medium", "observed");
  if (country !== undefined) fields.countryCode = country;
  const type = field(row.wine_type, "medium", "observed");
  if (type !== undefined) fields.wineType = type;

  return {
    candidateId: `${origin}:${row.id}`,
    fields,
    matchedWineId: row.id,
    origin,
    possibleDuplicateWineIds: [row.id],
  };
}

async function membership(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
): Promise<ActorRow | null> {
  return database
    .prepare(
      `SELECT actor.id AS user_id FROM users actor
      JOIN space_memberships m ON m.user_id = actor.id
      JOIN spaces space ON space.id = m.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND m.space_id = ? AND m.status = 'active' AND space.deleted_at IS NULL`,
    )
    .bind(principal.firebaseUid, spaceId)
    .first<ActorRow>();
}

const wineColumns = `id, display_name, producer_name, vintage_year, COALESCE(wine_type_free, wine_type) AS wine_type, country_code, region`;

/** Exact barcode hit inside the Space. No provider, works offline-first. */
async function matchByBarcode(
  database: D1Database,
  spaceId: string,
  barcode: string,
): Promise<WineMatchRow[]> {
  const result = await database
    .prepare(
      `SELECT ${wineColumns} FROM wine_records
      WHERE space_id = ? AND barcode = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC LIMIT 3`,
    )
    .bind(spaceId, barcode)
    .all<WineMatchRow>();
  return result.results;
}

/**
 * Accent-insensitive match of scanned or typed text against the Space, using
 * the same normalizer the Wine Memory search already uses.
 */
async function matchByText(
  database: D1Database,
  spaceId: string,
  text: string,
): Promise<WineMatchRow[]> {
  const normalized = normalizeWineText(text);
  if (normalized.length < 3) return [];
  const terms = normalized.split(" ").filter((term) => term.length >= 3);
  if (terms.length === 0) return [];

  // Each term must appear somewhere in the producer, name, or alias text, which
  // keeps a two-word label from matching every wine sharing one common word.
  const conditions = terms
    .map(
      () => `(wine.normalized_producer_name LIKE ? OR wine.normalized_name LIKE ?
        OR EXISTS (SELECT 1 FROM wine_aliases a WHERE a.wine_id = wine.id
          AND a.space_id = wine.space_id AND a.normalized_alias LIKE ?))`,
    )
    .join(" AND ");
  const bindings = terms.flatMap((term) => [`%${term}%`, `%${term}%`, `%${term}%`]);

  const result = await database
    .prepare(
      `SELECT ${wineColumns} FROM wine_records wine
      WHERE space_id = ? AND deleted_at IS NULL AND ${conditions}
      ORDER BY updated_at DESC LIMIT 3`,
    )
    .bind(spaceId, ...bindings)
    .all<WineMatchRow>();
  return result.results;
}

/**
 * Build an expiring identification draft.
 *
 * Candidate sources are tried strongest first. Nothing here creates a wine, and
 * every source is optional: with no barcode match, no provider, and no OCR the
 * result is an explicit `manual_required` draft and the manual form still works,
 * which is what `AC-014` requires.
 */
export async function createIdentification(
  database: D1Database,
  options: {
    mediaBytes?: ArrayBuffer;
    mediaMimeType?: "image/jpeg" | "image/webp";
    ports: IdentificationPorts;
    principal: FirebasePrincipal;
    request: IdentificationRequest;
    spaceId: string;
  },
): Promise<IdentificationResponse | null> {
  const actor = await membership(database, options.principal, options.spaceId);
  if (actor === null) return null;

  const now = new Date();
  const nowIso = now.toISOString();
  const candidates: IdentificationCandidate[] = [];
  const warnings: IdentificationWarning[] = [];
  const seen = new Set<string>();

  function push(candidate: IdentificationCandidate) {
    if (seen.has(candidate.candidateId)) return;
    seen.add(candidate.candidateId);
    candidates.push(candidate);
  }

  // 1. A bottle already in this Space, matched by barcode.
  if (options.request.barcode !== undefined) {
    for (const row of await matchByBarcode(database, options.spaceId, options.request.barcode)) {
      push(spaceCandidate(row, "space_barcode"));
    }
  }

  // 2. Optional label reading. Text only: the image is never persisted here.
  let ocrText: string | undefined = options.request.scannedText;
  if (
    options.ports.ocr !== null &&
    options.mediaBytes !== undefined &&
    options.mediaMimeType !== undefined
  ) {
    const read = await options.ports.ocr.readLabel({
      bytes: options.mediaBytes,
      locale: options.request.locale,
      mimeType: options.mediaMimeType,
    });
    if (read.status === "success") {
      const lines: readonly OcrLine[] = read.data.lines;
      ocrText = [ocrText, ...lines.map((line: OcrLine) => line.text)].filter(Boolean).join(" ");
      warnings.push(...read.data.warnings);
      const vintage = lines
        .flatMap((line: OcrLine) => line.text.match(/\b(19\d{2}|20\d{2})\b/g) ?? [])
        .map((value: string) => Number.parseInt(value, 10))
        .find((value: number) => value >= 1900 && value <= now.getUTCFullYear() + 1);
      const named = lines.filter((line: OcrLine) => line.confidence !== "low").slice(0, 2);
      if (named.length > 0) {
        const fields: IdentificationCandidate["fields"] = {};
        const producer = field(named[0]!.text, "low", "inferred");
        if (producer !== undefined) fields.producerName = producer;
        const display = field(named[1]?.text ?? named[0]!.text, "low", "inferred");
        if (display !== undefined) fields.displayName = display;
        const year = field(vintage, "medium", "inferred");
        if (year !== undefined) fields.vintageYear = year;
        push({
          candidateId: `ocr:${ulid()}`,
          fields,
          matchedWineId: null,
          origin: "ocr",
          possibleDuplicateWineIds: [],
        });
      }
    } else {
      warnings.push("label_unreadable");
    }
  } else if (options.mediaBytes !== undefined) {
    warnings.push("label_reading_disabled");
  }

  // 3. Text match against the Space, from OCR output or the user's own hint.
  const searchText = [ocrText, options.request.manualHint].filter(Boolean).join(" ");
  if (searchText.length > 0) {
    for (const row of await matchByText(database, options.spaceId, searchText)) {
      push(spaceCandidate(row, "space_text"));
    }
  }

  // 4. Optional public barcode enrichment, last because coverage is weakest.
  if (options.request.barcode !== undefined && options.ports.product !== null) {
    const lookup = await options.ports.product.lookupBarcode({
      barcode: options.request.barcode,
      locale: options.request.locale,
    });
    if (lookup.status === "success") {
      const product = lookup.data;
      const fields: IdentificationCandidate["fields"] = {};
      const producer = field(product.brands[0], "low", "researched");
      if (producer !== undefined) fields.producerName = producer;
      const display = field(product.name, "low", "researched");
      if (display !== undefined) fields.displayName = display;
      if (Object.keys(fields).length > 0) {
        push({
          candidateId: `open_food_facts:${product.barcode}`,
          fields,
          matchedWineId: null,
          origin: "open_food_facts",
          possibleDuplicateWineIds: [],
        });
      }
      warnings.push(...product.warnings);
    } else {
      warnings.push("product_lookup_empty");
    }
  } else if (options.request.barcode !== undefined && options.ports.product === null) {
    warnings.push("product_lookup_disabled");
  }

  const id = ulid();
  const expiresAt = new Date(now.getTime() + identificationTtlSeconds * 1_000).toISOString();
  const status = candidates.length > 0 ? "needs_confirmation" : "manual_required";
  if (candidates.length === 0) {
    warnings.push("no_candidates");
  }

  await database
    .prepare(
      `INSERT INTO identification_drafts (
        id, space_id, user_id, status, candidates_json, warnings_json, barcode,
        media_id, confirmed_wine_id, confirmed_at, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
    )
    .bind(
      id,
      options.spaceId,
      actor.user_id,
      status,
      JSON.stringify(candidates),
      JSON.stringify(warnings),
      options.request.barcode ?? null,
      options.request.mediaId ?? null,
      expiresAt,
      nowIso,
      nowIso,
    )
    .run();

  return { data: { candidates, expiresAt, id, status, warnings } };
}

type DraftRow = {
  candidates_json: string;
  confirmed_wine_id: string | null;
  expires_at: string;
  id: string;
  space_id: string;
  user_id: string;
};

/**
 * Confirm an identification.
 *
 * The user's edited values are revalidated by the normal wine contract rather
 * than trusted from the earlier proposal, and confirming twice returns the one
 * wine that was created instead of a second copy.
 */
export async function confirmIdentification(
  database: D1Database,
  options: {
    identificationId: string;
    principal: FirebasePrincipal;
    request: ConfirmIdentificationRequest;
    requestId: string;
    spaceId: string;
  },
): Promise<
  | { kind: "conflict" }
  | { kind: "expired" }
  | { kind: "success"; replayed: boolean; wineId: string }
  | { kind: "unavailable" }
> {
  const actor = await membership(database, options.principal, options.spaceId);
  if (actor === null) return { kind: "unavailable" };

  const draft = await database
    .prepare(
      `SELECT id, space_id, user_id, candidates_json, confirmed_wine_id, expires_at
      FROM identification_drafts
      WHERE id = ? AND space_id = ? AND user_id = ?`,
    )
    .bind(options.identificationId, options.spaceId, actor.user_id)
    .first<DraftRow>();
  if (draft === null) return { kind: "unavailable" };

  // Repeating a confirmation returns the wine already created.
  if (draft.confirmed_wine_id !== null) {
    return { kind: "success", replayed: true, wineId: draft.confirmed_wine_id };
  }
  if (Date.parse(draft.expires_at) <= Date.now()) return { kind: "expired" };

  const created = await createWine(database, {
    // The draft id keys the command, so a retried confirmation is idempotent.
    idempotencyKey: `identification:${draft.id}`,
    principal: options.principal,
    request: options.request.wine,
    requestId: options.requestId,
    routeScope: `POST:/api/v1/spaces/${options.spaceId}/identifications/confirm`,
    spaceId: options.spaceId,
  });
  if (created.kind === "conflict") return { kind: "conflict" };
  if (created.kind === "unavailable") return { kind: "unavailable" };

  const wineId = created.response.data.wine.id;
  const now = new Date().toISOString();
  await database.batch([
    database
      .prepare(
        `UPDATE identification_drafts
        SET confirmed_wine_id = ?, confirmed_at = ?, updated_at = ?, candidates_json = '[]'
        WHERE id = ? AND confirmed_wine_id IS NULL`,
      )
      .bind(wineId, now, now, draft.id),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, ?, 'wine.identified', 'wine_record', ?, ?, ?, ?)`,
      )
      .bind(
        ulid(),
        actor.user_id,
        options.spaceId,
        wineId,
        options.requestId,
        JSON.stringify({ candidateId: options.request.candidateId ?? null }),
        now,
      ),
  ]);

  return { kind: "success", replayed: created.replayed, wineId };
}

/**
 * Drop expired proposals on the schedule, so a candidate the user abandoned
 * does not linger. Confirmed drafts keep only their tombstone.
 */
export async function purgeExpiredIdentifications(
  database: D1Database,
  nowIso: string,
): Promise<void> {
  await database
    .prepare(
      `DELETE FROM identification_drafts
      WHERE expires_at <= ? AND confirmed_wine_id IS NULL`,
    )
    .bind(nowIso)
    .run();
  await database
    .prepare(
      `UPDATE identification_drafts SET candidates_json = '[]', updated_at = ?
      WHERE expires_at <= ? AND candidates_json <> '[]'`,
    )
    .bind(nowIso, nowIso)
    .run();
}
