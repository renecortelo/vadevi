import type {
  FoodIdeasPort,
  FoodIdeasRequest,
  NarrativePort,
  NarrativeRequest,
  ResearchLocale,
  TastingComparisonRequest,
} from "@vadevi/domain";
import { sanitizeExternalText } from "@vadevi/domain";

import { wholeSentences } from "./assistant-language";

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
/**
 * How to address the reader, as the rest of the app does: as a friend in the
 * languages where the app uses the familiar form, formally where it does not.
 * Left to itself the model chose "usted", and the paragraph read as a letter
 * from a bank beside a chat that says "tú".
 */
function register(locale: TastingComparisonRequest["locale"]): string {
  const forms: Record<string, string> = {
    ca: "When addressing the reader, use 'tu'.",
    de: "When addressing the reader, use 'Sie'.",
    en: "When addressing the reader, use 'you'.",
    es: "When addressing the reader, use 'tú', never 'usted'.",
    fr: "When addressing the reader, use 'vous'.",
    it: "When addressing the reader, use 'tu'.",
    nl: "When addressing the reader, use 'je'.",
    "pt-PT": "When addressing the reader, use 'tu'.",
  };
  return forms[locale] ?? forms.en!;
}

export class CloudflareNarrativeAdapter implements NarrativePort {
  constructor(
    private readonly ai: WorkersAiRunner,
    private readonly model: string,
  ) {}

  /**
   * The taster's impression set beside what the sources say.
   *
   * Both lists are already-recorded material; the model's whole job is to relate
   * them — what matches, what does not, what only one side mentions — and to say
   * plainly when they simply do not overlap. It may not introduce a flavour, a
   * rating or a fact that neither side stated, which is what keeps this a reading
   * of the record rather than a new opinion about the wine.
   */
  async compare(input: TastingComparisonRequest): Promise<string | null> {
    const clean = (lines: readonly string[] | undefined) =>
      (lines ?? [])
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, 10)
        .map((line) => line.slice(0, 600));
    const tasting = clean(input.tasting);
    const sources = clean(input.sources);
    const grapes = clean(input.grapes);
    // A comparison needs a tasting and something to set it against; with
    // either missing a paragraph would have to invent one side.
    if (tasting.length === 0 || (sources.length === 0 && grapes.length === 0)) return null;
    const language = languageNames[input.locale];
    try {
      const output = await this.ai.run(this.model, {
        max_tokens: 500,
        messages: [
          {
            content:
              `You are a sommelier writing in ${language}. You are given what a ` +
              `taster (or a group) recorded about one wine ("tasting"), what the ` +
              `wine's own sources — the producer and published tastings — say about ` +
              `it ("sources"), and what a wine library says is typical of the grape ` +
              `varieties it is made from ("grapes"; general to each variety, not a ` +
              `description of this wine). Write 3 to 5 sentences setting the tasting ` +
              `beside the other two: where it agrees, where it differs, and what only ` +
              `one side mentions. From "sources" use ONLY what they say about how ` +
              `the wine looks, smells, tastes and feels — colour, aromas, flavours, ` +
              `sweetness, acidity, tannin, body, texture, finish — and the dishes it ` +
              `is said to suit; ignore, and never mention, history, founding years, ` +
              `places, hectares, awards, prices, shops or production facts. If the ` +
              `sources say nothing about how it tastes, leave them out rather than ` +
              `remarking on it. Attribute every point plainly: "you found…", "the ` +
              `producer describes…", "Garnacha typically shows…" — never present a ` +
              `grape's typical profile as the producer's words or as this bottle's; ` +
              `a departure from the typical profile is worth noting, not a fault. ` +
              `Each tasting line says whose tasting it is. Speak to the reader as ` +
              `"you" only about a line marked as the reader's own; describe anyone ` +
              `else's tasting in the third person, by name ("Maria found…"). If no ` +
              `line is the reader's own, never write that the reader found, noted or ` +
              `tasted anything. ${register(input.locale)} ` +
              `Use ONLY these lists — ` +
              `never add a flavour, a score, a grape or any detail none of them ` +
              `states. If they barely overlap, say so. Finish every sentence. Reply ` +
              `with the paragraph only, no preamble.`,
            role: "system",
          },
          {
            content: JSON.stringify({ grapes, sources, tasting, wine: input.wine.slice(0, 200) }),
            role: "user",
          },
        ],
        temperature: 0.2,
      });
      const raw = output.response;
      if (typeof raw !== "string") return null;
      const sanitized = sanitizeExternalText(raw, 1_400);
      if (sanitized.flaggedPromptLike) return null;
      // Ended at its last whole sentence if it ran long, never mid-word.
      const text = sanitized.truncated ? wholeSentences(sanitized.value) : sanitized.value;
      return text.length === 0 ? null : text;
    } catch (error) {
      console.warn(
        `comparison model call failed (model=${this.model}): ${
          error instanceof Error ? error.name : "unknown"
        }`,
      );
      return null;
    }
  }

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
