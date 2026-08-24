import { type ExportDocument, ExportSchemaVersion, type ExportScope } from "@vadevi/contracts";

import { createZipArchive } from "../services/zip";
import type { FirebasePrincipal } from "../types";

type ActorRow = {
  role: "admin" | "member" | "owner";
  space_name: string;
  space_type: "couple" | "group" | "personal";
  user_id: string;
};

/**
 * Owners and admins export the whole Space. A member exports their own
 * contributions plus the shared wine metadata they can already read.
 */
export async function resolveExportActor(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
): Promise<{ actor: ActorRow; scope: ExportScope } | null> {
  const actor = await database
    .prepare(
      `SELECT actor.id AS user_id, membership.role, space.name AS space_name, space.type AS space_type
      FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
      JOIN spaces space ON space.id = membership.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.space_id = ? AND membership.status = 'active'
        AND space.deleted_at IS NULL`,
    )
    .bind(principal.firebaseUid, spaceId)
    .first<ActorRow>();
  if (actor === null) return null;
  return { actor, scope: actor.role === "member" ? "own" : "space" };
}

/**
 * A draft note stays author-only in every scope, so a Space export never
 * discloses another member's unsubmitted tasting text.
 */
const tastingVisibility = `note.deleted_at IS NULL
  AND (note.author_user_id = ? OR (? = 'space' AND note.state = 'submitted'))`;

export async function buildExportDocument(
  database: D1Database,
  options: { actor: ActorRow; scope: ExportScope; spaceId: string },
): Promise<ExportDocument> {
  const { actor, scope, spaceId } = options;
  const ownOnly = scope === "own" ? 1 : 0;

  const wines = await database
    .prepare(
      `SELECT id, display_name, producer_name, vintage_year, non_vintage, COALESCE(wine_type_free, wine_type) AS wine_type,
        country_code, region, appellation, identity_status, merged_into_wine_id,
        created_at, updated_at
      FROM wine_records WHERE space_id = ? AND deleted_at IS NULL
      ORDER BY created_at, id`,
    )
    .bind(spaceId)
    .all<{
      appellation: string | null;
      country_code: string | null;
      created_at: string;
      display_name: string;
      id: string;
      identity_status: "confirmed" | "draft" | "needs_review";
      merged_into_wine_id: string | null;
      non_vintage: number;
      producer_name: string;
      region: string | null;
      updated_at: string;
      vintage_year: number | null;
      wine_type: string | null;
    }>();

  const tastings = await database
    .prepare(
      `SELECT note.id, note.wine_id, note.author_user_id, note.mode, note.state,
        note.tasted_at, note.score_100, note.sentiment, note.would_drink_again,
        note.would_buy, note.comment, context.food_text
      FROM tasting_notes note
      LEFT JOIN tasting_contexts context
        ON context.tasting_note_id = note.id AND context.space_id = note.space_id
      WHERE note.space_id = ? AND ${tastingVisibility}
      ORDER BY note.tasted_at, note.id`,
    )
    .bind(spaceId, actor.user_id, scope)
    .all<{
      author_user_id: string;
      comment: string | null;
      food_text: string | null;
      id: string;
      mode: "deep" | "quick";
      score_100: number | null;
      sentiment: string | null;
      state: "draft" | "submitted";
      tasted_at: string;
      wine_id: string;
      would_buy: string | null;
      would_drink_again: string | null;
    }>();

  const descriptors = await database
    .prepare(
      `SELECT descriptor.tasting_note_id, descriptor.descriptor_code
      FROM tasting_descriptors descriptor
      JOIN tasting_notes note ON note.id = descriptor.tasting_note_id
        AND note.space_id = descriptor.space_id
      WHERE descriptor.space_id = ? AND ${tastingVisibility}
      ORDER BY descriptor.tasting_note_id, descriptor.descriptor_code`,
    )
    .bind(spaceId, actor.user_id, scope)
    .all<{ descriptor_code: string; tasting_note_id: string }>();
  const descriptorsByNote = new Map<string, string[]>();
  for (const row of descriptors.results) {
    const list = descriptorsByNote.get(row.tasting_note_id) ?? [];
    list.push(row.descriptor_code);
    descriptorsByNote.set(row.tasting_note_id, list);
  }

  const bottles = await database
    .prepare(
      `SELECT id, wine_id, purchase_id, state, storage_location_text, acquired_at
      FROM bottles WHERE space_id = ? AND deleted_at IS NULL
        AND (? = 0 OR created_by_user_id = ?)
      ORDER BY acquired_at, id`,
    )
    .bind(spaceId, ownOnly, actor.user_id)
    .all<{
      acquired_at: string;
      id: string;
      purchase_id: string | null;
      state: string;
      storage_location_text: string | null;
      wine_id: string;
    }>();

  const purchases = await database
    .prepare(
      `SELECT id, wine_id, purchaser_user_id, merchant_name, purchased_at,
        unit_amount_minor, currency, quantity
      FROM purchases WHERE space_id = ? AND deleted_at IS NULL
        AND (? = 0 OR purchaser_user_id = ?)
      ORDER BY purchased_at, id`,
    )
    .bind(spaceId, ownOnly, actor.user_id)
    .all<{
      currency: string;
      id: string;
      merchant_name: string;
      purchased_at: string;
      purchaser_user_id: string;
      quantity: number;
      unit_amount_minor: number;
      wine_id: string;
    }>();

  const prices = await database
    .prepare(
      `SELECT id, wine_id, amount_minor, currency, merchant_name, channel,
        vintage_match, source_type, observed_at
      FROM price_observations WHERE space_id = ? AND deleted_at IS NULL
        AND (? = 0 OR observer_user_id = ?)
      ORDER BY observed_at, id`,
    )
    .bind(spaceId, ownOnly, actor.user_id)
    .all<{
      amount_minor: number;
      channel: string;
      currency: string;
      id: string;
      merchant_name: string | null;
      observed_at: string;
      source_type: string;
      vintage_match: string;
      wine_id: string;
    }>();

  const wishlist = await database
    .prepare(
      `SELECT id, wine_id, reason, priority, target_amount_minor, target_currency, state
      FROM wishlist_items WHERE space_id = ? AND deleted_at IS NULL
        AND (? = 0 OR created_by_user_id = ?)
      ORDER BY created_at, id`,
    )
    .bind(spaceId, ownOnly, actor.user_id)
    .all<{
      id: string;
      priority: number;
      reason: string;
      state: string;
      target_amount_minor: number | null;
      target_currency: string | null;
      wine_id: string;
    }>();

  const facts = await database
    .prepare(
      `SELECT fact.id, fact.subject_id, fact.predicate, fact.value_json,
        fact.evidence_class, fact.status,
        COALESCE(
          (SELECT group_concat(citation.source_id) FROM fact_citations citation
            WHERE citation.fact_id = fact.id),
          ''
        ) AS source_ids
      FROM facts fact
      WHERE fact.space_id = ? AND fact.deleted_at IS NULL
      ORDER BY fact.created_at, fact.id`,
    )
    .bind(spaceId)
    .all<{
      evidence_class: string;
      id: string;
      predicate: string;
      source_ids: string;
      status: string;
      subject_id: string;
      value_json: string;
    }>();

  const sources = await database
    .prepare(
      `SELECT id, canonical_url, title, publisher, source_type, license_identifier, retrieved_at
      FROM sources WHERE space_id = ? ORDER BY created_at, id`,
    )
    .bind(spaceId)
    .all<{
      canonical_url: string | null;
      id: string;
      license_identifier: string | null;
      publisher: string | null;
      retrieved_at: string | null;
      source_type: string;
      title: string | null;
    }>();

  const audit = await database
    .prepare(
      `SELECT id, action, target_type, target_id, created_at
      FROM audit_events WHERE space_id = ?
        AND (? = 0 OR actor_user_id = ?)
      ORDER BY created_at, id`,
    )
    .bind(spaceId, ownOnly, actor.user_id)
    .all<{
      action: string;
      created_at: string;
      id: string;
      target_id: string | null;
      target_type: string | null;
    }>();

  const media = await database
    .prepare(
      `SELECT id, kind, mime_type, byte_size FROM media_assets
      WHERE space_id = ? AND processing_status = 'ready' AND deleted_at IS NULL
        AND (? = 0 OR owner_user_id = ?)
      ORDER BY created_at, id`,
    )
    .bind(spaceId, ownOnly, actor.user_id)
    .all<{ byte_size: number; id: string; kind: string; mime_type: string }>();

  return {
    data: {
      audit: audit.results.map((row) => ({
        action: row.action,
        createdAt: row.created_at,
        id: row.id,
        targetId: row.target_id,
        targetType: row.target_type,
      })),
      bottles: bottles.results.map((row) => ({
        acquiredAt: row.acquired_at,
        id: row.id,
        purchaseId: row.purchase_id,
        state: row.state,
        storageLocationText: row.storage_location_text,
        wineId: row.wine_id,
      })),
      facts: facts.results.map((row) => ({
        citationSourceIds: row.source_ids.length === 0 ? [] : row.source_ids.split(","),
        evidenceClass: row.evidence_class,
        id: row.id,
        predicate: row.predicate,
        state: row.status,
        subjectId: row.subject_id,
        valueJson: row.value_json,
      })),
      generatedAt: new Date().toISOString(),
      media: media.results.map((row) => ({
        byteSize: row.byte_size,
        id: row.id,
        kind: row.kind,
        mimeType: row.mime_type,
        selectionRequired: true as const,
      })),
      prices: prices.results.map((row) => ({
        amountMinor: row.amount_minor,
        channel: row.channel,
        currency: row.currency,
        id: row.id,
        merchantName: row.merchant_name,
        observedAt: row.observed_at,
        sourceType: row.source_type,
        vintageMatch: row.vintage_match,
        wineId: row.wine_id,
      })),
      purchases: purchases.results.map((row) => ({
        currency: row.currency,
        id: row.id,
        merchantName: row.merchant_name,
        purchasedAt: row.purchased_at,
        purchaserUserId: row.purchaser_user_id,
        quantity: row.quantity,
        unitAmountMinor: row.unit_amount_minor,
        wineId: row.wine_id,
      })),
      schemaVersion: ExportSchemaVersion,
      scope,
      sources: sources.results.map((row) => ({
        id: row.id,
        licenseCode: row.license_identifier,
        publisher: row.publisher,
        retrievedAt: row.retrieved_at,
        sourceType: row.source_type,
        title: row.title,
        url: row.canonical_url,
      })),
      space: { id: spaceId, name: actor.space_name, type: actor.space_type },
      tastings: tastings.results.map((row) => ({
        authorUserId: row.author_user_id,
        comment: row.comment,
        descriptorCodes: descriptorsByNote.get(row.id) ?? [],
        foodText: row.food_text,
        id: row.id,
        mode: row.mode,
        score100: row.score_100,
        sentiment: row.sentiment,
        state: row.state,
        tastedAt: row.tasted_at,
        wineId: row.wine_id,
        wouldBuy: row.would_buy,
        wouldDrinkAgain: row.would_drink_again,
      })),
      wines: wines.results.map((row) => ({
        appellation: row.appellation,
        countryCode: row.country_code,
        createdAt: row.created_at,
        displayName: row.display_name,
        id: row.id,
        identityStatus: row.identity_status,
        mergedIntoWineId: row.merged_into_wine_id,
        nonVintage: row.non_vintage === 1,
        producerName: row.producer_name,
        region: row.region,
        updatedAt: row.updated_at,
        vintageYear: row.vintage_year,
        wineType: row.wine_type,
      })),
      wishlist: wishlist.results.map((row) => ({
        id: row.id,
        priority: row.priority,
        reason: row.reason,
        state: row.state,
        targetAmountMinor: row.target_amount_minor,
        targetCurrency: row.target_currency,
        wineId: row.wine_id,
      })),
    },
  };
}

/** Mirrors `ExportCsvDatasetSchema`; declared locally so column lookups stay exhaustive. */
export type ExportCsvDataset = "bottles" | "prices" | "purchases" | "tastings" | "wines";

/**
 * RFC 4180 quoting. A leading `=`, `+`, `-`, `@`, tab, or carriage return is
 * prefixed with a single quote so a spreadsheet never evaluates exported user
 * text as a formula.
 */
export function csvCell(value: boolean | null | number | string | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replaceAll('"', '""')}"`;
}

const csvColumns: Record<ExportCsvDataset, readonly string[]> = {
  bottles: ["id", "wineId", "purchaseId", "state", "storageLocationText", "acquiredAt"],
  prices: [
    "id",
    "wineId",
    "amountMinor",
    "currency",
    "merchantName",
    "channel",
    "vintageMatch",
    "sourceType",
    "observedAt",
  ],
  purchases: [
    "id",
    "wineId",
    "purchaserUserId",
    "merchantName",
    "purchasedAt",
    "unitAmountMinor",
    "currency",
    "quantity",
  ],
  tastings: [
    "id",
    "wineId",
    "authorUserId",
    "mode",
    "state",
    "tastedAt",
    "score100",
    "sentiment",
    "wouldDrinkAgain",
    "wouldBuy",
    "descriptorCodes",
    "foodText",
    "comment",
  ],
  wines: [
    "id",
    "displayName",
    "producerName",
    "vintageYear",
    "nonVintage",
    "wineType",
    "countryCode",
    "region",
    "appellation",
    "identityStatus",
    "mergedIntoWineId",
    "createdAt",
    "updatedAt",
  ],
};

export function renderCsv(document: ExportDocument, dataset: ExportCsvDataset): string {
  const columns: readonly string[] = csvColumns[dataset];
  const rows = document.data[dataset] as ReadonlyArray<Record<string, unknown>>;
  const lines = [columns.map((column) => csvCell(column)).join(",")];
  for (const row of rows) {
    lines.push(
      columns
        .map((column) => {
          const value = row[column];
          return csvCell(Array.isArray(value) ? value.join(" ") : (value as string));
        })
        .join(","),
    );
  }
  // CRLF keeps the file readable in the spreadsheet tools these exports target.
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Media bytes leave the Space only for an explicit, authorized selection. Ids
 * the requester cannot read are skipped rather than reported, so the archive
 * never discloses whether another Space owns them.
 */
export async function buildMediaArchive(
  database: D1Database,
  bucket: R2Bucket,
  options: { actor: ActorRow; mediaIds: readonly string[]; scope: ExportScope; spaceId: string },
): Promise<{ archive: Uint8Array; included: string[] }> {
  const ownOnly = options.scope === "own" ? 1 : 0;
  const placeholders = options.mediaIds.map(() => "?").join(", ");
  const rows = await database
    .prepare(
      `SELECT id, r2_key, mime_type FROM media_assets
      WHERE space_id = ? AND processing_status = 'ready' AND deleted_at IS NULL
        AND (? = 0 OR owner_user_id = ?)
        AND id IN (${placeholders})
      ORDER BY id`,
    )
    .bind(options.spaceId, ownOnly, options.actor.user_id, ...options.mediaIds)
    .all<{ id: string; mime_type: string; r2_key: string }>();

  const entries: { bytes: Uint8Array; name: string }[] = [];
  const included: string[] = [];
  for (const row of rows.results) {
    const object = await bucket.get(row.r2_key);
    if (object === null) continue;
    const extension = row.mime_type === "image/webp" ? "webp" : "jpg";
    entries.push({
      bytes: new Uint8Array(await object.arrayBuffer()),
      name: `media/${row.id}.${extension}`,
    });
    included.push(row.id);
  }

  return { archive: createZipArchive(entries), included };
}
