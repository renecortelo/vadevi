import {
  type BottlePhotoCandidate,
  BottlePhotoCandidatesResponseSchema,
  type ImportBottlePhotoRequest,
  ImportBottlePhotoResponseSchema,
  type SupportedLocale,
} from "@vadevi/contracts";

import { apiError, authenticatedFetch, type TokenSource } from "./api";

/** Candidate professional photos for a wine, thumbnails proxied by the server. */
export async function searchBottlePhotoCandidates(
  tokenSource: TokenSource,
  spaceId: string,
  wineId: string,
  locale: SupportedLocale,
  offset = 0,
  signal?: AbortSignal,
): Promise<BottlePhotoCandidate[]> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wines/${wineId}/bottle-photo-candidates`,
    {
      body: JSON.stringify({ locale, offset }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      ...(signal === undefined ? {} : { signal }),
    },
  );
  if (!response.ok) throw await apiError(response);
  return BottlePhotoCandidatesResponseSchema.parse(await response.json()).data.candidates;
}

/** A candidate thumbnail, fetched through the server so the browser never
 * contacts the provider CDN directly. */
export async function getBottlePhotoThumbnail(
  tokenSource: TokenSource,
  spaceId: string,
  wineId: string,
  thumbnailUrl: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const query = new URLSearchParams({ url: thumbnailUrl });
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wines/${wineId}/bottle-photo-proxy?${query.toString()}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return response.blob();
}

/** Adopt a chosen candidate as the wine's main image. */
export async function importBottlePhoto(
  tokenSource: TokenSource,
  spaceId: string,
  wineId: string,
  candidate: ImportBottlePhotoRequest,
): Promise<string> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wines/${wineId}/bottle-photo`,
    {
      body: JSON.stringify(candidate),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return ImportBottlePhotoResponseSchema.parse(await response.json()).data.mediaId;
}
