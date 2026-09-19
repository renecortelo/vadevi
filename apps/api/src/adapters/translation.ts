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

/**
 * Pull the array of strings out of a model reply. The structured path answers
 * with an object (or its JSON string) whose `translations` is the array; the
 * plain-prompt path answers with the bare array, possibly inside prose or a
 * code fence, so it is recovered from the first bracket to the last.
 */
export function extractStringArray(output: Record<string, unknown>): string[] | null {
  const raw = output.response ?? output;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const start = raw.search(/[[{]/);
    const end = Math.max(raw.lastIndexOf("]"), raw.lastIndexOf("}"));
    if (start === -1 || end <= start) return null;
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    parsed = (parsed as { translations?: unknown }).translations;
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) return null;
  return parsed as string[];
}

/** The reply shape the structured path asks for: one array, nothing else. */
const translationsJsonSchema = {
  additionalProperties: false,
  properties: { translations: { items: { type: "string" }, type: "array" } },
  required: ["translations"],
  type: "object",
} as const;

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
    // A strict JSON schema first — the same way the assistant asks for its
    // claims, and for the same reason: sixteen translated paragraphs written
    // as a bare array came back unparseable often enough (a fence, a stray
    // quote, prose around it) that a whole page stayed untranslated. Not every
    // model accepts a schema, so the plain prompt remains as the second try.
    for (const structured of [true, false]) {
      const translated = await this.callModel(texts, input.locale, structured);
      if (translated !== null && translated.length === texts.length) {
        return translated.map((value) => {
          const sanitized = sanitizeExternalText(value, translationLimits.charactersPerText);
          return sanitized.value.length === 0 || sanitized.flaggedPromptLike
            ? null
            : sanitized.value;
        });
      }
    }
    return null;
  }

  private async callModel(
    texts: string[],
    locale: ResearchLocale,
    structured: boolean,
  ): Promise<string[] | null> {
    const language = languageNames[locale];
    const instruction =
      `You are a precise translator. Translate each string in the given JSON ` +
      `array into ${language}. Preserve the meaning exactly; never add, omit, ` +
      `or comment. If a string is already in ${language}, return it unchanged. ` +
      `Keep proper names — producers, wines, shops, publications, page titles' ` +
      `brand parts — exactly as written, and keep any "Label · Property: value" ` +
      `structure with its separators, translating only the words. ` +
      (structured
        ? `Answer with a JSON object whose "translations" is the array of translated ` +
          `strings, in the same order and of the same length as the input.`
        : `Reply with ONLY a JSON array of the translated strings, in the same ` +
          `order and of the same length. No markdown.`);
    const payload: Record<string, unknown> = {
      max_tokens: 4_000,
      messages: [
        { content: instruction, role: "system" },
        { content: JSON.stringify(texts), role: "user" },
      ],
      temperature: 0,
    };
    if (structured) {
      payload.response_format = { json_schema: translationsJsonSchema, type: "json_schema" };
    }
    try {
      const output = await this.ai.run(this.model, payload);
      const translated = extractStringArray(output);
      if (translated === null || translated.length !== texts.length) {
        // The shape only, never the text: it is gathered web prose, but it is
        // about the reader's wine.
        const raw = output.response;
        console.warn(
          `translation returned no usable array (structured=${structured}, model=${this.model}, ` +
            `wanted=${texts.length}, got=${translated?.length ?? "none"}, ` +
            `responseType=${typeof raw}, length=${typeof raw === "string" ? raw.length : "n/a"})`,
        );
        return null;
      }
      return translated;
    } catch (error) {
      console.warn(
        `translation model call failed (structured=${structured}, model=${this.model}): ${
          error instanceof Error ? error.message : "unknown"
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
