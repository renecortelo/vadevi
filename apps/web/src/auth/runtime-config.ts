// The session contract alone, through its own subpath: the package's index
// re-exports every schema in the application, and a schema is an object, not
// a function, so nothing tree-shakes — importing one from the index put the
// whole of it, some 67 KiB gzipped, on the signed-out route for this one
// response shape.
import { type RuntimeConfigResponse, RuntimeConfigResponseSchema } from "@vadevi/contracts/session";

const runtimeConfigKey = "vadevi.runtimeConfig";

/**
 * The deployment's public browser configuration: feature flags and the
 * Firebase web app identity. Fetched before anything else, so it lives here
 * rather than in the API client, which carries every contract with it.
 */
export async function fetchRuntimeConfig(signal?: AbortSignal): Promise<RuntimeConfigResponse> {
  const response = await fetch("/runtime-config", {
    headers: { Accept: "application/json" },
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok)
    throw new Error(`The runtime configuration request failed (${response.status}).`);
  return RuntimeConfigResponseSchema.parse(await response.json());
}

/**
 * The last runtime configuration this deployment served, kept for a launch
 * with no network. Validated on the way back out, so a stale or hand-edited
 * value is discarded rather than trusted.
 */
export function rememberedRuntimeConfig(): RuntimeConfigResponse | null {
  try {
    const stored = globalThis.localStorage?.getItem(runtimeConfigKey);
    if (stored === null || stored === undefined) return null;
    return RuntimeConfigResponseSchema.parse(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function rememberRuntimeConfig(config: RuntimeConfigResponse): void {
  try {
    globalThis.localStorage?.setItem(runtimeConfigKey, JSON.stringify(config));
  } catch {
    // Storage refused: the next offline launch will have nothing, as before.
  }
}
