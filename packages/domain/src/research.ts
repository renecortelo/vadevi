export type ResearchLocale = "ca" | "de" | "en" | "es" | "fr" | "it" | "nl" | "pt-PT";

export type ExternalSourceCandidate = Readonly<{
  canonicalUrl: string;
  licenseIdentifier: string;
  publisher: string;
  retrievedAt: string;
  sourceType: "open_dataset";
  title: string;
}>;

export type ProductCandidate = Readonly<{
  barcode: string;
  brands: string[];
  categories: string[];
  countryTags: string[];
  name: string | null;
  provider: "open_food_facts";
  source: ExternalSourceCandidate;
  warnings: string[];
}>;

export type ProposedFact = Readonly<{
  confidenceMilli: number;
  predicate:
    | "curiosity.highlight"
    | "identity.canonical_name"
    | "producer.history"
    | "producer.name"
    | "region.classification"
    | "region.country"
    | "region.name";
  researchMethod: string;
  source: ExternalSourceCandidate;
  value: string;
}>;

export type ExternalUnavailableReason =
  "invalid_input" | "not_found" | "provider_error" | "rate_limited" | "timeout" | "unsafe_redirect";

export type ExternalResult<T> =
  | { cached: boolean; data: T; status: "success" }
  | { reason: ExternalUnavailableReason; retryAfterSeconds: number | null; status: "unavailable" };

export type BarcodeLookup = Readonly<{
  barcode: string;
  locale: ResearchLocale;
}>;

export type KnowledgeResearchRequest = Readonly<{
  entityId: string;
  locale: ResearchLocale;
  subjectType: "producer" | "region" | "wine";
}>;

export type KnowledgeEntitySearch = Readonly<{
  locale: ResearchLocale;
  subjectType: "producer" | "region" | "wine";
  term: string;
}>;

export type KnowledgeEntityCandidate = Readonly<{
  description: string | null;
  id: string;
  label: string;
}>;

export interface ProductLookupPort {
  lookupBarcode(input: BarcodeLookup): Promise<ExternalResult<ProductCandidate>>;
}

export interface KnowledgeResearchPort {
  research(input: KnowledgeResearchRequest): Promise<ExternalResult<ProposedFact[]>>;
  /** Resolve a producer/region/wine name to candidate entities, so research can
   *  proceed from a name the reader typed rather than a code they never know. */
  searchEntities(input: KnowledgeEntitySearch): Promise<ExternalResult<KnowledgeEntityCandidate[]>>;
}

export type ResearchPorts = Readonly<{
  knowledge: KnowledgeResearchPort | null;
  product: ProductLookupPort | null;
  providerMode: "none" | "open_data";
}>;

/**
 * Optional food-and-wine pairing.
 *
 * A pairing source answers "what wine styles suit this dish" — knowledge the app
 * does not hold and must not invent. It is only ever used to derive criteria for
 * ranking the reader's OWN wines, never to recommend a bottle they do not have.
 * The dish text leaves the device to reach the provider, so a deployment enables
 * this only after its own privacy review, and it defaults off.
 */
export type FoodPairingRequest = Readonly<{
  dish: string;
  locale: ResearchLocale;
}>;

export type PairingWineStyle = Readonly<{
  color: string | null;
  country: string | null;
  description: string | null;
  grapes: string[];
  matchPercent: number | null;
  name: string;
  rank: number;
  region: string | null;
}>;

export type FoodPairingResult = Readonly<{
  provider: "sommelierx";
  styles: PairingWineStyle[];
}>;

export interface FoodPairingPort {
  pair(input: FoodPairingRequest): Promise<ExternalResult<FoodPairingResult>>;
}

export interface ExternalCachePort {
  get<T>(provider: string, key: string, now: string): Promise<T | null>;
  put<T>(provider: string, key: string, value: T, expiresAt: string, now: string): Promise<void>;
}

export interface ExternalRateLimitPort {
  consume(
    provider: string,
    limit: number,
    windowSeconds: number,
    now: string,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

export type SanitizedExternalText = Readonly<{
  flaggedPromptLike: boolean;
  truncated: boolean;
  value: string;
}>;

const promptLikePatterns = [
  /(?:ignore|disregard|override)\s+(?:all\s+|the\s+)?(?:previous|prior|earlier|above)?\s*(?:instructions|messages|rules)/i,
  /(?:system|developer)\s+(?:prompt|message|instructions)/i,
  /(?:call|invoke|execute|run)\s+(?:the\s+)?(?:tool|function|command)/i,
  /(?:reveal|print|return|expose)\s+(?:the\s+)?(?:prompt|secret|token|credentials)/i,
  /(?:act\s+as|you\s+are\s+now)\s+(?:a\s+)?(?:system|assistant|developer)/i,
  /<\/?(?:script|iframe|form|object|embed)\b/i,
  /BEGIN\s+(?:SYSTEM|DEVELOPER)\s+MESSAGE/i,
] as const;

export function sanitizeExternalText(input: string, maximumLength: number): SanitizedExternalText {
  const withoutControls = [...input.normalize("NFKC")]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 8 ||
        code === 11 ||
        code === 12 ||
        (code >= 14 && code <= 31) ||
        (code >= 127 && code <= 159)
        ? " "
        : character;
    })
    .join("");
  const normalized = withoutControls
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const flaggedPromptLike = promptLikePatterns.some((pattern) => pattern.test(normalized));
  return {
    flaggedPromptLike,
    truncated: normalized.length > maximumLength,
    value: normalized.slice(0, maximumLength),
  };
}

/**
 * Optional label reading.
 *
 * OCR returns bounded text only — never a stored image and never a wine record.
 * The text is treated exactly like any other external string: sanitized,
 * length-bounded, and rejected before model input when it looks like an
 * instruction. A deployment with no OCR provider returns a degraded result and
 * the manual form stays available, which is what `AC-014` requires.
 */
export type OcrLine = Readonly<{
  confidence: "high" | "low" | "medium";
  text: string;
}>;

export type OcrResult = Readonly<{
  lines: OcrLine[];
  provider: "cloudflare_ai";
  warnings: string[];
}>;

export type OcrRequest = Readonly<{
  /** Re-encoded, EXIF-stripped image bytes. Never persisted by the adapter. */
  bytes: ArrayBuffer;
  locale: string;
  mimeType: "image/jpeg" | "image/webp";
}>;

export interface OcrPort {
  readLabel(input: OcrRequest): Promise<ExternalResult<OcrResult>>;
}
