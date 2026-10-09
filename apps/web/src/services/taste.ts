import {
  type TasteBioRequest,
  type TasteBioResponse,
  TasteBioResponseSchema,
  type TasteDeclaration,
  TasteDeclarationResponseSchema,
  type TasteProfile,
  TasteProfileResponseSchema,
  type UpdateTasteDeclarationRequest,
} from "@vadevi/contracts";

import { apiError, authenticatedFetch, type TokenSource } from "./api";

/** The reader's taste, read from their own tastings and purchases. */
export async function getTasteProfile(
  tokenSource: TokenSource,
  locale: string,
  signal?: AbortSignal,
): Promise<TasteProfile> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/me/taste-profile?locale=${encodeURIComponent(locale)}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return TasteProfileResponseSchema.parse(await response.json()).data;
}

/** What the reader says of their own taste. */
export async function getTasteDeclaration(
  tokenSource: TokenSource,
  signal?: AbortSignal,
): Promise<TasteDeclaration> {
  const response = await authenticatedFetch(
    tokenSource,
    "/api/v1/me/taste-declaration",
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return TasteDeclarationResponseSchema.parse(await response.json()).data;
}

/** Saved over the version shown; "conflict" when it changed meanwhile. */
export async function saveTasteDeclaration(
  tokenSource: TokenSource,
  request: UpdateTasteDeclarationRequest,
): Promise<{ declaration: TasteDeclaration; kind: "saved" } | { kind: "conflict" }> {
  const response = await authenticatedFetch(tokenSource, "/api/v1/me/taste-declaration", {
    body: JSON.stringify(request),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
  if (response.status === 409) return { kind: "conflict" };
  if (!response.ok) throw await apiError(response);
  return {
    declaration: TasteDeclarationResponseSchema.parse(await response.json()).data,
    kind: "saved",
  };
}

/** The reader's taste told by Vicenç, from their own facts only. */
export async function writeTasteBio(
  tokenSource: TokenSource,
  locale: TasteBioRequest["locale"],
): Promise<TasteBioResponse["data"]> {
  const response = await authenticatedFetch(tokenSource, "/api/v1/me/taste-bio", {
    body: JSON.stringify({ locale }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw await apiError(response);
  return TasteBioResponseSchema.parse(await response.json()).data;
}
