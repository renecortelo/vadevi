import { BraveWebSearchAdapter, TavilyWebSearchAdapter } from "./web-search";
import { createTranslationPort } from "./translation";
import { D1ExternalCache, D1ExternalRateLimiter } from "./external-state";
import { OpenFoodFactsAdapter } from "./open-food-facts";
import { WikidataAdapter } from "./wikidata";
import type { ResearchPorts, WebSearchPort } from "@vadevi/domain";
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

function validSearchKey(value: string | undefined): value is string {
  return value !== undefined && /^[A-Za-z0-9_-]{20,64}$/.test(value.trim());
}

export function externalResearchEnabled(environment: WorkerBindings): boolean {
  return (
    environment.RESEARCH_PROVIDER === "open_data" &&
    validUserAgent(environment.EXTERNAL_API_USER_AGENT)
  );
}

/**
 * Whether open-web discovery is enabled. It rides on top of research being on,
 * and needs a supported provider, a well-formed key, and a valid contact user
 * agent — and only after the deployment's own privacy review, since the search
 * query leaves the device (see docs/privacy-review-websearch.md). Default off.
 */
export function webSearchEnabled(environment: WorkerBindings): boolean {
  return (
    externalResearchEnabled(environment) &&
    (environment.WEBSEARCH_PROVIDER === "brave" || environment.WEBSEARCH_PROVIDER === "tavily") &&
    validSearchKey(environment.WEBSEARCH_API_KEY)
  );
}

export function createResearchPorts(
  database: D1Database,
  environment: WorkerBindings,
): ResearchPorts {
  if (!externalResearchEnabled(environment)) {
    return {
      knowledge: null,
      product: null,
      providerMode: "none",
      translation: null,
      webSearch: null,
    };
  }
  const cache = new D1ExternalCache(database);
  const limiter = new D1ExternalRateLimiter(database);
  const userAgent = environment.EXTERNAL_API_USER_AGENT!;
  let webSearch: WebSearchPort | null = null;
  if (webSearchEnabled(environment)) {
    const key = environment.WEBSEARCH_API_KEY!.trim();
    webSearch =
      environment.WEBSEARCH_PROVIDER === "tavily"
        ? new TavilyWebSearchAdapter(cache, limiter, userAgent, key)
        : new BraveWebSearchAdapter(cache, limiter, userAgent, key);
  }
  return {
    knowledge: new WikidataAdapter(cache, limiter, userAgent),
    product: new OpenFoodFactsAdapter(cache, limiter, userAgent),
    providerMode: "open_data",
    translation: createTranslationPort(environment),
    webSearch,
  };
}
