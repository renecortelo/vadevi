import type { ResearchLocale, TranslationPort, TranslationRequest } from "@vadevi/domain";
import { sanitizeExternalText } from "@vadevi/domain";

type WorkersAiRunner = Readonly<{
  run: (model: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}>;

const languageNames: Record<ResearchLocale, string> = {
  ca: "Catalan",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  nl: "Dutch",
  "pt-PT": "European Portuguese",
};

/** Pull a JSON array of strings out of a model reply, tolerating code fences. */
export function extractStringArray(output: Record<string, unknown>): string[] | null {
  const raw = output.response;
  if (typeof raw !== "string") return null;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) return null;
  return parsed as string[];
}

/**
 * What one model call will take. A composed paragraph runs to 900 characters,
 * so the per-text cap sits above it; the per-call cap keeps the reply inside
 * `max_tokens`, because a reply cut short is a shorter array, and a shorter
 * array is rejected whole.
 */
export const translationLimits = {
  charactersPerCall: 6_000,
  charactersPerText: 1_000,
  textsPerCall: 16,
} as const;

/**
 * Split texts into runs that fit one call each, as index groups in order.
 *
 * The adapter clips a call to its limits, and a caller that hands it more than
 * that gets back fewer strings than it sent — a length mismatch, which it
 * rightly treats as failure and keeps every original. Seven web notes (a title
 * and a body each) plus the summary already exceeded sixteen, so a wine with
 * more than a handful of sources was silently never translated. Callers batch
 * with this and send each run on its own.
 */
export function translationBatches(texts: readonly string[]): number[][] {
  const batches: number[][] = [];
  let current: number[] = [];
  let characters = 0;
  texts.forEach((text, index) => {
    const length = Math.min(text.length, translationLimits.charactersPerText);
    if (
      current.length > 0 &&
      (current.length >= translationLimits.textsPerCall ||
        characters + length > translationLimits.charactersPerCall)
    ) {
      batches.push(current);
      current = [];
      characters = 0;
    }
    current.push(index);
    characters += length;
  });
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Faithful translation via Workers AI. The prompt constrains the model to a pure,
 * order-preserving transform — never generation — and the output is validated to
 * be a same-length array; anything off returns null so the caller keeps the
 * originals. Every translated string is re-sanitized, since it is still text that
 * passed through an external model.
 */
export class CloudflareTranslationAdapter implements TranslationPort {
  constructor(
    private readonly ai: WorkersAiRunner,
    private readonly model: string,
  ) {}

  async translate(input: TranslationRequest): Promise<(string | null)[] | null> {
    const texts = input.texts
      .slice(0, translationLimits.textsPerCall)
      .map((text) => text.slice(0, translationLimits.charactersPerText));
    if (texts.length === 0) return [];
    const language = languageNames[input.locale];
    try {
      const output = await this.ai.run(this.model, {
        max_tokens: 4_000,
        messages: [
          {
            content:
              `You are a precise translator. Translate each string in the given JSON ` +
              `array into ${language}. Preserve the meaning exactly; never add, omit, ` +
              `or comment. If a string is already in ${language}, return it unchanged. ` +
              `Keep proper names, and keep any "Label · Property: value" structure ` +
              `with its separators, translating only the words. ` +
              `Reply with ONLY a JSON array of the translated strings, in the same ` +
              `order and of the same length. No markdown.`,
            role: "system",
          },
          { content: JSON.stringify(texts), role: "user" },
        ],
        temperature: 0,
      });
      const translated = extractStringArray(output);
      if (translated === null || translated.length !== texts.length) {
        console.warn(
          `translation returned no usable array (model=${this.model}, wanted=${texts.length})`,
        );
        return null;
      }
      return translated.map((value) => {
        const sanitized = sanitizeExternalText(value, translationLimits.charactersPerText);
        return sanitized.value.length === 0 || sanitized.flaggedPromptLike ? null : sanitized.value;
      });
    } catch (error) {
      console.warn(
        `translation model call failed (model=${this.model}): ${
          error instanceof Error ? error.name : "unknown"
        }`,
      );
      return null;
    }
  }
}

export function createTranslationPort(environment: {
  AI?: WorkersAiRunner;
  AI_MODEL?: string;
  AI_PROVIDER?: "cloudflare" | "none";
}): TranslationPort | null {
  if (
    environment.AI_PROVIDER !== "cloudflare" ||
    environment.AI === undefined ||
    environment.AI_MODEL === undefined ||
    !/^@cf\/[a-z0-9][a-z0-9._/-]{2,119}$/.test(environment.AI_MODEL)
  ) {
    return null;
  }
  return new CloudflareTranslationAdapter(environment.AI, environment.AI_MODEL);
}
