import { type RuntimeConfigResponse, RuntimeConfigResponseSchema } from "@vadevi/contracts";

const runtimeConfigKey = "vadevi.runtimeConfig";

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
