import type {
  FoodIdeasPort,
  FoodIdeasRequest,
  NarrativePort,
  NarrativeRequest,
  ResearchLocale,
  TasteBioRequest,
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

/**
 * Words that address the reader, by language: a paragraph a whole group reads
 * may contain none of them. Only words that cannot be read otherwise there —
 * German "Sie" is also "she" and "they", Italian "Lei" is also "she", so
 * neither is listed.
 */
const secondPerson: Record<ResearchLocale, RegExp> = {
  ca: /(?<!\p{L})(tu|teu|teva|teus|teves|et|vosaltres|vostre|vostra|vostres)(?!\p{L})/iu,
  de: /(?<!\p{L})(du|dich|dir|dein|deine|deinen|deinem|deiner|deines|euch|euer|eure)(?!\p{L})|(?<!\p{L})Ihnen(?!\p{L})/u,
  en: /(?<!\p{L})(you|your|yours|yourself)(?!\p{L})/iu,
  es: /(?<!\p{L})(tú|tu|tus|te|ti|contigo|usted|ustedes|vosotros|vosotras|vuestro|vuestra|vuestros|vuestras)(?!\p{L})/iu,
  fr: /(?<!\p{L})(tu|toi|ton|ta|tes|vous|votre|vos)(?!\p{L})/iu,
  it: /(?<!\p{L})(tu|te|ti|tuo|tua|tuoi|tue|voi|vostro|vostra|vostri|vostre)(?!\p{L})/iu,
  nl: /(?<!\p{L})(je|jij|jou|jouw|u|uw|jullie)(?!\p{L})/iu,
  "pt-PT":
    /(?<!\p{L})(tu|te|ti|teu|tua|teus|tuas|contigo|você|vocês|vós|vosso|vossa|vossos|vossas)(?!\p{L})/iu,
};

/** Whether a paragraph for a group speaks to someone in it. */
export function addressesTheReader(text: string, locale: ResearchLocale): boolean {
  return secondPerson[locale].test(text);
}

/**
 * Whether every number in a text is one of the given ones. "4,3", "4.3",
 * "75 %" and "23 €" are read as 4.3, 75 and 23; a number that is none of the
 * facts' is one the writer added.
 */
export function numbersAreTheFacts(text: string, numbers: readonly number[]): boolean {
  const allowed = new Set(numbers.map((value) => Math.round(value * 10) / 10));
  const found = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return found.every((written) => {
    const value = Number.parseFloat(written.replace(",", "."));
    return allowed.has(Math.round(value * 10) / 10);
  });
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
    // Read by the whole group, the paragraph names everyone and speaks to no
    // one; read by its author alone, it speaks to them.
    const perspective =
      input.audience === "group"
        ? `This paragraph is read by every member of the group, so write it ` +
          `entirely in the third person: name each taster every time ("Maria ` +
          `found…", "René rated it…"), and never address the reader or use ` +
          `"you", "your", "I", "we" or their equivalents in ${language}.`
        : `Speak to the reader as "you" only about a line marked as the ` +
          `reader's own; describe anyone else's tasting in the third person, by ` +
          `name ("Maria found…"). If no line is the reader's own, never write ` +
          `that the reader found, noted or tasted anything. ${register(input.locale)}`;
    // A group's paragraph that slipped into "you" is asked for once more, and
    // not kept if it does again.
    for (let attempt = 0; attempt < (input.audience === "group" ? 2 : 1); attempt += 1) {
      const text = await this.writeComparison(input, perspective, { grapes, sources, tasting });
      if (text === null) return null;
      if (input.audience !== "group" || !addressesTheReader(text, input.locale)) return text;
    }
    return null;
  }

  private async writeComparison(
    input: TastingComparisonRequest,
    perspective: string,
    lists: { grapes: string[]; sources: string[]; tasting: string[] },
  ): Promise<string | null> {
    const { grapes, sources, tasting } = lists;
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
              `Each tasting line says whose tasting it is. ${perspective} ` +
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

  /**
   * The reader's taste in a few sentences, from the facts and nothing else.
   * Every number written must be one of the facts' own — a model that
   * rounds 4.3 points into "about five" or invents a share has added a fact,
   * and the text is not kept.
   */
  async describeTaste(input: TasteBioRequest): Promise<string | null> {
    const facts = input.facts
      .map((fact) => fact.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (facts.length === 0) return null;
    const language = languageNames[input.locale];
    try {
      const output = await this.ai.run(this.model, {
        max_tokens: 400,
        messages: [
          {
            content:
              `You are a sommelier writing in ${language} to a reader about their own ` +
              `taste in wine. You are given facts read from their own tastings and ` +
              `purchases. Write 3 or 4 sentences that tell them their taste: what ` +
              `they score above and below their own average, what they drink most, ` +
              `what they usually pay. Use ONLY these facts: never add a wine, a ` +
              `grape, a region, a flavour or a number they do not state, and copy ` +
              `every number and every name exactly as given — never round a number, ` +
              `turn it into words, or translate or rename a name. ` +
              `Speak of tendencies in their tastings, not truths about wine. ` +
              `${register(input.locale)} Finish every sentence. Reply with the ` +
              `paragraph only, no preamble.`,
            role: "system",
          },
          { content: JSON.stringify({ facts }), role: "user" },
        ],
        temperature: 0.2,
      });
      const raw = output.response;
      if (typeof raw !== "string") return null;
      const sanitized = sanitizeExternalText(raw, 1_200);
      if (sanitized.flaggedPromptLike) return null;
      const text = sanitized.truncated ? wholeSentences(sanitized.value) : sanitized.value;
      if (text.length === 0) return null;
      return numbersAreTheFacts(text, input.numbers) ? text : null;
    } catch (error) {
      console.warn(
        `taste description model call failed (model=${this.model}): ${
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
