/**
 * The checks a proposed grape fact must pass to enter the library.
 *
 * Pure functions, so they are tested on their own. The rule throughout: a
 * value is kept only if (1) its quote occurs in the article — in pieces if
 * the model elided words with "...", each piece verbatim — and (2) the quote
 * says the value: the aroma's own words are in it, an acidity quote speaks of
 * acid, a region's name is in it. Anything else is rejected and reported.
 */

export type Level = "high" | "low" | "medium";
export type Evidence = { field: string; quote: string; value: string };

export type GrapeEntry = {
  acidity: Level | null;
  aromas: string[];
  body: Level | null;
  color: "pink" | "red" | "white" | null;
  evidence: Evidence[];
  id: string;
  names: Record<string, string>;
  origin: string | null;
  pairings: string[];
  /** How many Wikipedias carry an article: a proxy for how often it is met. */
  prominence: number;
  regions: { country: string; name: string }[];
  styles: string[];
  summaries: Record<string, { text: string; translated?: boolean; url: string }>;
  synonyms: { name: string; source: "article" | "wikidata" }[];
  tannin: Level | null;
  wikidataId: string;
  wikipediaUrl: string;
};

/** Lower case, unaccented forms compared; curly quotes and dashes unified. */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function slug(text: string): string {
  return normalize(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Zero-width marks Wikipedia leaves where its footnotes were. */
function clean(text: string): string {
  return text.replace(/\u200b|\u200c|\u200d|\ufeff/g, "");
}

/**
 * A quote too short to stand on its own — "high acidity" — widened to the
 * whole sentence it sits in, so what is checked and kept is the article's
 * statement rather than two words that could be about anything. The sentence
 * comes back in normalised form, which is the form every check compares.
 */
export function expandQuote(quote: string, article: string): string {
  const words = normalize(quote).split(" ").filter(Boolean);
  if (words.length >= 4 || words.length === 0 || /\.\.\.|…/.test(quote)) return quote;
  const normalized = normalize(clean(article));
  const at = normalized.indexOf(normalize(quote));
  if (at === -1) return quote;
  const start = normalized.lastIndexOf(". ", at) + 2;
  const endDot = normalized.indexOf(". ", at);
  const end = endDot === -1 ? normalized.length : endDot + 1;
  return normalized.slice(start === 1 ? 0 : start, end).trim();
}

/** Each piece between elisions occurs in the article, and says something. */
export function quoteIsVerbatim(quote: string, article: string): boolean {
  const haystack = normalize(article);
  const pieces = quote
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map((piece) => normalize(piece).replace(/^[\s,;:.()-]+|[\s,;:.()-]+$/g, ""))
    .filter((piece) => piece.length > 0);
  if (pieces.length === 0) return false;
  // At least one piece must carry real content; a stray "and" proves nothing.
  if (!pieces.some((piece) => piece.split(" ").length >= 4)) return false;
  return pieces.every((piece) => piece.length < 3 || haystack.includes(piece));
}

/** The words of a value are in its quote (accent- and case-blind). */
export function mentions(quote: string, value: string): boolean {
  const target = normalize(value).replace(/[()]/g, "");
  if (target.length === 0) return false;
  const body = normalize(quote);
  if (body.includes(target)) return true;
  // A plural or singular in the article for the other in the value:
  // "berry" for "berries", "cherries" for "cherry", "plums" for "plum".
  const stem = target.replace(/(?:ies|y|es|s)$/, "");
  return stem.length >= 4 && body.includes(stem);
}

const levelWords: Record<Level, RegExp> = {
  high: /\b(high|higher|highly|full|full-bodied|pronounced|bracing|firm|robust|powerful|heavy|plenty of|marked|considerable)\b/,
  low: /\b(low|lower|light|light-bodied|soft|lacks?|lacking|little|thin|mild|mildly|subtle|gentle)\b/,
  medium: /\b(medium|moderate|moderately|medium-bodied|average)\b/,
};

const fieldWords: Record<"acidity" | "body" | "tannin", RegExp> = {
  acidity: /acid/,
  body: /bod(y|ied)|weight|structure/,
  tannin: /tannin|tannic/,
};

function toLevel(value: unknown): Level | null {
  if (typeof value !== "string") return null;
  const text = normalize(value);
  for (const level of ["medium", "high", "low"] as const) {
    if (levelWords[level].test(text) || text === level) return level;
  }
  return null;
}

/** A region as the model writes it: "ES: Rioja", "ES- Rioja", "ES-Rioja". */
export function parseRegion(value: string): { country: string; name: string } | null {
  const match = /^\s*([A-Za-z]{2})\s*[:\-–]\s*(.+?)\s*$/.exec(value);
  if (match === null) return null;
  const name = match[2]!
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+(DOCa|DOCG|DOC|DOQ|DO|AOC|AOP|AVA|IGT|IGP|PDO|PGI)$/i, "")
    .trim();
  return name.length === 0 ? null : { country: match[1]!.toUpperCase(), name };
}

const colorWords: Record<"pink" | "red" | "white", RegExp> = {
  pink: /\b(grey|gray|pink|gris|rose|rosy|copper)/,
  red: /\b(black|red|dark|blue|purple|noir|nero|tinto|negra|rouge)/,
  white: /\b(white|green|yellow|golden|blanc|bianco|blanco)/,
};

const styleWords: Record<string, RegExp> = {
  blending: /blend/,
  fortified: /fortif|port\b|sherry|madeira|marsala|vin doux/,
  rose: /\bros(e|ado|ato)\b|blush/,
  sparkling: /sparkl|champagne|cava|prosecco|cremant|sekt|spumante|petillant|frizzante|mousseux/,
  // Still wine is what a wine grape makes unless it is only ever sparkling or
  // fortified, so any sentence about the wines made from it supports it.
  still: /\b(still|table wine|varietal|wines?)\b/,
  sweet: /sweet|dessert|botryti|noble rot|late.harvest|ice ?wine|passito|vin santo|tokaj/,
};

type Field = { quote?: unknown; value?: unknown };

function field(proposal: Record<string, unknown>, name: string): Field {
  const value = proposal[name];
  return typeof value === "object" && value !== null ? (value as Field) : {};
}

/**
 * A list as the model gives it — an array, or sometimes the same array
 * written out as a string ('["still","blending"]'), which used to be read as
 * one unrecognisable item and the whole list lost.
 */
function list(value: unknown): string[] {
  let items = value;
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      items = JSON.parse(value) as unknown;
    } catch {
      items = [];
    }
  }
  return Array.isArray(items)
    ? items.filter((item): item is string => typeof item === "string")
    : [];
}

export function validateExtraction(
  proposalInput: unknown,
  article: string,
  wikidataOrigin: string[],
): {
  acidity: Level | null;
  aromas: string[];
  body: Level | null;
  color: "pink" | "red" | "white" | null;
  evidence: Evidence[];
  isWineGrape: boolean;
  origin: string | null;
  pairings: string[];
  regions: { country: string; name: string }[];
  rejected: { field: string; reason: string; value: string }[];
  styles: string[];
  synonyms: string[];
  tannin: Level | null;
} {
  const proposal = (
    typeof proposalInput === "object" && proposalInput !== null ? proposalInput : {}
  ) as Record<string, unknown>;
  const evidence: Evidence[] = [];
  const rejected: { field: string; reason: string; value: string }[] = [];
  const reject = (name: string, value: string, reason: string) =>
    rejected.push({ field: name, reason, value });

  const quoted = (name: string): { quote: string; value: unknown } | null => {
    const entry = field(proposal, name);
    const quote = expandQuote(typeof entry.quote === "string" ? entry.quote : "", article);
    const empty =
      entry.value === undefined ||
      entry.value === "unknown" ||
      entry.value === "" ||
      (Array.isArray(entry.value) && entry.value.length === 0);
    if (empty) return null;
    if (!quoteIsVerbatim(quote, article)) {
      reject(name, JSON.stringify(entry.value), "quote not found in the article");
      return null;
    }
    return { quote, value: entry.value };
  };

  const wine = proposal.is_wine_grape;
  const isWineGrape = !(
    wine === false ||
    (typeof wine === "object" && wine !== null && (wine as Field).value === false)
  );

  let color: "pink" | "red" | "white" | null = null;
  const colorField = quoted("color");
  if (colorField !== null && typeof colorField.value === "string") {
    const wanted = colorField.value as "pink" | "red" | "white";
    // A quote naming both skins ("dark-skinned (Piquepoul noir) and
    // light-skinned (Piquepoul blanc) versions") describes a family, not a
    // colour: Picapoll came out red, and a white Picapoll was set against it.
    const quoteText = normalize(colorField.quote);
    const both = colorWords.red.test(quoteText) && colorWords.white.test(quoteText);
    if (both) reject("color", colorField.value, "quote names more than one skin colour");
    else if (wanted in colorWords && colorWords[wanted].test(quoteText)) {
      color = wanted;
      evidence.push({ field: "color", quote: colorField.quote, value: wanted });
    } else reject("color", colorField.value, "quote does not describe that colour");
  }

  let origin: string | null = null;
  const originField = quoted("origin");
  if (originField !== null && typeof originField.value === "string") {
    const code = originField.value.trim().toUpperCase();
    const country = /^[A-Z]{2}$/.test(code)
      ? new Intl.DisplayNames(["en"], { type: "region" }).of(code)
      : undefined;
    // The quote names the country, or Wikidata independently agrees.
    if (
      country !== undefined &&
      (mentions(originField.quote, country) || wikidataOrigin.includes(code))
    ) {
      origin = code;
      evidence.push({ field: "origin", quote: originField.quote, value: code });
    } else reject("origin", originField.value, "country not named in the quote");
  }

  const level = (name: "acidity" | "body" | "tannin"): Level | null => {
    const entry = quoted(name);
    if (entry === null) return null;
    const value = toLevel(entry.value);
    const quote = normalize(entry.quote);
    if (value !== null && fieldWords[name].test(quote) && levelWords[value].test(quote)) {
      evidence.push({ field: name, quote: entry.quote, value });
      return value;
    }
    reject(name, JSON.stringify(entry.value), "quote does not state that level");
    return null;
  };
  const acidity = level("acidity");
  const tannin = level("tannin");
  const body = level("body");

  const items = (name: string, check: (item: string, quote: string) => boolean): string[] => {
    const entry = quoted(name);
    if (entry === null) return [];
    const kept: string[] = [];
    for (const item of list(entry.value)) {
      if (check(item, entry.quote)) {
        kept.push(item.trim());
        evidence.push({ field: name, quote: entry.quote, value: item.trim() });
      } else reject(name, item, "not in its quote");
    }
    return kept;
  };

  const aromas = items("aromas", (item, quote) => mentions(quote, item));
  const synonyms = items("synonyms", (item, quote) => mentions(quote, item));
  const pairings = items("pairings", (item, quote) => mentions(quote, item));
  const styles = items("styles", (item, quote) => {
    const pattern = styleWords[normalize(item)];
    return pattern !== undefined && pattern.test(normalize(quote));
  }).map((style) => normalize(style));
  const regions = items("regions", (item, quote) => {
    const region = parseRegion(item);
    return region !== null && mentions(quote, region.name);
  }).flatMap((item) => {
    const region = parseRegion(item);
    return region === null ? [] : [region];
  });

  return {
    acidity,
    aromas,
    body,
    color,
    evidence,
    isWineGrape,
    origin,
    pairings,
    regions,
    rejected,
    styles,
    synonyms,
    tannin,
  };
}

/** The first two sentences of a Wikipedia lead, kept short for a card. */
export function summaryOf(lead: string, limit = 420, paragraphs = 1): string | null {
  // An explanation (a style, a method) may run to the lead's later
  // paragraphs; a card's summary keeps to the first.
  const paragraph = clean(lead)
    .split("\n")
    .filter((line) => line.trim().length > 40)
    .slice(0, paragraphs)
    .map((line) => line.trim())
    .join(" ");
  if (paragraph.length === 0) return null;
  // A sentence ends at a full stop after a lowercase word or a figure — not
  // after an abbreviation like "D.O." or "Ca.", which would cut it short.
  const sentences = paragraph.split(/(?<=[a-zß-ÿ0-9)»"]{2}[.!?])\s+(?=[A-ZÀ-ÖØ-Þ¿¡"«(])/);
  let text = "";
  for (const sentence of sentences) {
    if (text.length > 0 && text.length + sentence.length > limit) break;
    text += `${text.length === 0 ? "" : " "}${sentence}`;
  }
  return text.trim();
}
