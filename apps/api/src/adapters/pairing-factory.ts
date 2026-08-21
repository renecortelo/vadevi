import type { FoodPairingPort } from "@vadevi/domain";

import { D1ExternalCache, D1ExternalRateLimiter } from "./external-state";
import { SommelierXAdapter } from "./sommelierx";
import type { WorkerBindings } from "../types";

function validUserAgent(value: string | undefined): value is string {
  return (
    value !== undefined &&
    value.length >= 16 &&
    value.length <= 300 &&
    !/[\r\n]/.test(value) &&
    /VaDeVi\//.test(value) &&
    /https:\/\//.test(value)
  );
}

function validApiKey(value: string | undefined): value is string {
  return value !== undefined && /^sk_live_[a-f0-9]{16,64}$/.test(value.trim());
}

/**
 * Whether food-and-wine pairing is enabled for this deployment. Off unless the
 * operator has chosen the provider, supplied a well-formed key, and set a valid
 * contact user agent — and only after their own privacy review, since the dish
 * text leaves the device to reach the provider (see docs/privacy-review-sommelierx.md).
 */
export function foodPairingEnabled(environment: WorkerBindings): boolean {
  return (
    environment.PAIRING_PROVIDER === "sommelierx" &&
    validApiKey(environment.SOMMELIERX_API_KEY) &&
    validUserAgent(environment.EXTERNAL_API_USER_AGENT)
  );
}

export function createFoodPairingPort(
  database: D1Database,
  environment: WorkerBindings,
): FoodPairingPort | null {
  if (!foodPairingEnabled(environment)) return null;
  return new SommelierXAdapter(
    new D1ExternalCache(database),
    new D1ExternalRateLimiter(database),
    environment.EXTERNAL_API_USER_AGENT!,
    environment.SOMMELIERX_API_KEY!.trim(),
  );
}
