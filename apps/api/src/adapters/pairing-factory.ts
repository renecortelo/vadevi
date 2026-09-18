import type { FoodPairingPort } from "@vadevi/domain";

import { D1ExternalCache, D1ExternalRateLimiter } from "./external-state";
import { LocalFoodPairingAdapter } from "./local-pairing";
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
 * Whether food-and-wine pairing is available at all.
 *
 * `local` needs nothing: no key, no contact address, no review, because the dish
 * never leaves the Worker. `sommelierx` needs all three — a well-formed key, a
 * valid contact user agent, and the deployment's own privacy review — because
 * the dish text travels to a third party (see docs/privacy-review-sommelierx.md).
 *
 * An unset or unrecognised value means off, as everywhere else here.
 */
export function foodPairingEnabled(environment: WorkerBindings): boolean {
  if (environment.PAIRING_PROVIDER === "local") return true;
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
  // The local rule set carries no cache and no rate limiter on purpose: there is
  // nothing to be kind to and nothing to wait for. It is arithmetic.
  if (environment.PAIRING_PROVIDER === "local") return new LocalFoodPairingAdapter();
  if (!foodPairingEnabled(environment)) return null;
  return new SommelierXAdapter(
    new D1ExternalCache(database),
    new D1ExternalRateLimiter(database),
    environment.EXTERNAL_API_USER_AGENT!,
    environment.SOMMELIERX_API_KEY!.trim(),
  );
}
