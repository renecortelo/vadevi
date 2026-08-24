import { BraveImageSearchAdapter } from "./image-search";
import { BraveWebSearchAdapter, TavilyWebSearchAdapter } from "./web-search";
import { createNarrativePort } from "./narrative";
import { createTranslationPort } from "./translation";
import { D1ExternalCache, D1ExternalRateLimiter } from "./external-state";
import { OpenFoodFactsAdapter } from "./open-food-facts";
import { WikidataAdapter } from "./wikidata";
import type { ImageSearchPort, ResearchPorts, WebSearchPort } from "@vadevi/domain";
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

/**
 * Whether bottle-photo search is enabled. It reuses the Brave key and contact
 * user agent that open-web discovery already needs, and only that provider —
 * Brave's image CDN is the fixed host a chosen photo is later fetched from. Off
 * unless research and Brave web search are both on.
 */
export function imageSearchEnabled(environment: WorkerBindings): boolean {
  return webSearchEnabled(environment) && environment.WEBSEARCH_PROVIDER === "brave";
}

export function createImageSearchPort(
  database: D1Database,
  environment: WorkerBindings,
): ImageSearchPort | null {
  if (!imageSearchEnabled(environment)) return null;
  return new BraveImageSearchAdapter(
    new D1ExternalCache(database),
    new D1ExternalRateLimiter(database),
    environment.EXTERNAL_API_USER_AGENT!,
    environment.WEBSEARCH_API_KEY!.trim(),
  );
}

export function createResearchPorts(
  database: D1Database,
  environment: WorkerBindings,
): ResearchPorts {
  if (!externalResearchEnabled(environment)) {
    return {
      knowledge: null,
      narrative: null,
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
    narrative: createNarrativePort(environment),
    product: new OpenFoodFactsAdapter(cache, limiter, userAgent),
    providerMode: "open_data",
    translation: createTranslationPort(environment),
    webSearch,
  };
}
