import type {
  FoodIdeasPort,
  FoodIdeasRequest,
  NarrativePort,
  NarrativeRequest,
  ResearchLocale,
} from "@vadevi/domain";
import { sanitizeExternalText } from "@vadevi/domain";

import { extractStringArray } from "./translation";

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

/**
 * Dish ideas for a wine, from the wine's own recorded attributes. The output is a
 * short JSON array of dish phrases — no prose, no claims about the bottle — which
 * the caller surfaces as an explicit suggestion.
 */
export class CloudflareFoodIdeasAdapter implements FoodIdeasPort {
  constructor(
    private readonly ai: WorkersAiRunner,
    private readonly model: string,
  ) {}

  async suggest(input: FoodIdeasRequest): Promise<string[] | null> {
    const attributes = input.attributes
      .map((attribute) => attribute.trim())
      .filter((attribute) => attribute.length > 0)
      .slice(0, 10)
      .map((attribute) => attribute.slice(0, 300));
    const notes = input.notes
      .map((note) => note.trim())
      .filter((note) => note.length > 0)
      .slice(0, 2)
      .map((note) => note.slice(0, 200));
    if (attributes.length === 0 && notes.length === 0) return null;
    const language = languageNames[input.locale];
    try {
      const output = await this.ai.run(this.model, {
        max_tokens: 300,
        messages: [
          {
            content:
              `You are a sommelier suggesting food for a wine, writing in ${language}. ` +
              `Base the pairing on "wine" — what the bottle is, and what the sources ` +
              `say about it or its grape. "readerNotes" is one person's impression of ` +
              `one glass: use it only as secondary colour, and never let it override ` +
              `what the wine is. The wine's "type" governs the pairing: a white, ` +
              `rosé, sparkling or light wine goes with lighter fare — fish, poultry, ` +
              `vegetables, fresh cheeses — and NOT with red meats or heavy stews; a ` +
              `red goes with fuller dishes; a fortified or sweet wine with its own ` +
              `matches. Never suggest a dish that contradicts the type. Propose 2 to ` +
              `4 dishes that would suit it. Each entry is a short phrase naming the ` +
              `dish and, after an em dash, a few words on why it works. Suggest ` +
              `dishes only — never state new facts about the wine, never invent its ` +
              `flavours, score, or price. Reply with ONLY a JSON array of strings. ` +
              `No markdown.`,
            role: "system",
          },
          {
            content: JSON.stringify({
              readerNotes: notes,
              wine: { attributes, name: input.wine.slice(0, 200) },
            }),
            role: "user",
          },
        ],
        temperature: 0.3,
      });
      const ideas = extractStringArray(output);
      if (ideas === null || ideas.length === 0) return null;
      const safe = ideas
        .map((idea) => sanitizeExternalText(idea, 240))
        .filter((idea) => idea.value.length > 0 && !idea.flaggedPromptLike)
        .map((idea) => idea.value)
        .slice(0, 4);
      return safe.length === 0 ? null : safe;
    } catch (error) {
      console.warn(
        `food ideas model call failed (model=${this.model}): ${
          error instanceof Error ? error.name : "unknown"
        }`,
      );
      return null;
    }
  }
}

export function createFoodIdeasPort(environment: {
  AI?: WorkersAiRunner;
  AI_MODEL?: string;
  AI_PROVIDER?: "cloudflare" | "none";
}): FoodIdeasPort | null {
  if (
    environment.AI_PROVIDER !== "cloudflare" ||
    environment.AI === undefined ||
    environment.AI_MODEL === undefined ||
    !/^@cf\/[a-z0-9][a-z0-9._/-]{2,119}$/.test(environment.AI_MODEL)
  ) {
    return null;
  }
  return new CloudflareFoodIdeasAdapter(environment.AI, environment.AI_MODEL);
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
