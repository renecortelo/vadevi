import {
  BootstrapResponseSchema,
  CreateInvitationRequestSchema,
  CreateInvitationResponseSchema,
  CreateSpaceRequestSchema,
  ErrorEnvelopeSchema,
  HealthResponseSchema,
  InvitationPreviewResponseSchema,
  RemoveMemberRequestSchema,
  RuntimeConfigResponseSchema,
  SpaceDetailResponseSchema,
  UpdateProfileRequestSchema,
  type BootstrapResponse,
  type CreateInvitationRequest,
  type CreateInvitationResponse,
  type CreateSpaceRequest,
  type HealthResponse,
  type InvitationPreviewResponse,
  type RemoveMemberRequest,
  type RuntimeConfigResponse,
  type SpaceDetailResponse,
  type UpdateProfileRequest,
  IdentificationRequestSchema,
  IdentificationResponseSchema,
  MediaReservationRequestSchema,
  MediaReservationResponseSchema,
  MediaUploadResponseSchema,
  SyncRequestSchema,
  SyncResponseSchema,
  WineMemoryResponseSchema,
  type IdentificationRequest,
  type MediaReservationRequest,
  type MediaReservationResponse,
  type SyncRequest,
  type SyncResponse,
  type WineMemoryResponse,
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
  type DeepTastingRequest,
  type DeepTastingNote,
  type SessionComparisonResponse,
  type TastingSessionDetailResponse,
  type TastingSessionResponse,
  type UpdateDeepTastingRequest,
} from "@vadevi/contracts";

type TokenSource = {
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiError(response: Response): Promise<ApiError> {
  try {
    const envelope = ErrorEnvelopeSchema.parse(await response.clone().json());
    return new ApiError(
      envelope.error.message,
      response.status,
      envelope.error.code,
      envelope.error.details,
    );
  } catch {
    return new ApiError("The API request failed.", response.status, "REQUEST_FAILED");
  }
}

async function authenticatedFetch(
  tokenSource: TokenSource,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await tokenSource.getIdToken(attempt === 1);
    const response = await fetch(path, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });

    if (response.status !== 401 || attempt === 1) return response;
  }

  throw new Error("Unreachable authentication retry state.");
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch("/health", {
    headers: { Accept: "application/json" },
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) {
    throw new Error("Health endpoint unavailable");
  }

  return HealthResponseSchema.parse(await response.json());
}

export async function getRuntimeConfig(signal?: AbortSignal): Promise<RuntimeConfigResponse> {
  const response = await fetch("/runtime-config", {
    headers: { Accept: "application/json" },
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) throw await apiError(response);
  return RuntimeConfigResponseSchema.parse(await response.json());
}

export async function getBootstrap(
  tokenSource: TokenSource,
  signal?: AbortSignal,
): Promise<BootstrapResponse> {
  const response = await authenticatedFetch(tokenSource, "/api/v1/me/bootstrap", {
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) throw await apiError(response);
  return BootstrapResponseSchema.parse(await response.json());
}

export async function updateProfile(
  tokenSource: TokenSource,
  update: UpdateProfileRequest,
): Promise<BootstrapResponse> {
  const response = await authenticatedFetch(tokenSource, "/api/v1/me", {
    body: JSON.stringify(UpdateProfileRequestSchema.parse(update)),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });

  if (!response.ok) throw await apiError(response);
  return BootstrapResponseSchema.parse(await response.json());
}

export async function createSpace(
  tokenSource: TokenSource,
  request: CreateSpaceRequest,
  idempotencyKey: string,
): Promise<SpaceDetailResponse> {
  const response = await authenticatedFetch(tokenSource, "/api/v1/spaces", {
    body: JSON.stringify(CreateSpaceRequestSchema.parse(request)),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    method: "POST",
  });

  if (!response.ok) throw await apiError(response);
  return SpaceDetailResponseSchema.parse(await response.json());
}

export async function getSpace(
  tokenSource: TokenSource,
  spaceId: string,
  signal?: AbortSignal,
): Promise<SpaceDetailResponse> {
  const response = await authenticatedFetch(tokenSource, `/api/v1/spaces/${spaceId}`, {
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) throw await apiError(response);
  return SpaceDetailResponseSchema.parse(await response.json());
}

export async function createInvitation(
  tokenSource: TokenSource,
  spaceId: string,
  request: CreateInvitationRequest,
  idempotencyKey: string,
): Promise<CreateInvitationResponse> {
  const response = await authenticatedFetch(tokenSource, `/api/v1/spaces/${spaceId}/invitations`, {
    body: JSON.stringify(CreateInvitationRequestSchema.parse(request)),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    method: "POST",
  });

  if (!response.ok) throw await apiError(response);
  return CreateInvitationResponseSchema.parse(await response.json());
}

export async function getInvitationPreview(
  token: string,
  signal?: AbortSignal,
): Promise<InvitationPreviewResponse> {
  const response = await fetch(`/api/v1/invitations/${token}/preview`, {
    headers: { Accept: "application/json" },
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) throw await apiError(response);
  return InvitationPreviewResponseSchema.parse(await response.json());
}

export async function acceptInvitation(
  tokenSource: TokenSource,
  token: string,
): Promise<BootstrapResponse> {
  const response = await authenticatedFetch(tokenSource, `/api/v1/invitations/${token}/accept`, {
    method: "POST",
  });

  if (!response.ok) throw await apiError(response);
  return BootstrapResponseSchema.parse(await response.json());
}

export async function removeMember(
  tokenSource: TokenSource,
  spaceId: string,
  memberId: string,
  request: RemoveMemberRequest,
): Promise<SpaceDetailResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/members/${memberId}`,
    {
      body: JSON.stringify(RemoveMemberRequestSchema.parse(request)),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
  );

  if (!response.ok) throw await apiError(response);
  return SpaceDetailResponseSchema.parse(await response.json());
}

export async function getWineMemory(
  tokenSource: TokenSource,
  spaceId: string,
  options: { cursor?: string; limit?: number; query?: string; wineType?: string } = {},
  signal?: AbortSignal,
): Promise<WineMemoryResponse> {
  const parameters = new URLSearchParams();
  if (options.cursor !== undefined) parameters.set("cursor", options.cursor);
  if (options.limit !== undefined) parameters.set("limit", String(options.limit));
  if (options.query !== undefined && options.query.trim().length > 0) {
    parameters.set("query", options.query.trim());
  }
  if (options.wineType !== undefined && options.wineType.length > 0) {
    parameters.set("wineType", options.wineType);
  }
  const query = parameters.size === 0 ? "" : `?${parameters.toString()}`;
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wines${query}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return WineMemoryResponseSchema.parse(await response.json());
}

export async function reserveMedia(
  tokenSource: TokenSource,
  spaceId: string,
  request: MediaReservationRequest,
  idempotencyKey: string,
): Promise<MediaReservationResponse> {
  const response = await authenticatedFetch(tokenSource, `/api/v1/spaces/${spaceId}/media`, {
    body: JSON.stringify(MediaReservationRequestSchema.parse(request)),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    method: "POST",
  });
  if (!response.ok) throw await apiError(response);
  return MediaReservationResponseSchema.parse(await response.json());
}

export async function uploadMedia(
  tokenSource: TokenSource,
  uploadPath: string,
  blob: Blob,
): Promise<string> {
  const response = await authenticatedFetch(tokenSource, uploadPath, {
    body: blob,
    headers: { "Content-Type": blob.type },
    method: "PUT",
  });
  if (!response.ok) throw await apiError(response);
  return MediaUploadResponseSchema.parse(await response.json()).data.media.id;
}

export async function getPrivateMedia(
  tokenSource: TokenSource,
  spaceId: string,
  mediaId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/media/${mediaId}/content`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return response.blob();
}

export async function identifyWine(
  tokenSource: TokenSource,
  spaceId: string,
  request: IdentificationRequest,
) {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/identifications`,
    {
      body: JSON.stringify(IdentificationRequestSchema.parse(request)),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return IdentificationResponseSchema.parse(await response.json());
}

export async function syncSpace(
  tokenSource: TokenSource,
  spaceId: string,
  request: SyncRequest,
): Promise<SyncResponse> {
  const response = await authenticatedFetch(tokenSource, `/api/v1/spaces/${spaceId}/sync`, {
    body: JSON.stringify(SyncRequestSchema.parse(request)),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw await apiError(response);
  return SyncResponseSchema.parse(await response.json());
}

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
