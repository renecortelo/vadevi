import {
  ActionDraftResponseSchema,
  BottleListResponseSchema,
  BottleResponseSchema,
  CreateActionDraftRequestSchema,
  CreatePriceObservationRequestSchema,
  CreatePurchaseRequestSchema,
  CreateWishlistItemRequestSchema,
  PriceObservationListResponseSchema,
  PriceObservationResponseSchema,
  PurchaseResponseSchema,
  UpdateBottleRequestSchema,
  UpdateWishlistItemRequestSchema,
  WishlistItemResponseSchema,
  WishlistListResponseSchema,
  type ActionDraftResponse,
  type BottleListResponse,
  type BottleResponse,
  type CreateActionDraftRequest,
  type CreatePriceObservationRequest,
  type CreatePurchaseRequest,
  type CreateWishlistItemRequest,
  type PriceObservationListResponse,
  type PriceObservationResponse,
  type PurchaseResponse,
  type UpdateBottleRequest,
  type UpdateWishlistItemRequest,
  type WishlistItemResponse,
  type WishlistListResponse,
  AssistantTurnRequestSchema,
  AssistantTurnResponseSchema,
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
  AcceptFactRequestSchema,
  FactResponseSchema,
  WineFactsResponseSchema,
  type AcceptFactRequest,
  type AssistantTurnRequest,
  type AssistantTurnResponse,
  type FactResponse,
  type WineFactsResponse,
  CreateResearchJobRequestSchema,
  ResearchJobResponseSchema,
  type CreateResearchJobRequest,
  type ResearchJobResponse,
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

export async function getWineFacts(
  tokenSource: TokenSource,
  spaceId: string,
  wineId: string,
  signal?: AbortSignal,
): Promise<WineFactsResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wines/${wineId}/facts`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return WineFactsResponseSchema.parse(await response.json());
}

export async function acceptFact(
  tokenSource: TokenSource,
  spaceId: string,
  factId: string,
  request: AcceptFactRequest,
): Promise<FactResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/facts/${factId}/accept`,
    {
      body: JSON.stringify(AcceptFactRequestSchema.parse(request)),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return FactResponseSchema.parse(await response.json());
}

export async function createResearchJob(
  tokenSource: TokenSource,
  spaceId: string,
  wineId: string,
  request: CreateResearchJobRequest,
  idempotencyKey: string,
): Promise<ResearchJobResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wines/${wineId}/research-jobs`,
    {
      body: JSON.stringify(CreateResearchJobRequestSchema.parse(request)),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return ResearchJobResponseSchema.parse(await response.json());
}

export async function getResearchJob(
  tokenSource: TokenSource,
  spaceId: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<ResearchJobResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/research-jobs/${jobId}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return ResearchJobResponseSchema.parse(await response.json());
}

export async function createAssistantTurn(
  tokenSource: TokenSource,
  spaceId: string,
  request: AssistantTurnRequest,
): Promise<AssistantTurnResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/assistant/turns`,
    {
      body: JSON.stringify(AssistantTurnRequestSchema.parse(request)),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return AssistantTurnResponseSchema.parse(await response.json());
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

export async function getBottles(
  tokenSource: TokenSource,
  spaceId: string,
  options: { state?: string; wineId?: string } = {},
  signal?: AbortSignal,
): Promise<BottleListResponse> {
  const parameters = new URLSearchParams();
  if (options.state !== undefined) parameters.set("state", options.state);
  if (options.wineId !== undefined) parameters.set("wineId", options.wineId);
  const query = parameters.size === 0 ? "" : `?${parameters.toString()}`;
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/bottles${query}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return BottleListResponseSchema.parse(await response.json());
}

export async function updateBottle(
  tokenSource: TokenSource,
  spaceId: string,
  bottleId: string,
  request: UpdateBottleRequest,
): Promise<BottleResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/bottles/${bottleId}`,
    {
      body: JSON.stringify(UpdateBottleRequestSchema.parse(request)),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
  );
  if (!response.ok) throw await apiError(response);
  return BottleResponseSchema.parse(await response.json());
}

export async function createPurchase(
  tokenSource: TokenSource,
  spaceId: string,
  request: CreatePurchaseRequest,
  idempotencyKey: string,
): Promise<PurchaseResponse> {
  const response = await authenticatedFetch(tokenSource, `/api/v1/spaces/${spaceId}/purchases`, {
    body: JSON.stringify(CreatePurchaseRequestSchema.parse(request)),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    method: "POST",
  });
  if (!response.ok) throw await apiError(response);
  return PurchaseResponseSchema.parse(await response.json());
}

export async function getWishlist(
  tokenSource: TokenSource,
  spaceId: string,
  state?: string,
  signal?: AbortSignal,
): Promise<WishlistListResponse> {
  const query = state === undefined ? "" : `?state=${encodeURIComponent(state)}`;
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wishlist${query}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return WishlistListResponseSchema.parse(await response.json());
}

export async function createWishlistItem(
  tokenSource: TokenSource,
  spaceId: string,
  request: CreateWishlistItemRequest,
  idempotencyKey: string,
): Promise<WishlistItemResponse> {
  const response = await authenticatedFetch(tokenSource, `/api/v1/spaces/${spaceId}/wishlist`, {
    body: JSON.stringify(CreateWishlistItemRequestSchema.parse(request)),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    method: "POST",
  });
  if (!response.ok) throw await apiError(response);
  return WishlistItemResponseSchema.parse(await response.json());
}

export async function updateWishlistItem(
  tokenSource: TokenSource,
  spaceId: string,
  itemId: string,
  request: UpdateWishlistItemRequest,
): Promise<WishlistItemResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wishlist/${itemId}`,
    {
      body: JSON.stringify(UpdateWishlistItemRequestSchema.parse(request)),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
  );
  if (!response.ok) throw await apiError(response);
  return WishlistItemResponseSchema.parse(await response.json());
}

export async function getPriceObservations(
  tokenSource: TokenSource,
  spaceId: string,
  wineId: string,
  options: { currency?: string; freshnessDays?: number } = {},
  signal?: AbortSignal,
): Promise<PriceObservationListResponse> {
  const parameters = new URLSearchParams();
  if (options.currency !== undefined) parameters.set("currency", options.currency);
  if (options.freshnessDays !== undefined) {
    parameters.set("freshnessDays", String(options.freshnessDays));
  }
  const query = parameters.size === 0 ? "" : `?${parameters.toString()}`;
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wines/${wineId}/prices${query}`,
    signal === undefined ? {} : { signal },
  );
  if (!response.ok) throw await apiError(response);
  return PriceObservationListResponseSchema.parse(await response.json());
}

export async function createPriceObservation(
  tokenSource: TokenSource,
  spaceId: string,
  wineId: string,
  request: CreatePriceObservationRequest,
  idempotencyKey: string,
): Promise<PriceObservationResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/wines/${wineId}/prices`,
    {
      body: JSON.stringify(CreatePriceObservationRequestSchema.parse(request)),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return PriceObservationResponseSchema.parse(await response.json());
}

export async function createActionDraft(
  tokenSource: TokenSource,
  spaceId: string,
  request: CreateActionDraftRequest,
  idempotencyKey: string,
): Promise<ActionDraftResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/action-drafts`,
    {
      body: JSON.stringify(CreateActionDraftRequestSchema.parse(request)),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      method: "POST",
    },
  );
  if (!response.ok) throw await apiError(response);
  return ActionDraftResponseSchema.parse(await response.json());
}

export async function confirmActionDraft(
  tokenSource: TokenSource,
  spaceId: string,
  draftId: string,
): Promise<ActionDraftResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/action-drafts/${draftId}/confirm`,
    { method: "POST" },
  );
  if (!response.ok) throw await apiError(response);
  return ActionDraftResponseSchema.parse(await response.json());
}

export async function cancelActionDraft(
  tokenSource: TokenSource,
  spaceId: string,
  draftId: string,
): Promise<ActionDraftResponse> {
  const response = await authenticatedFetch(
    tokenSource,
    `/api/v1/spaces/${spaceId}/action-drafts/${draftId}/cancel`,
    { method: "POST" },
  );
  if (!response.ok) throw await apiError(response);
  return ActionDraftResponseSchema.parse(await response.json());
}
