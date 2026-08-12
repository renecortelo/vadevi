import { HealthResponseSchema, type HealthResponse } from "@vadevi/contracts";

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
