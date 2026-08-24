import type { ImageCandidate, ImageSearchPort, ResearchLocale } from "@vadevi/domain";
import { ulid } from "ulid";

import { fetchFromProvider, type ProviderFetcher } from "../adapters/provider-fetch";
import { sha256Base64Url } from "../security/opaque-token";
import type { FirebasePrincipal } from "../types";
import { imageInfo } from "./bottle-photo-image";

const maxPhotoBytes = 5 * 1024 * 1024;

type WineIdentity = { display_name: string; producer_name: string; vintage_year: number | null };

/** The wine, only if the reader may see it, with the fields a photo query needs. */
async function authorizedWine(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
  wineId: string,
): Promise<WineIdentity | null> {
  return database
    .prepare(
      `SELECT wine.display_name, wine.producer_name, wine.vintage_year
      FROM wine_records wine
      JOIN space_memberships membership ON membership.space_id = wine.space_id
      JOIN users actor ON actor.id = membership.user_id
      WHERE wine.id = ? AND wine.space_id = ? AND wine.deleted_at IS NULL
        AND actor.firebase_uid = ? AND actor.deleted_at IS NULL AND membership.status = 'active'`,
    )
    .bind(wineId, spaceId, principal.firebaseUid)
    .first<WineIdentity>();
}

/** Candidate bottle photos for a wine, or null when the reader may not see it. */
export async function searchBottlePhotos(
  database: D1Database,
  port: ImageSearchPort,
  options: {
    locale: ResearchLocale;
    principal: FirebasePrincipal;
    spaceId: string;
    wineId: string;
  },
): Promise<ImageCandidate[] | null> {
  const wine = await authorizedWine(database, options.principal, options.spaceId, options.wineId);
  if (wine === null) return null;
  const query = [wine.producer_name, wine.display_name, wine.vintage_year]
    .map((part) => (part ?? "").toString().trim())
    .filter((part) => part.length > 0)
    .join(" ")
    .concat(" bottle");
  const result = await port.search({ locale: options.locale, query });
  return result.status === "success" ? result.data : [];
}

export type ImportBottlePhotoOutcome =
  | { kind: "not_found" }
  | { kind: "rejected"; reason: string }
  | { kind: "success"; mediaId: string };

/**
 * Download a chosen bottle photo and make it the wine's main image.
 *
 * The thumbnail is fetched from the provider's own CDN and nowhere else: the host
 * is re-checked to be brave-owned and pinned as the only allowed host, so this
 * opens no arbitrary-host fetch. The bytes are bounded, their format and size
 * read from the header, and anything that is not a JPEG or WebP within bounds is
 * refused. The new photo takes sort_order 0 — the ficha shows the lowest — and
 * the wine's existing photos are pushed back, kept and recoverable, not deleted.
 */
export async function importBottlePhoto(
  database: D1Database,
  bucket: R2Bucket,
  options: {
    fetcher?: ProviderFetcher;
    principal: FirebasePrincipal;
    sourceUrl: string;
    spaceId: string;
    thumbnailUrl: string;
    title: string;
    userAgent: string;
    wineId: string;
  },
): Promise<ImportBottlePhotoOutcome> {
  const wine = await authorizedWine(database, options.principal, options.spaceId, options.wineId);
  if (wine === null) return { kind: "not_found" };

  let host: string;
  try {
    const url = new URL(options.thumbnailUrl);
    host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !host.endsWith(".brave.com")) {
      return { kind: "rejected", reason: "untrusted_host" };
    }
  } catch {
    return { kind: "rejected", reason: "invalid_url" };
  }

  let response: Response;
  try {
    response = await fetchFromProvider(options.fetcher ?? fetch, options.thumbnailUrl, {
      allowedHosts: new Set([host]),
      headers: { Accept: "image/jpeg,image/webp", "User-Agent": options.userAgent },
    });
  } catch {
    return { kind: "rejected", reason: "download_failed" };
  }
  if (!response.ok) return { kind: "rejected", reason: "download_failed" };
  const declaredLength = Number(response.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxPhotoBytes) {
    return { kind: "rejected", reason: "too_large" };
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0 || buffer.byteLength > maxPhotoBytes) {
    return { kind: "rejected", reason: "too_large" };
  }
  const bytes = new Uint8Array(buffer);
  const info = imageInfo(bytes);
  if (info === null) return { kind: "rejected", reason: "unsupported_format" };
  if (Math.max(info.width, info.height) > 2048) return { kind: "rejected", reason: "too_large" };

  const now = new Date().toISOString();
  const mediaId = ulid();
  const sha = await sha256Base64Url(bytes);
  const r2Key = `private/${await sha256Base64Url(`vadevi-bottle-photo-v1\0${options.spaceId}\0${mediaId}\0${sha}`)}`;
  await bucket.put(r2Key, buffer, {
    httpMetadata: { contentType: info.mimeType },
    customMetadata: { sha256: sha },
  });

  const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1_000).toISOString();
  const inserted = await database.batch([
    database
      .prepare(
        `INSERT INTO media_assets (
          id, space_id, owner_user_id, kind, r2_key, mime_type, byte_size,
          sha256, width, height, processing_status, expires_at, created_at, updated_at, deleted_at
        )
        SELECT ?, ?, actor.id, 'other', ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, NULL
        FROM users actor
        JOIN space_memberships membership ON membership.user_id = actor.id
        WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND membership.space_id = ? AND membership.status = 'active'`,
      )
      .bind(
        mediaId,
        options.spaceId,
        r2Key,
        info.mimeType,
        bytes.byteLength,
        sha,
        info.width,
        info.height,
        expiresAt,
        now,
        now,
        options.principal.firebaseUid,
        options.spaceId,
      ),
    // Push the wine's existing photos back so the new one leads the ficha.
    database
      .prepare(`UPDATE wine_media SET sort_order = sort_order + 1 WHERE wine_id = ?`)
      .bind(options.wineId),
    database
      .prepare(
        `INSERT INTO wine_media (wine_id, media_id, role, sort_order, created_at)
        SELECT wine.id, ?, 'bottle', 0, ?
        FROM wine_records wine
        JOIN media_assets media ON media.id = ? AND media.space_id = wine.space_id
        WHERE wine.id = ? AND wine.space_id = ? AND media.processing_status = 'ready'
        ON CONFLICT(wine_id, media_id) DO NOTHING`,
      )
      .bind(mediaId, now, mediaId, options.wineId, options.spaceId),
  ]);
  const linked = inserted[2]?.meta.changes ?? 0;
  if (linked === 0) return { kind: "rejected", reason: "not_linked" };
  return { kind: "success", mediaId };
}
