import type { MediaReservationRequest, MediaReservationResponse } from "@vadevi/contracts";
import { ulid } from "ulid";

import { sha256Base64Url } from "../security/opaque-token";
import type { FirebasePrincipal } from "../types";

type MediaRow = {
  byte_size: number;
  created_at: string;
  height: number;
  id: string;
  kind: MediaReservationRequest["kind"];
  mime_type: MediaReservationRequest["mimeType"];
  processing_status: "ready" | "rejected" | "reserved";
  r2_key: string;
  sha256: string;
  width: number;
};

type CommandResult =
  | { kind: "conflict" }
  | { kind: "success"; replayed: boolean; response: MediaReservationResponse }
  | { kind: "unavailable" };

function plusHours(timestamp: string, hours: number): string {
  return new Date(Date.parse(timestamp) + hours * 60 * 60 * 1_000).toISOString();
}

function mediaPayload(row: MediaRow) {
  return {
    byteSize: row.byte_size,
    createdAt: row.created_at,
    height: row.height,
    id: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    processingStatus: row.processing_status,
    width: row.width,
  };
}

export async function reserveMedia(
  database: D1Database,
  options: {
    idempotencyKey: string;
    principal: FirebasePrincipal;
    request: MediaReservationRequest;
    spaceId: string;
  },
): Promise<CommandResult> {
  const now = new Date().toISOString();
  const candidateId = ulid();
  const routeScope = `POST:/api/v1/spaces/${options.spaceId}/media`;
  const keyHash = await sha256Base64Url(options.idempotencyKey);
  const requestHash = await sha256Base64Url(JSON.stringify(options.request));
  const privateObjectName = await sha256Base64Url(
    `vadevi-private-media-v1\0${options.spaceId}\0${candidateId}\0${options.idempotencyKey}`,
  );
  const expiresAt = plusHours(now, 24);
  const results = await database.batch([
    database
      .prepare(
        `INSERT INTO idempotency_keys (
          user_id, route_scope, key_hash, request_hash, response_status,
          response_body_hash, resource_id, expires_at, created_at
        )
        SELECT actor.id, ?, ?, ?, 201, NULL, ?, ?, ?
        FROM users actor
        JOIN space_memberships membership ON membership.user_id = actor.id
        JOIN spaces space ON space.id = membership.space_id
        WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND membership.space_id = ? AND membership.status = 'active'
          AND space.deleted_at IS NULL
        ON CONFLICT(user_id, route_scope, key_hash) DO UPDATE SET
          request_hash = excluded.request_hash, resource_id = excluded.resource_id,
          expires_at = excluded.expires_at, created_at = excluded.created_at
        WHERE idempotency_keys.expires_at <= excluded.created_at`,
      )
      .bind(
        routeScope,
        keyHash,
        requestHash,
        candidateId,
        expiresAt,
        now,
        options.principal.firebaseUid,
        options.spaceId,
      ),
    database
      .prepare(
        `INSERT INTO media_assets (
          id, space_id, owner_user_id, kind, r2_key, mime_type, byte_size,
          sha256, width, height, processing_status, expires_at,
          created_at, updated_at, deleted_at
        )
        SELECT ?, ?, actor.id, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?, ?, NULL
        FROM users actor
        JOIN idempotency_keys command ON command.user_id = actor.id
        WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND command.route_scope = ? AND command.key_hash = ?
          AND command.request_hash = ? AND command.resource_id = ?
        ON CONFLICT(id) DO NOTHING`,
      )
      .bind(
        candidateId,
        options.spaceId,
        options.request.kind,
        `private/${privateObjectName}`,
        options.request.mimeType,
        options.request.byteSize,
        options.request.sha256,
        options.request.width,
        options.request.height,
        expiresAt,
        now,
        now,
        options.principal.firebaseUid,
        routeScope,
        keyHash,
        requestHash,
        candidateId,
      ),
  ]);

  const command = await database
    .prepare(
      `SELECT command.request_hash, command.resource_id
      FROM idempotency_keys command
      JOIN users actor ON actor.id = command.user_id
      JOIN space_memberships membership ON membership.user_id = actor.id AND membership.space_id = ?
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active' AND command.route_scope = ?
        AND command.key_hash = ? AND command.expires_at > ?`,
    )
    .bind(options.spaceId, options.principal.firebaseUid, routeScope, keyHash, now)
    .first<{ request_hash: string; resource_id: string }>();
  if (command === null) return { kind: "unavailable" };
  if (command.request_hash !== requestHash) return { kind: "conflict" };
  const row = await database
    .prepare(
      `SELECT media.* FROM media_assets media
      JOIN space_memberships membership ON membership.space_id = media.space_id
      JOIN users actor ON actor.id = membership.user_id
      WHERE media.id = ? AND media.space_id = ? AND media.owner_user_id = actor.id
        AND actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active' AND media.deleted_at IS NULL`,
    )
    .bind(command.resource_id, options.spaceId, options.principal.firebaseUid)
    .first<MediaRow>();
  if (row === null) return { kind: "unavailable" };
  return {
    kind: "success",
    replayed: results[1]?.meta.changes !== 1,
    response: {
      data: {
        media: mediaPayload(row),
        uploadPath: `/api/v1/spaces/${options.spaceId}/media/${row.id}/content`,
      },
    },
  };
}

function jpegDimensions(
  bytes: Uint8Array,
): { hasExif: boolean; height: number; width: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  let hasExif = false;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) return null;
    if (marker === 0xe1) hasExif = true;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (length < 7) return null;
      return {
        hasExif,
        height: (bytes[offset + 3]! << 8) | bytes[offset + 4]!,
        width: (bytes[offset + 5]! << 8) | bytes[offset + 6]!,
      };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(
  bytes: Uint8Array,
): { hasExif: boolean; height: number; width: number } | null {
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.length < 30 || ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WEBP") return null;
  const chunk = ascii(12, 4);
  if (chunk === "VP8X") {
    const width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
    const height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
    return { hasExif: (bytes[20]! & 0x08) !== 0, height, width };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    return {
      hasExif: false,
      height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff,
      width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    return { hasExif: false, height: ((bits >> 14) & 0x3fff) + 1, width: (bits & 0x3fff) + 1 };
  }
  return null;
}

function inspectImage(bytes: Uint8Array, mimeType: string) {
  return mimeType === "image/jpeg"
    ? jpegDimensions(bytes)
    : mimeType === "image/webp"
      ? webpDimensions(bytes)
      : null;
}

export async function uploadMedia(
  database: D1Database,
  bucket: R2Bucket,
  options: {
    bytes: ArrayBuffer;
    contentType: string | undefined;
    mediaId: string;
    principal: FirebasePrincipal;
    spaceId: string;
  },
): Promise<
  { kind: "rejected" | "unavailable" } | { kind: "success"; media: ReturnType<typeof mediaPayload> }
> {
  const row = await database
    .prepare(
      `SELECT media.* FROM media_assets media
      JOIN users actor ON actor.id = media.owner_user_id
      JOIN space_memberships membership
        ON membership.user_id = actor.id AND membership.space_id = media.space_id
      WHERE media.id = ? AND media.space_id = ? AND media.deleted_at IS NULL
        AND media.processing_status IN ('reserved', 'ready')
        AND actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active'`,
    )
    .bind(options.mediaId, options.spaceId, options.principal.firebaseUid)
    .first<MediaRow>();
  if (row === null) return { kind: "unavailable" };
  if (row.processing_status === "ready") return { kind: "success", media: mediaPayload(row) };

  const bytes = new Uint8Array(options.bytes);
  const image = inspectImage(bytes, row.mime_type);
  const actualHash = await sha256Base64Url(bytes);
  const valid =
    options.contentType === row.mime_type &&
    bytes.byteLength === row.byte_size &&
    bytes.byteLength <= 5 * 1024 * 1024 &&
    actualHash === row.sha256 &&
    image !== null &&
    !image.hasExif &&
    image.width === row.width &&
    image.height === row.height &&
    Math.max(image.width, image.height) <= 2048;
  if (!valid) return { kind: "rejected" };

  await bucket.put(row.r2_key, options.bytes, {
    httpMetadata: { contentType: row.mime_type },
    customMetadata: { sha256: row.sha256 },
  });
  const now = new Date().toISOString();
  await database
    .prepare(
      `UPDATE media_assets SET processing_status = 'ready', updated_at = ?
      WHERE id = ? AND space_id = ? AND processing_status = 'reserved'`,
    )
    .bind(now, row.id, options.spaceId)
    .run();
  return { kind: "success", media: mediaPayload({ ...row, processing_status: "ready" }) };
}

export async function readMedia(
  database: D1Database,
  bucket: R2Bucket,
  options: { mediaId: string; principal: FirebasePrincipal; spaceId: string },
): Promise<{ body: ReadableStream; mimeType: string } | null> {
  const row = await database
    .prepare(
      `SELECT media.r2_key, media.mime_type FROM media_assets media
      JOIN space_memberships membership ON membership.space_id = media.space_id
      JOIN users actor ON actor.id = membership.user_id
      WHERE media.id = ? AND media.space_id = ? AND media.processing_status = 'ready'
        AND media.deleted_at IS NULL AND actor.firebase_uid = ?
        AND actor.deleted_at IS NULL AND membership.status = 'active'`,
    )
    .bind(options.mediaId, options.spaceId, options.principal.firebaseUid)
    .first<{ mime_type: string; r2_key: string }>();
  if (row === null) return null;
  const object = await bucket.get(row.r2_key);
  return object === null ? null : { body: object.body, mimeType: row.mime_type };
}
