import {
  ActionDraftResponseSchema,
  CreateActionDraftRequestSchema,
  type ActionDraft,
  type ActionDraftResponse,
  type CreateActionDraftRequest,
} from "@vadevi/contracts";
import { ulid } from "ulid";

import { sha256Base64Url } from "../security/opaque-token";
import type { FirebasePrincipal } from "../types";
import { createPriceObservation, createWishlistItem } from "./cellar";

type CommandResult =
  | { current?: ActionDraftResponse; kind: "conflict" }
  | { kind: "success"; replayed: boolean; response: ActionDraftResponse }
  | { kind: "unavailable" };

type DraftRow = {
  action: ActionDraft["action"];
  canceled_at: string | null;
  confirmation_resource_id: string | null;
  confirmation_resource_type: "price_observation" | "wishlist_item" | null;
  confirmed_at: string | null;
  created_at: string;
  expires_at: string;
  id: string;
  payload_json: string | null;
  summary: string | null;
};

function plusMinutes(timestamp: string, minutes: number): string {
  return new Date(Date.parse(timestamp) + minutes * 60 * 1_000).toISOString();
}

function plusHours(timestamp: string, hours: number): string {
  return new Date(Date.parse(timestamp) + hours * 60 * 60 * 1_000).toISOString();
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

function draftState(row: DraftRow, now: string): ActionDraft["state"] {
  if (row.confirmed_at !== null) return "confirmed";
  if (row.canceled_at !== null) return "canceled";
  return row.expires_at <= now ? "expired" : "pending";
}

function draftResource(row: DraftRow, now: string): ActionDraftResponse {
  const parsed =
    row.payload_json === null
      ? null
      : CreateActionDraftRequestSchema.parse({
          action: row.action,
          payload: JSON.parse(row.payload_json) as unknown,
          summary: row.summary,
        });
  return ActionDraftResponseSchema.parse({
    data: {
      action: row.action,
      confirmation:
        row.confirmation_resource_id === null || row.confirmation_resource_type === null
          ? null
          : {
              resourceId: row.confirmation_resource_id,
              resourceType: row.confirmation_resource_type,
            },
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      id: row.id,
      payload: parsed?.payload ?? null,
      state: draftState(row, now),
      summary: row.summary,
    },
  });
}

export async function purgeExpiredActionDraftContent(database: D1Database, now: string) {
  await database
    .prepare(
      `UPDATE action_drafts SET payload_json = NULL, summary = NULL, updated_at = ?
      WHERE expires_at <= ? AND confirmed_at IS NULL AND canceled_at IS NULL
        AND (payload_json IS NOT NULL OR summary IS NOT NULL)`,
    )
    .bind(now, now)
    .run();
}

async function draftById(database: D1Database, actorId: string, spaceId: string, draftId: string) {
  return database
    .prepare(
      `SELECT id, action, payload_json, summary, expires_at, confirmed_at, canceled_at,
        confirmation_resource_type, confirmation_resource_id, created_at
      FROM action_drafts WHERE id = ? AND space_id = ? AND user_id = ?`,
    )
    .bind(draftId, spaceId, actorId)
    .first<DraftRow>();
}

export async function getActionDraft(
  database: D1Database,
  options: { draftId: string; principal: FirebasePrincipal; spaceId: string },
): Promise<ActionDraftResponse | null> {
  const actorId = await activeUserId(database, options.principal, options.spaceId);
  if (actorId === null) return null;
  await purgeExpiredActionDraftContent(database, new Date().toISOString());
  const row = await draftById(database, actorId, options.spaceId, options.draftId);
  return row === null ? null : draftResource(row, new Date().toISOString());
}

export async function createActionDraft(
  database: D1Database,
  options: {
    idempotencyKey: string;
    principal: FirebasePrincipal;
    request: CreateActionDraftRequest;
    requestId: string;
    spaceId: string;
  },
): Promise<CommandResult> {
  const actorId = await activeUserId(database, options.principal, options.spaceId);
  if (actorId === null) return { kind: "unavailable" };
  const wineId =
    options.request.action === "add_wishlist_item"
      ? options.request.payload.wineId
      : options.request.payload.wineId;
  if (!(await authorizedWineExists(database, options.principal, options.spaceId, wineId))) {
    return { kind: "unavailable" };
  }
  const now = new Date().toISOString();
  await purgeExpiredActionDraftContent(database, now);
  const routeScope = `POST:/api/v1/spaces/${options.spaceId}/action-drafts`;
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));
  const previous = await database
    .prepare(
      `SELECT request_hash, resource_id FROM idempotency_keys
      WHERE user_id = ? AND route_scope = ? AND key_hash = ? AND expires_at > ?`,
    )
    .bind(actorId, routeScope, keyHash, now)
    .first<{ request_hash: string; resource_id: string }>();
  if (previous !== null) {
    if (previous.request_hash !== requestHash) return { kind: "conflict" };
    const row = await draftById(database, actorId, options.spaceId, previous.resource_id);
    return row === null
      ? { kind: "unavailable" }
      : { kind: "success", replayed: true, response: draftResource(row, now) };
  }
  const draftId = ulid();
  const payloadJson = JSON.stringify(options.request.payload);
  const payloadHash = await sha256Base64Url(payloadJson);
  await database.batch([
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        ) VALUES (?, ?, ?, ?, 201, NULL, ?, ?, ?)`,
      )
      .bind(actorId, routeScope, keyHash, requestHash, draftId, plusHours(now, 24), now),
    database
      .prepare(
        `INSERT INTO action_drafts (
          id, space_id, user_id, action, payload_json, payload_hash, summary,
          expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        draftId,
        options.spaceId,
        actorId,
        options.request.action,
        payloadJson,
        payloadHash,
        options.request.summary,
        plusMinutes(now, 30),
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, ?, 'assistant.action_draft_created', 'action_draft', ?, ?, ?, ?)`,
      )
      .bind(
        ulid(),
        actorId,
        options.spaceId,
        draftId,
        options.requestId,
        JSON.stringify({ action: options.request.action, payloadHash }),
        now,
      ),
  ]);
  const row = await draftById(database, actorId, options.spaceId, draftId);
  return row === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: false, response: draftResource(row, now) };
}

export async function cancelActionDraft(
  database: D1Database,
  options: {
    draftId: string;
    principal: FirebasePrincipal;
    requestId: string;
    spaceId: string;
  },
): Promise<CommandResult> {
  const actorId = await activeUserId(database, options.principal, options.spaceId);
  if (actorId === null) return { kind: "unavailable" };
  const now = new Date().toISOString();
  await purgeExpiredActionDraftContent(database, now);
  const row = await draftById(database, actorId, options.spaceId, options.draftId);
  if (row === null) return { kind: "unavailable" };
  const current = draftResource(row, now);
  if (current.data.state === "confirmed" || current.data.state === "expired") {
    return { current, kind: "conflict" };
  }
  if (current.data.state === "canceled") {
    return { kind: "success", replayed: true, response: current };
  }
  await database.batch([
    database
      .prepare(
        `UPDATE action_drafts SET canceled_at = ?, payload_json = NULL, summary = NULL, updated_at = ?
        WHERE id = ? AND space_id = ? AND user_id = ?
          AND confirmed_at IS NULL AND canceled_at IS NULL AND expires_at > ?`,
      )
      .bind(now, now, options.draftId, options.spaceId, actorId, now),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) SELECT ?, ?, ?, 'assistant.action_draft_canceled', 'action_draft', ?, ?, NULL, ?
        WHERE changes() = 1`,
      )
      .bind(ulid(), actorId, options.spaceId, options.draftId, options.requestId, now),
  ]);
  const updated = await draftById(database, actorId, options.spaceId, options.draftId);
  return updated === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: false, response: draftResource(updated, now) };
}

export async function confirmActionDraft(
  database: D1Database,
  options: {
    draftId: string;
    principal: FirebasePrincipal;
    requestId: string;
    spaceId: string;
  },
): Promise<CommandResult> {
  const actorId = await activeUserId(database, options.principal, options.spaceId);
  if (actorId === null) return { kind: "unavailable" };
  const now = new Date().toISOString();
  await purgeExpiredActionDraftContent(database, now);
  const row = await draftById(database, actorId, options.spaceId, options.draftId);
  if (row === null) return { kind: "unavailable" };
  const current = draftResource(row, now);
  if (current.data.state === "confirmed") {
    return { kind: "success", replayed: true, response: current };
  }
  if (current.data.state !== "pending") return { current, kind: "conflict" };
  if (row.payload_json === null || row.summary === null) return { current, kind: "conflict" };
  const parsed = CreateActionDraftRequestSchema.parse({
    action: row.action,
    payload: JSON.parse(row.payload_json) as unknown,
    summary: row.summary,
  });
  const confirmationKey = await sha256Base64Url(`action-draft:${options.draftId}`);
  let confirmation: { resourceId: string; resourceType: "price_observation" | "wishlist_item" };
  if (parsed.action === "add_wishlist_item") {
    const result = await createWishlistItem(database, {
      idempotencyKey: confirmationKey,
      principal: options.principal,
      request: parsed.payload,
      requestId: options.requestId,
      spaceId: options.spaceId,
    });
    if (result.kind === "unavailable") return { kind: "unavailable" };
    if (result.kind === "conflict") return { current, kind: "conflict" };
    confirmation = { resourceId: result.response.data.id, resourceType: "wishlist_item" };
  } else {
    const result = await createPriceObservation(database, {
      idempotencyKey: confirmationKey,
      principal: options.principal,
      request: parsed.payload.observation,
      requestId: options.requestId,
      spaceId: options.spaceId,
      wineId: parsed.payload.wineId,
    });
    if (result.kind === "unavailable") return { kind: "unavailable" };
    if (result.kind === "conflict") return { current, kind: "conflict" };
    confirmation = { resourceId: result.response.data.id, resourceType: "price_observation" };
  }
  await database.batch([
    database
      .prepare(
        `UPDATE action_drafts SET confirmed_at = ?, confirmation_resource_type = ?,
          confirmation_resource_id = ?, payload_json = NULL, summary = NULL, updated_at = ?
        WHERE id = ? AND space_id = ? AND user_id = ?
          AND confirmed_at IS NULL AND canceled_at IS NULL AND expires_at > ?`,
      )
      .bind(
        now,
        confirmation.resourceType,
        confirmation.resourceId,
        now,
        options.draftId,
        options.spaceId,
        actorId,
        now,
      ),
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) SELECT ?, ?, ?, 'assistant.action_draft_confirmed', 'action_draft', ?, ?, ?, ?
        WHERE changes() = 1`,
      )
      .bind(
        ulid(),
        actorId,
        options.spaceId,
        options.draftId,
        options.requestId,
        JSON.stringify({
          action: parsed.action,
          resourceId: confirmation.resourceId,
          resourceType: confirmation.resourceType,
        }),
        now,
      ),
  ]);
  const updated = await draftById(database, actorId, options.spaceId, options.draftId);
  return updated === null
    ? { kind: "unavailable" }
    : { kind: "success", replayed: false, response: draftResource(updated, now) };
}
