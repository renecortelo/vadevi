import type {
  Bottle,
  BottleListResponse,
  BottleResponse,
  CreateBottleRequest,
  CreatePriceObservationRequest,
  CreatePurchaseRequest,
  CreateWishlistItemRequest,
  InventorySummary,
  PriceObservation,
  PriceObservationListResponse,
  PriceObservationResponse,
  PurchaseResponse,
  UpdateBottleRequest,
  UpdateWishlistItemRequest,
  WishlistItem,
  WishlistItemResponse,
  WishlistListResponse,
} from "@vadevi/contracts";
import { ulid } from "ulid";

import { sha256Base64Url } from "../security/opaque-token";
import type { FirebasePrincipal } from "../types";

type CommandResult<T> =
  | { kind: "conflict" }
  | { kind: "success"; replayed: boolean; response: T }
  | { kind: "unavailable" };

type VersionedResult<T> =
  | { current: T; kind: "conflict" | "invalid_transition" }
  | { kind: "success"; response: T }
  | { kind: "unavailable" };

type BottleRow = {
  acquired_at: string;
  created_at: string;
  finished_at: string | null;
  gifted_at: string | null;
  id: string;
  notes: string | null;
  opened_at: string | null;
  purchase_id: string | null;
  removed_at: string | null;
  state: Bottle["state"];
  storage_location_text: string | null;
  updated_at: string;
  version: number;
  wine_id: string;
};

type PurchaseRow = {
  created_at: string;
  currency: string;
  evidence_media_id: string | null;
  id: string;
  location_text: string | null;
  merchant_name: string;
  merchant_url: string | null;
  notes: string | null;
  purchased_at: string;
  purchaser_user_id: string;
  quantity: number;
  unit_amount_minor: number;
  updated_at: string;
  version: number;
  wine_id: string;
};

type WishlistRow = {
  created_at: string;
  id: string;
  notes: string | null;
  priority: number;
  reason: string;
  referrer: string | null;
  source_id: string | null;
  state: WishlistItem["state"];
  target_amount_minor: number | null;
  target_currency: string | null;
  updated_at: string;
  version: number;
  wine_id: string;
};

type PriceRow = {
  amount_minor: number;
  channel: PriceObservation["channel"];
  created_at: string;
  currency: string;
  evidence_media_id: string | null;
  id: string;
  location_text: string | null;
  merchant_name: string | null;
  merchant_url: string | null;
  observed_at: string;
  observer_user_id: string | null;
  purchase_id: string | null;
  retrieved_at: string;
  source_id: string | null;
  source_type: PriceObservation["sourceType"];
  updated_at: string;
  version: number;
  vintage_match: PriceObservation["vintageMatch"];
  wine_id: string;
};

function plusHours(timestamp: string, hours: number): string {
  return new Date(Date.parse(timestamp) + hours * 60 * 60 * 1_000).toISOString();
}

function bottleResource(row: BottleRow): Bottle {
  return {
    acquiredAt: row.acquired_at,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    giftedAt: row.gifted_at,
    id: row.id,
    notes: row.notes,
    openedAt: row.opened_at,
    purchaseId: row.purchase_id,
    removedAt: row.removed_at,
    state: row.state,
    storageLocation: row.storage_location_text,
    updatedAt: row.updated_at,
    version: row.version,
    wineId: row.wine_id,
  };
}

function wishlistResource(row: WishlistRow): WishlistItem {
  return {
    createdAt: row.created_at,
    id: row.id,
    notes: row.notes,
    priority: row.priority,
    reason: row.reason,
    referrer: row.referrer,
    sourceId: row.source_id,
    state: row.state,
    targetAmountMinor: row.target_amount_minor,
    targetCurrency: row.target_currency,
    updatedAt: row.updated_at,
    version: row.version,
    wineId: row.wine_id,
  };
}

function priceResource(row: PriceRow, staleBefore: number): PriceObservation {
  return {
    amountMinor: row.amount_minor,
    channel: row.channel,
    createdAt: row.created_at,
    currency: row.currency,
    evidenceMediaId: row.evidence_media_id,
    id: row.id,
    isStale: Date.parse(row.observed_at) < staleBefore,
    locationText: row.location_text,
    merchantName: row.merchant_name,
    merchantUrl: row.merchant_url,
    observedAt: row.observed_at,
    observerUserId: row.observer_user_id,
    purchaseId: row.purchase_id,
    retrievedAt: row.retrieved_at,
    sourceId: row.source_id,
    sourceType: row.source_type,
    updatedAt: row.updated_at,
    version: row.version,
    vintageMatch: row.vintage_match,
    wineId: row.wine_id,
  };
}

async function activeUserId(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
): Promise<string | null> {
  const row = await database
    .prepare(
      `SELECT actor.id FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
      JOIN spaces space ON space.id = membership.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.space_id = ? AND membership.status = 'active'
        AND space.deleted_at IS NULL`,
    )
    .bind(principal.firebaseUid, spaceId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

async function authorizedWineExists(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  wineId: string,
): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT wine.id FROM wine_records wine
      JOIN space_memberships membership ON membership.space_id = wine.space_id
      JOIN users actor ON actor.id = membership.user_id
      WHERE wine.id = ? AND wine.space_id = ? AND wine.deleted_at IS NULL
        AND actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active'`,
    )
    .bind(wineId, spaceId, principal.firebaseUid)
    .first<{ id: string }>();
  return row !== null;
}

async function scopedReferenceExists(
  database: D1Database,
  table: "media_assets" | "purchases" | "sources",
  id: string,
  spaceId: string,
): Promise<boolean> {
  const deletedPredicate = table === "sources" ? "" : " AND deleted_at IS NULL";
  const row = await database
    .prepare(`SELECT id FROM ${table} WHERE id = ? AND space_id = ?${deletedPredicate}`)
    .bind(id, spaceId)
    .first<{ id: string }>();
  return row !== null;
}

async function purchaseMatchesWine(
  database: D1Database,
  purchaseId: string,
  spaceId: string,
  wineId: string,
): Promise<boolean> {
  const row = await database
    .prepare(
      `SELECT id FROM purchases
      WHERE id = ? AND space_id = ? AND wine_id = ? AND deleted_at IS NULL`,
    )
    .bind(purchaseId, spaceId, wineId)
    .first<{ id: string }>();
  return row !== null;
}

async function activeCommand(
  database: D1Database,
  actorId: string,
  routeScope: string,
  keyHash: string,
  now: string,
) {
  return database
    .prepare(
      `SELECT request_hash, resource_id FROM idempotency_keys
      WHERE user_id = ? AND route_scope = ? AND key_hash = ? AND expires_at > ?`,
    )
    .bind(actorId, routeScope, keyHash, now)
    .first<{ request_hash: string; resource_id: string }>();
}

async function inventorySummary(database: D1Database, spaceId: string): Promise<InventorySummary> {
  const row = await database
    .prepare(
      `SELECT
        SUM(CASE WHEN state = 'owned' THEN 1 ELSE 0 END) AS owned,
        SUM(CASE WHEN state = 'opened' THEN 1 ELSE 0 END) AS opened,
        SUM(CASE WHEN state = 'finished' THEN 1 ELSE 0 END) AS finished,
        SUM(CASE WHEN state = 'gifted' THEN 1 ELSE 0 END) AS gifted,
        SUM(CASE WHEN state = 'removed' THEN 1 ELSE 0 END) AS removed
      FROM bottles WHERE space_id = ? AND deleted_at IS NULL`,
    )
    .bind(spaceId)
    .first<{
      finished: number | null;
      gifted: number | null;
      opened: number | null;
      owned: number | null;
      removed: number | null;
    }>();
  const counts = {
    finished: row?.finished ?? 0,
    gifted: row?.gifted ?? 0,
    opened: row?.opened ?? 0,
    owned: row?.owned ?? 0,
    removed: row?.removed ?? 0,
  };
  return { ...counts, totalAvailable: counts.owned + counts.opened };
}

async function bottleById(database: D1Database, spaceId: string, bottleId: string) {
  return database
    .prepare(
      `SELECT id, wine_id, purchase_id, state, storage_location_text, acquired_at,
        opened_at, finished_at, gifted_at, removed_at, notes, version, created_at, updated_at
      FROM bottles WHERE id = ? AND space_id = ? AND deleted_at IS NULL`,
    )
    .bind(bottleId, spaceId)
    .first<BottleRow>();
}

async function wishlistById(database: D1Database, spaceId: string, itemId: string) {
  return database
    .prepare(
      `SELECT id, wine_id, reason, priority, target_amount_minor, target_currency,
        referrer, source_id, notes, state, version, created_at, updated_at
      FROM wishlist_items WHERE id = ? AND space_id = ? AND deleted_at IS NULL`,
    )
    .bind(itemId, spaceId)
    .first<WishlistRow>();
}

export async function listBottles(
  database: D1Database,
  options: {
    principal: FirebasePrincipal;
    spaceId: string;
    state?: Bottle["state"];
    wineId?: string;
  },
): Promise<BottleListResponse | null> {
  if ((await activeUserId(database, options.principal, options.spaceId)) === null) return null;
  const result = await database
    .prepare(
      `SELECT id, wine_id, purchase_id, state, storage_location_text, acquired_at,
        opened_at, finished_at, gifted_at, removed_at, notes, version, created_at, updated_at
      FROM bottles WHERE space_id = ? AND deleted_at IS NULL
        AND (? IS NULL OR state = ?) AND (? IS NULL OR wine_id = ?)
      ORDER BY acquired_at DESC, id DESC LIMIT 250`,
    )
    .bind(
      options.spaceId,
      options.state ?? null,
      options.state ?? null,
      options.wineId ?? null,
      options.wineId ?? null,
    )
    .all<BottleRow>();
  return {
    data: {
      bottles: result.results.map(bottleResource),
      inventory: await inventorySummary(database, options.spaceId),
    },
  };
}

export async function createBottle(
  database: D1Database,
  options: {
    idempotencyKey: string;
    principal: FirebasePrincipal;
    request: CreateBottleRequest;
    requestId: string;
    spaceId: string;
  },
): Promise<CommandResult<BottleResponse>> {
  const actorId = await activeUserId(database, options.principal, options.spaceId);
  if (actorId === null) return { kind: "unavailable" };
  if (
    !(await authorizedWineExists(
      database,
      options.principal,
      options.spaceId,
      options.request.wineId,
    ))
  ) {
    return { kind: "unavailable" };
  }
  if (
    options.request.purchaseId !== undefined &&
    !(await purchaseMatchesWine(
      database,
      options.request.purchaseId,
      options.spaceId,
      options.request.wineId,
    ))
  ) {
    return { kind: "unavailable" };
  }
  const now = new Date().toISOString();
  const routeScope = `POST:/api/v1/spaces/${options.spaceId}/bottles`;
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));
  const previous = await activeCommand(database, actorId, routeScope, keyHash, now);
  if (previous !== null) {
    if (previous.request_hash !== requestHash) return { kind: "conflict" };
    const row = await bottleById(database, options.spaceId, previous.resource_id);
    return row === null
      ? { kind: "unavailable" }
      : { kind: "success", replayed: true, response: { data: bottleResource(row) } };
  }
  const bottleId = options.request.clientId ?? ulid();
  await database.batch([
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        ) VALUES (?, ?, ?, ?, 201, NULL, ?, ?, ?)`,
      )
      .bind(actorId, routeScope, keyHash, requestHash, bottleId, plusHours(now, 24), now),
    database
      .prepare(
        `INSERT INTO bottles (
          id, space_id, wine_id, purchase_id, created_by_user_id, state,
          storage_location_text, acquired_at, notes, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'owned', ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        bottleId,
        options.spaceId,
        options.request.wineId,
        options.request.purchaseId ?? null,
        actorId,
        options.request.storageLocation ?? null,
        options.request.acquiredAt,
        options.request.notes ?? null,
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) VALUES (?, 'bottle', ?, 'create', 1, ?)`,
      )
      .bind(options.spaceId, bottleId, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, ?, 'bottle.created', 'bottle', ?, ?, ?, ?)`,
      )
      .bind(
        ulid(),
        actorId,
        options.spaceId,
        bottleId,
        options.requestId,
        JSON.stringify({ hasPurchase: options.request.purchaseId !== undefined }),
        now,
      ),
  ]);
  const row = await bottleById(database, options.spaceId, bottleId);
  return row === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: false, response: { data: bottleResource(row) } };
}

const allowedBottleTransitions: Readonly<Record<Bottle["state"], readonly Bottle["state"][]>> = {
  finished: ["finished"],
  gifted: ["gifted"],
  opened: ["opened", "finished", "removed"],
  owned: ["owned", "opened", "gifted", "removed"],
  removed: ["removed"],
};

export async function updateBottle(
  database: D1Database,
  options: {
    bottleId: string;
    principal: FirebasePrincipal;
    request: UpdateBottleRequest;
    requestId: string;
    spaceId: string;
  },
): Promise<VersionedResult<BottleResponse>> {
  const actorId = await activeUserId(database, options.principal, options.spaceId);
  if (actorId === null) return { kind: "unavailable" };
  const currentRow = await bottleById(database, options.spaceId, options.bottleId);
  if (currentRow === null) return { kind: "unavailable" };
  const current = { data: bottleResource(currentRow) };
  if (currentRow.version !== options.request.version) return { current, kind: "conflict" };
  if (!(allowedBottleTransitions[currentRow.state] ?? []).includes(options.request.state)) {
    return { current, kind: "invalid_transition" };
  }
  const now = new Date().toISOString();
  const nextVersion = currentRow.version + 1;
  const result = await database.batch([
    database
      .prepare(
        `UPDATE bottles SET
          state = ?,
          storage_location_text = CASE WHEN ? = 1 THEN ? ELSE storage_location_text END,
          notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
          opened_at = CASE WHEN ? = 'opened' AND opened_at IS NULL THEN ? ELSE opened_at END,
          finished_at = CASE WHEN ? = 'finished' AND finished_at IS NULL THEN ? ELSE finished_at END,
          gifted_at = CASE WHEN ? = 'gifted' AND gifted_at IS NULL THEN ? ELSE gifted_at END,
          removed_at = CASE WHEN ? = 'removed' AND removed_at IS NULL THEN ? ELSE removed_at END,
          version = ?, updated_at = ?
        WHERE id = ? AND space_id = ? AND version = ? AND deleted_at IS NULL`,
      )
      .bind(
        options.request.state,
        options.request.storageLocation !== undefined ? 1 : 0,
        options.request.storageLocation ?? null,
        options.request.notes !== undefined ? 1 : 0,
        options.request.notes ?? null,
        options.request.state,
        options.request.occurredAt,
        options.request.state,
        options.request.occurredAt,
        options.request.state,
        options.request.occurredAt,
        options.request.state,
        options.request.occurredAt,
        nextVersion,
        now,
        options.bottleId,
        options.spaceId,
        options.request.version,
      ),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) SELECT ?, 'bottle', ?, 'update', ?, ? WHERE changes() = 1`,
      )
      .bind(options.spaceId, options.bottleId, nextVersion, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) SELECT ?, ?, ?, 'bottle.lifecycle_changed', 'bottle', ?, ?, ?, ? WHERE changes() = 1`,
      )
      .bind(
        ulid(),
        actorId,
        options.spaceId,
        options.bottleId,
        options.requestId,
        JSON.stringify({ from: currentRow.state, to: options.request.state }),
        now,
      ),
  ]);
  if (result[0]?.meta.changes !== 1) {
    const latest = await bottleById(database, options.spaceId, options.bottleId);
    return latest === null
      ? { kind: "unavailable" }
      : { current: { data: bottleResource(latest) }, kind: "conflict" };
  }
  const row = await bottleById(database, options.spaceId, options.bottleId);
  return row === null
    ? { kind: "unavailable" }
    : { kind: "success", response: { data: bottleResource(row) } };
}

async function purchaseResponse(
  database: D1Database,
  spaceId: string,
  purchaseId: string,
): Promise<PurchaseResponse | null> {
  const row = await database
    .prepare(
      `SELECT id, wine_id, purchaser_user_id, merchant_name, merchant_url, location_text,
        purchased_at, unit_amount_minor, currency, quantity, evidence_media_id,
        notes, version, created_at, updated_at
      FROM purchases WHERE id = ? AND space_id = ? AND deleted_at IS NULL`,
    )
    .bind(purchaseId, spaceId)
    .first<PurchaseRow>();
  if (row === null) return null;
  const bottles = await database
    .prepare(
      `SELECT id, wine_id, purchase_id, state, storage_location_text, acquired_at,
        opened_at, finished_at, gifted_at, removed_at, notes, version, created_at, updated_at
      FROM bottles WHERE purchase_id = ? AND space_id = ? AND deleted_at IS NULL ORDER BY id`,
    )
    .bind(purchaseId, spaceId)
    .all<BottleRow>();
  const price = await database
    .prepare(
      `SELECT id FROM price_observations
      WHERE purchase_id = ? AND space_id = ? AND deleted_at IS NULL`,
    )
    .bind(purchaseId, spaceId)
    .first<{ id: string }>();
  if (price === null) return null;
  return {
    data: {
      bottles: bottles.results.map(bottleResource),
      inventory: await inventorySummary(database, spaceId),
      priceObservationId: price.id,
      purchase: {
        createdAt: row.created_at,
        currency: row.currency,
        evidenceMediaId: row.evidence_media_id,
        id: row.id,
        locationText: row.location_text,
        merchantName: row.merchant_name,
        merchantUrl: row.merchant_url,
        notes: row.notes,
        purchasedAt: row.purchased_at,
        purchaserUserId: row.purchaser_user_id,
        quantity: row.quantity,
        unitAmountMinor: row.unit_amount_minor,
        updatedAt: row.updated_at,
        version: row.version,
        wineId: row.wine_id,
      },
    },
  };
}

export async function createPurchase(
  database: D1Database,
  options: {
    idempotencyKey: string;
    principal: FirebasePrincipal;
    request: CreatePurchaseRequest;
    requestId: string;
    spaceId: string;
  },
): Promise<CommandResult<PurchaseResponse>> {
  const actorId = await activeUserId(database, options.principal, options.spaceId);
  if (actorId === null) return { kind: "unavailable" };
  if (
    !(await authorizedWineExists(
      database,
      options.principal,
      options.spaceId,
      options.request.wineId,
    ))
  ) {
    return { kind: "unavailable" };
  }
  if (
    options.request.evidenceMediaId !== undefined &&
    !(await scopedReferenceExists(
      database,
      "media_assets",
      options.request.evidenceMediaId,
      options.spaceId,
    ))
  ) {
    return { kind: "unavailable" };
  }
  const now = new Date().toISOString();
  const routeScope = `POST:/api/v1/spaces/${options.spaceId}/purchases`;
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));
  const previous = await activeCommand(database, actorId, routeScope, keyHash, now);
  if (previous !== null) {
    if (previous.request_hash !== requestHash) return { kind: "conflict" };
    const response = await purchaseResponse(database, options.spaceId, previous.resource_id);
    return response === null
      ? { kind: "unavailable" }
      : { kind: "success", replayed: true, response };
  }
  const purchaseId = options.request.clientId ?? ulid();
  const priceId = ulid();
  const bottleIds = options.request.createBottles
    ? Array.from({ length: options.request.quantity }, () => ulid())
    : [];
  const channel =
    options.request.merchantUrl !== undefined
      ? "online"
      : options.request.locationText !== undefined
        ? "physical"
        : "unknown";
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        ) VALUES (?, ?, ?, ?, 201, NULL, ?, ?, ?)`,
      )
      .bind(actorId, routeScope, keyHash, requestHash, purchaseId, plusHours(now, 24), now),
    database
      .prepare(
        `INSERT INTO purchases (
          id, space_id, wine_id, purchaser_user_id, merchant_name, merchant_url,
          location_text, purchased_at, unit_amount_minor, currency, quantity,
          evidence_media_id, notes, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        purchaseId,
        options.spaceId,
        options.request.wineId,
        actorId,
        options.request.merchantName,
        options.request.merchantUrl ?? null,
        options.request.locationText ?? null,
        options.request.purchasedAt,
        options.request.unitAmountMinor,
        options.request.currency,
        options.request.quantity,
        options.request.evidenceMediaId ?? null,
        options.request.notes ?? null,
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO price_observations (
          id, space_id, wine_id, observer_user_id, amount_minor, currency,
          merchant_name, merchant_url, location_text, channel, vintage_match,
          source_type, evidence_media_id, purchase_id, observed_at, retrieved_at,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'yes', 'purchase', ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        priceId,
        options.spaceId,
        options.request.wineId,
        actorId,
        options.request.unitAmountMinor,
        options.request.currency,
        options.request.merchantName,
        options.request.merchantUrl ?? null,
        options.request.locationText ?? null,
        channel,
        options.request.evidenceMediaId ?? null,
        purchaseId,
        options.request.purchasedAt,
        now,
        now,
        now,
      ),
  ];
  if (bottleIds.length > 0) {
    statements.push(
      database
        .prepare(
          `INSERT INTO bottles (
            id, space_id, wine_id, purchase_id, created_by_user_id, state,
            acquired_at, version, created_at, updated_at
          ) SELECT value, ?, ?, ?, ?, 'owned', ?, 1, ?, ? FROM json_each(?)`,
        )
        .bind(
          options.spaceId,
          options.request.wineId,
          purchaseId,
          actorId,
          options.request.purchasedAt,
          now,
          now,
          JSON.stringify(bottleIds),
        ),
    );
  }
  statements.push(
    database
      .prepare(
        `UPDATE wishlist_items SET state = 'purchased', version = version + 1, updated_at = ?
        WHERE space_id = ? AND wine_id = ? AND state = 'active' AND deleted_at IS NULL`,
      )
      .bind(now, options.spaceId, options.request.wineId),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) VALUES
          (?, 'purchase', ?, 'create', 1, ?),
          (?, 'price_observation', ?, 'create', 1, ?)`,
      )
      .bind(options.spaceId, purchaseId, now, options.spaceId, priceId, now),
  );
  if (bottleIds.length > 0) {
    statements.push(
      database
        .prepare(
          `INSERT INTO change_events (
            space_id, resource_type, resource_id, operation, resource_version, changed_at
          ) SELECT ?, 'bottle', value, 'create', 1, ? FROM json_each(?)`,
        )
        .bind(options.spaceId, now, JSON.stringify(bottleIds)),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) SELECT space_id, 'wishlist_item', id, 'update', version, ?
        FROM wishlist_items WHERE space_id = ? AND wine_id = ? AND state = 'purchased' AND updated_at = ?`,
      )
      .bind(now, options.spaceId, options.request.wineId, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, ?, 'purchase.created', 'purchase', ?, ?, ?, ?)`,
      )
      .bind(
        ulid(),
        actorId,
        options.spaceId,
        purchaseId,
        options.requestId,
        JSON.stringify({ bottlesCreated: bottleIds.length, quantity: options.request.quantity }),
        now,
      ),
  );
  await database.batch(statements);
  const response = await purchaseResponse(database, options.spaceId, purchaseId);
  return response === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: false, response };
}

export async function listWishlist(
  database: D1Database,
  options: { principal: FirebasePrincipal; spaceId: string; state?: WishlistItem["state"] },
): Promise<WishlistListResponse | null> {
  if ((await activeUserId(database, options.principal, options.spaceId)) === null) return null;
  const result = await database
    .prepare(
      `SELECT id, wine_id, reason, priority, target_amount_minor, target_currency,
        referrer, source_id, notes, state, version, created_at, updated_at
      FROM wishlist_items WHERE space_id = ? AND deleted_at IS NULL
        AND (? IS NULL OR state = ?)
      ORDER BY CASE state WHEN 'active' THEN 0 ELSE 1 END, priority DESC, updated_at DESC, id DESC
      LIMIT 250`,
    )
    .bind(options.spaceId, options.state ?? null, options.state ?? null)
    .all<WishlistRow>();
  return { data: result.results.map(wishlistResource) };
}

export async function createWishlistItem(
  database: D1Database,
  options: {
    idempotencyKey: string;
    principal: FirebasePrincipal;
    request: CreateWishlistItemRequest;
    requestId: string;
    spaceId: string;
  },
): Promise<CommandResult<WishlistItemResponse>> {
  const actorId = await activeUserId(database, options.principal, options.spaceId);
  if (actorId === null) return { kind: "unavailable" };
  if (
    !(await authorizedWineExists(
      database,
      options.principal,
      options.spaceId,
      options.request.wineId,
    ))
  ) {
    return { kind: "unavailable" };
  }
  if (
    options.request.sourceId !== undefined &&
    !(await scopedReferenceExists(database, "sources", options.request.sourceId, options.spaceId))
  ) {
    return { kind: "unavailable" };
  }
  const now = new Date().toISOString();
  const routeScope = `POST:/api/v1/spaces/${options.spaceId}/wishlist`;
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));
  const previous = await activeCommand(database, actorId, routeScope, keyHash, now);
  if (previous !== null) {
    if (previous.request_hash !== requestHash) return { kind: "conflict" };
    const row = await wishlistById(database, options.spaceId, previous.resource_id);
    return row === null
      ? { kind: "unavailable" }
      : { kind: "success", replayed: true, response: { data: wishlistResource(row) } };
  }
  const active = await database
    .prepare(
      `SELECT id FROM wishlist_items
      WHERE space_id = ? AND wine_id = ? AND state = 'active' AND deleted_at IS NULL`,
    )
    .bind(options.spaceId, options.request.wineId)
    .first<{ id: string }>();
  if (active !== null) return { kind: "conflict" };
  const itemId = options.request.clientId ?? ulid();
  await database.batch([
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        ) VALUES (?, ?, ?, ?, 201, NULL, ?, ?, ?)`,
      )
      .bind(actorId, routeScope, keyHash, requestHash, itemId, plusHours(now, 24), now),
    database
      .prepare(
        `INSERT INTO wishlist_items (
          id, space_id, wine_id, created_by_user_id, reason, priority,
          target_amount_minor, target_currency, referrer, source_id, notes,
          state, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)`,
      )
      .bind(
        itemId,
        options.spaceId,
        options.request.wineId,
        actorId,
        options.request.reason,
        options.request.priority,
        options.request.targetAmountMinor ?? null,
        options.request.targetCurrency ?? null,
        options.request.referrer ?? null,
        options.request.sourceId ?? null,
        options.request.notes ?? null,
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) VALUES (?, 'wishlist_item', ?, 'create', 1, ?)`,
      )
      .bind(options.spaceId, itemId, now),
  ]);
  const row = await wishlistById(database, options.spaceId, itemId);
  return row === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: false, response: { data: wishlistResource(row) } };
}

export async function updateWishlistItem(
  database: D1Database,
  options: {
    itemId: string;
    principal: FirebasePrincipal;
    request: UpdateWishlistItemRequest;
    spaceId: string;
  },
): Promise<VersionedResult<WishlistItemResponse>> {
  if ((await activeUserId(database, options.principal, options.spaceId)) === null) {
    return { kind: "unavailable" };
  }
  const currentRow = await wishlistById(database, options.spaceId, options.itemId);
  if (currentRow === null) return { kind: "unavailable" };
  const current = { data: wishlistResource(currentRow) };
  if (currentRow.version !== options.request.version) return { current, kind: "conflict" };
  const now = new Date().toISOString();
  const nextVersion = currentRow.version + 1;
  const result = await database.batch([
    database
      .prepare(
        `UPDATE wishlist_items SET
          state = ?, reason = COALESCE(?, reason), priority = COALESCE(?, priority),
          target_amount_minor = CASE WHEN ? = 1 THEN ? ELSE target_amount_minor END,
          target_currency = CASE WHEN ? = 1 THEN ? ELSE target_currency END,
          notes = CASE WHEN ? = 1 THEN ? ELSE notes END,
          version = ?, updated_at = ?
        WHERE id = ? AND space_id = ? AND version = ? AND deleted_at IS NULL`,
      )
      .bind(
        options.request.state,
        options.request.reason ?? null,
        options.request.priority ?? null,
        options.request.targetAmountMinor !== undefined ? 1 : 0,
        options.request.targetAmountMinor ?? null,
        options.request.targetCurrency !== undefined ? 1 : 0,
        options.request.targetCurrency ?? null,
        options.request.notes !== undefined ? 1 : 0,
        options.request.notes ?? null,
        nextVersion,
        now,
        options.itemId,
        options.spaceId,
        options.request.version,
      ),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) SELECT ?, 'wishlist_item', ?, 'update', ?, ? WHERE changes() = 1`,
      )
      .bind(options.spaceId, options.itemId, nextVersion, now),
  ]);
  if (result[0]?.meta.changes !== 1) {
    const latest = await wishlistById(database, options.spaceId, options.itemId);
    return latest === null
      ? { kind: "unavailable" }
      : { current: { data: wishlistResource(latest) }, kind: "conflict" };
  }
  const row = await wishlistById(database, options.spaceId, options.itemId);
  return row === null
    ? { kind: "unavailable" }
    : { kind: "success", response: { data: wishlistResource(row) } };
}

async function priceById(
  database: D1Database,
  spaceId: string,
  priceId: string,
  freshnessDays: number,
) {
  const row = await database
    .prepare(
      `SELECT id, wine_id, observer_user_id, amount_minor, currency, merchant_name,
        merchant_url, location_text, channel, vintage_match, source_type, source_id,
        evidence_media_id, purchase_id, observed_at, retrieved_at, version, created_at, updated_at
      FROM price_observations WHERE id = ? AND space_id = ? AND deleted_at IS NULL`,
    )
    .bind(priceId, spaceId)
    .first<PriceRow>();
  const staleBefore = Date.now() - freshnessDays * 24 * 60 * 60 * 1_000;
  return row === null ? null : priceResource(row, staleBefore);
}

export async function listPriceObservations(
  database: D1Database,
  options: {
    currency?: string;
    freshnessDays: number;
    principal: FirebasePrincipal;
    spaceId: string;
    wineId: string;
  },
): Promise<PriceObservationListResponse | null> {
  if (!(await authorizedWineExists(database, options.principal, options.spaceId, options.wineId))) {
    return null;
  }
  const result = await database
    .prepare(
      `SELECT id, wine_id, observer_user_id, amount_minor, currency, merchant_name,
        merchant_url, location_text, channel, vintage_match, source_type, source_id,
        evidence_media_id, purchase_id, observed_at, retrieved_at, version, created_at, updated_at
      FROM price_observations WHERE space_id = ? AND wine_id = ? AND deleted_at IS NULL
        AND (? IS NULL OR currency = ?)
      ORDER BY observed_at DESC, id DESC LIMIT 250`,
    )
    .bind(options.spaceId, options.wineId, options.currency ?? null, options.currency ?? null)
    .all<PriceRow>();
  const staleBefore = Date.now() - options.freshnessDays * 24 * 60 * 60 * 1_000;
  const observations = result.results.map((row) => priceResource(row, staleBefore));
  return {
    data: {
      observations,
      warnings: [
        "external_lookup_disabled",
        ...(observations.length === 0 ? ["no_observations" as const] : []),
      ],
    },
  };
}

export async function createPriceObservation(
  database: D1Database,
  options: {
    idempotencyKey: string;
    principal: FirebasePrincipal;
    request: CreatePriceObservationRequest;
    requestId: string;
    spaceId: string;
    wineId: string;
  },
): Promise<CommandResult<PriceObservationResponse>> {
  const actorId = await activeUserId(database, options.principal, options.spaceId);
  if (actorId === null) return { kind: "unavailable" };
  if (!(await authorizedWineExists(database, options.principal, options.spaceId, options.wineId))) {
    return { kind: "unavailable" };
  }
  if (
    options.request.sourceId !== undefined &&
    !(await scopedReferenceExists(database, "sources", options.request.sourceId, options.spaceId))
  ) {
    return { kind: "unavailable" };
  }
  if (
    options.request.evidenceMediaId !== undefined &&
    !(await scopedReferenceExists(
      database,
      "media_assets",
      options.request.evidenceMediaId,
      options.spaceId,
    ))
  ) {
    return { kind: "unavailable" };
  }
  const now = new Date().toISOString();
  const routeScope = `POST:/api/v1/spaces/${options.spaceId}/wines/${options.wineId}/prices`;
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));
  const previous = await activeCommand(database, actorId, routeScope, keyHash, now);
  if (previous !== null) {
    if (previous.request_hash !== requestHash) return { kind: "conflict" };
    const resource = await priceById(database, options.spaceId, previous.resource_id, 90);
    return resource === null
      ? { kind: "unavailable" }
      : { kind: "success", replayed: true, response: { data: resource } };
  }
  const priceId = options.request.clientId ?? ulid();
  await database.batch([
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        ) VALUES (?, ?, ?, ?, 201, NULL, ?, ?, ?)`,
      )
      .bind(actorId, routeScope, keyHash, requestHash, priceId, plusHours(now, 24), now),
    database
      .prepare(
        `INSERT INTO price_observations (
          id, space_id, wine_id, observer_user_id, amount_minor, currency,
          merchant_name, merchant_url, location_text, channel, vintage_match,
          source_type, source_id, evidence_media_id, observed_at, retrieved_at,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(
        priceId,
        options.spaceId,
        options.wineId,
        actorId,
        options.request.amountMinor,
        options.request.currency,
        options.request.merchantName ?? null,
        options.request.merchantUrl ?? null,
        options.request.locationText ?? null,
        options.request.channel,
        options.request.vintageMatch,
        options.request.sourceType,
        options.request.sourceId ?? null,
        options.request.evidenceMediaId ?? null,
        options.request.observedAt,
        now,
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO change_events (
          space_id, resource_type, resource_id, operation, resource_version, changed_at
        ) VALUES (?, 'price_observation', ?, 'create', 1, ?)`,
      )
      .bind(options.spaceId, priceId, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, ?, 'price_observation.created', 'price_observation', ?, ?, ?, ?)`,
      )
      .bind(
        ulid(),
        actorId,
        options.spaceId,
        priceId,
        options.requestId,
        JSON.stringify({ sourceType: options.request.sourceType }),
        now,
      ),
  ]);
  const resource = await priceById(database, options.spaceId, priceId, 90);
  return resource === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: false, response: { data: resource } };
}
