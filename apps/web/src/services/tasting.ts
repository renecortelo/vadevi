import {
  AddSessionWinesRequestSchema,
  CreateTastingSessionRequestSchema,
  DeepTastingRequestSchema,
  DeepTastingResponseSchema,
  ReorderSessionWinesRequestSchema,
  SessionComparisonResponseSchema,
  SubmitTastingRequestSchema,
  TastingSessionDetailResponseSchema,
  TastingSessionListResponseSchema,
  TastingSessionResponseSchema,
  UpdateDeepTastingRequestSchema,
  type AddSessionWinesRequest,
  type CreateTastingSessionRequest,
  type DeepTastingNote,
  type DeepTastingRequest,
  type SessionComparisonResponse,
  type TastingSessionDetailResponse,
  type TastingSessionResponse,
  type UpdateDeepTastingRequest,
} from "@vadevi/contracts";

import { apiError, authenticatedFetch, type TokenSource } from "./api";

/**
 * Session and deep-tasting clients. Lazy routes import these directly, and the
 * offline queue imports them on demand when it replays a session or deep-note
 * mutation, so their contract schemas stay out of the initial bundle.
 */

export async function listTastingSessions(
  tokenSource: TokenSource,
  spaceId: string,
  signal?: AbortSignal,
) {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/sessions`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return TastingSessionListResponseSchema.parse(await response.json());
}

export async function createTastingSession(
  tokenSource: TokenSource,
  spaceId: string,
  request: CreateTastingSessionRequest,
  idempotencyKey: string,
): Promise<TastingSessionResponse> {
  const response = await authenticatedFetch(tokenSource, `/api/v1/spaces/${spaceId}/sessions`, {
    body: JSON.stringify(CreateTastingSessionRequestSchema.parse(request)),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    method: "POST",
  });
  if (!response.ok) throw await apiError(response);
  return TastingSessionResponseSchema.parse(await response.json());
}

export async function getTastingSession(
  tokenSource: TokenSource,
  spaceId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<TastingSessionDetailResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/sessions/${sessionId}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return TastingSessionDetailResponseSchema.parse(await response.json());
}

export async function addTastingSessionWines(
  tokenSource: TokenSource,
  spaceId: string,
  sessionId: string,
  request: AddSessionWinesRequest,
  idempotencyKey: string,
): Promise<TastingSessionDetailResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/sessions/${sessionId}/wines`,
    {
      body: JSON.stringify(AddSessionWinesRequestSchema.parse(request)),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return TastingSessionDetailResponseSchema.parse(await response.json());
}

export async function reorderTastingSessionWines(
  tokenSource: TokenSource,
  spaceId: string,
  sessionId: string,
  orderedSessionWineIds: string[],
): Promise<TastingSessionDetailResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/sessions/${sessionId}/wines/order`,
    {
      body: JSON.stringify(ReorderSessionWinesRequestSchema.parse({ orderedSessionWineIds })),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    },
  );
  if (!response.ok) throw await apiError(response);
  return TastingSessionDetailResponseSchema.parse(await response.json());
}

export async function getSessionComparison(
  tokenSource: TokenSource,
  spaceId: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionComparisonResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/sessions/${sessionId}/comparison`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return SessionComparisonResponseSchema.parse(await response.json());
}

export async function getDeepTastingNote(
  tokenSource: TokenSource,
  spaceId: string,
  noteId: string,
  signal?: AbortSignal,
): Promise<DeepTastingNote> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/tasting-notes/${noteId}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return DeepTastingResponseSchema.parse(await response.json()).data;
}

export async function createDeepTastingNote(
  tokenSource: TokenSource,
  spaceId: string,
  request: DeepTastingRequest,
  idempotencyKey: string,
): Promise<DeepTastingNote> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/tasting-notes`,
    {
      body: JSON.stringify(DeepTastingRequestSchema.parse(request)),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return DeepTastingResponseSchema.parse(await response.json()).data;
}

export async function updateDeepTastingNote(
  tokenSource: TokenSource,
  spaceId: string,
  noteId: string,
  request: UpdateDeepTastingRequest,
): Promise<DeepTastingNote> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/tasting-notes/${noteId}`,
    {
      body: JSON.stringify(UpdateDeepTastingRequestSchema.parse(request)),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
  );
  if (!response.ok) throw await apiError(response);
  return DeepTastingResponseSchema.parse(await response.json()).data;
}

export async function submitDeepTastingNote(
  tokenSource: TokenSource,
  spaceId: string,
  noteId: string,
  version: number,
): Promise<DeepTastingNote> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/tasting-notes/${noteId}/submit`,
    {
      body: JSON.stringify(SubmitTastingRequestSchema.parse({ version })),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return DeepTastingResponseSchema.parse(await response.json()).data;
}
