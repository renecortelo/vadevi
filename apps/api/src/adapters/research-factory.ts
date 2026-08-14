import { D1ExternalCache, D1ExternalRateLimiter } from "./external-state";
import { OpenFoodFactsAdapter } from "./open-food-facts";
import { WikidataAdapter } from "./wikidata";
import type { ResearchPorts } from "@vadevi/domain";
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

export function externalResearchEnabled(environment: WorkerBindings): boolean {
  return (
    environment.RESEARCH_PROVIDER === "open_data" &&
    validUserAgent(environment.EXTERNAL_API_USER_AGENT)
  );
}

export function createResearchPorts(
  database: D1Database,
  environment: WorkerBindings,
): ResearchPorts {
  if (!externalResearchEnabled(environment)) {
    return { knowledge: null, product: null, providerMode: "none" };
  }
  const cache = new D1ExternalCache(database);
  const limiter = new D1ExternalRateLimiter(database);
  const userAgent = environment.EXTERNAL_API_USER_AGENT!;
  return {
    knowledge: new WikidataAdapter(cache, limiter, userAgent),
    product: new OpenFoodFactsAdapter(cache, limiter, userAgent),
    providerMode: "open_data",
  };
}
