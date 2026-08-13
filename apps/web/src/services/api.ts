import {
  BootstrapResponseSchema,
  ErrorEnvelopeSchema,
  HealthResponseSchema,
  RuntimeConfigResponseSchema,
  UpdateProfileRequestSchema,
  type BootstrapResponse,
  type HealthResponse,
  type RuntimeConfigResponse,
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
