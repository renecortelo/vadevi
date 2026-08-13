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
} from "@vadevi/contracts";

type TokenSource = {
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiError(response: Response): Promise<ApiError> {
  try {
    const envelope = ErrorEnvelopeSchema.parse(await response.clone().json());
    return new ApiError(envelope.error.message, response.status, envelope.error.code);
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
