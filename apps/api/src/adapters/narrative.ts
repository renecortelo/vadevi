import type { NarrativePort, NarrativeRequest, ResearchLocale } from "@vadevi/domain";
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
 * A short grounded "about this wine" paragraph via Workers AI. The model may only
 * rephrase and weave the supplied statements — a summary and the discovered
 * highlights, each already cited elsewhere — never add a claim of its own. The
 * result is sanitized like any external text and returns null on any failure, so
 * the caller keeps the paragraph it already had.
 */
export class CloudflareNarrativeAdapter implements NarrativePort {
  constructor(
    private readonly ai: WorkersAiRunner,
    private readonly model: string,
  ) {}

  async compose(input: NarrativeRequest): Promise<string | null> {
    const statements = input.statements
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0)
      .slice(0, 12)
      .map((statement) => statement.slice(0, 600));
    if (statements.length === 0) return null;
    const language = languageNames[input.locale];
    try {
      const output = await this.ai.run(this.model, {
        max_tokens: 400,
        messages: [
          {
            content:
              `You are a warm, precise sommelier writing a short "about this wine" ` +
              `note in ${language}. Use ONLY the facts provided — never invent ` +
              `flavours, aromas, ratings, prices, grapes, or any detail not stated. ` +
              `Weave the facts into 2 to 4 natural sentences; if little is given, ` +
              `keep it short. Do not list sources or add a preamble. Reply with the ` +
              `paragraph only.`,
            role: "system",
          },
          {
            content: JSON.stringify({ facts: statements, wine: input.wine.slice(0, 200) }),
            role: "user",
          },
        ],
        temperature: 0.2,
      });
      const raw = output.response;
      if (typeof raw !== "string") return null;
      const sanitized = sanitizeExternalText(raw, 800);
      return sanitized.value.length === 0 || sanitized.flaggedPromptLike ? null : sanitized.value;
    } catch (error) {
      console.warn(
        `narrative model call failed (model=${this.model}): ${
          error instanceof Error ? error.name : "unknown"
        }`,
      );
      return null;
    }
  }
}

export function createNarrativePort(environment: {
  AI?: WorkersAiRunner;
  AI_MODEL?: string;
  AI_PROVIDER?: "cloudflare" | "none";
}): NarrativePort | null {
  if (
    environment.AI_PROVIDER !== "cloudflare" ||
    environment.AI === undefined ||
    environment.AI_MODEL === undefined ||
    !/^@cf\/[a-z0-9][a-z0-9._/-]{2,119}$/.test(environment.AI_MODEL)
  ) {
    return null;
  }
  return new CloudflareNarrativeAdapter(environment.AI, environment.AI_MODEL);
}
