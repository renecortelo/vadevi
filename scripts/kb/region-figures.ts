/**
 * A wine region's planted area and yearly production, read from the infobox
 * of its Wikipedia article: the value as the article writes it, its year
 * where it gives one, and the line it came from. Only a wine-region infobox
 * counts — a town's has its own area, not its vineyards' — and only a figure
 * with its unit: «vineyards = 96» is a count of growers, not hectares.
 */
export type RegionFigure = {
  /** Hectares, or hectolitres. */
  amount: number;
  /** The infobox line, its references removed. */
  quote: string;
  /** The year the article gives it for, if it gives one. */
  year: string | null;
};

export type RegionFigures = { planted: RegionFigure | null; production: RegionFigure | null };

/** The infoboxes of wine regions, by language, and their fields. */
const fields: Record<
  string,
  { planted: readonly string[]; production: readonly string[]; templates: RegExp }
> = {
  de: {
    planted: ["Bestockte Anbaufläche", "Rebfläche"],
    production: [],
    templates: /\{\{\s*Infobox Wein(?:an)?baugebiet/i,
  },
  en: {
    planted: ["planted", "vineyards"],
    production: ["wine produced"],
    templates: /\{\{\s*Infobox (?:wine region|Italian Wine)/i,
  },
  es: {
    planted: [],
    production: ["producción"],
    templates: /\{\{\s*Ficha de región (?:vitivinícola|de vino)/i,
  },
  fr: {
    planted: ["superficieplantée", "superficie plantée"],
    production: ["volproduction"],
    templates: /\{\{\s*Infobox Région viticole/i,
  },
};

const acre = 0.40468564224;

/** The parameters of the first matching infobox, each value on one line. */
function infobox(wikitext: string, template: RegExp): Map<string, string> | null {
  const start = wikitext.search(template);
  if (start < 0) return null;
  // The infobox ends where its braces close.
  let depth = 0;
  let end = start;
  for (let index = start; index < wikitext.length - 1; index += 1) {
    const pair = wikitext.slice(index, index + 2);
    if (pair === "{{") {
      depth += 1;
      index += 1;
    } else if (pair === "}}") {
      depth -= 1;
      index += 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }
  // Without the infobox's own closing braces.
  const body = wikitext
    .slice(start, end - 2)
    // References and comments say where a value comes from, not what it is.
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  // Split at the infobox's own bars, not at those of the templates and links
  // inside a value ("{{convert|375|ha}}", "[[hectare|ha]]").
  const parameters = new Map<string, string>();
  const parts: string[] = [];
  let level = 0;
  let current = "";
  for (let index = 0; index < body.length; index += 1) {
    const pair = body.slice(index, index + 2);
    if (pair === "{{" || pair === "[[") {
      level += 1;
      current += pair;
      index += 1;
    } else if (pair === "}}" || pair === "]]") {
      level -= 1;
      current += pair;
      index += 1;
    } else if (body[index] === "|" && level === 1) {
      parts.push(current);
      current = "";
    } else current += body[index];
  }
  parts.push(current);
  for (const part of parts.slice(1)) {
    const equals = part.indexOf("=");
    if (equals < 0) continue;
    parameters.set(part.slice(0, equals).trim(), part.slice(equals + 1).trim());
  }
  return parameters;
}

/** A number as a language writes it: "10,500" in English, "29,07" in French. */
function parseNumber(text: string, language: string): number | null {
  const compact = text.replace(/[\s\u00a0\u202f]|&nbsp;/g, "");
  if (language === "en") {
    if (!/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(compact)) return null;
    return Number(compact.replaceAll(",", ""));
  }
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(compact)) return null;
  return Number(compact.replaceAll(".", "").replace(",", "."));
}

/** The figure a value states in the given unit, or null. */
export function readFigure(
  value: string,
  unit: "ha" | "hl",
  language: string,
): Omit<RegionFigure, "quote"> | null {
  const plain = value
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\{\{\s*(?:unité|esd|nobr|formatnum:?)\s*\|?\s*([^}]*)\}\}/gi, "$1")
    .replace(/&nbsp;/g, " ");
  // A range ("3,200 – 3,250 ha") is not one figure.
  if (/\d\s*[–-]\s*\d/.test(plain.replace(/\(.*?\)/g, ""))) return null;
  const convert = /\{\{\s*convert\s*\|\s*([\d.,]+)\s*\|\s*(ha|hl|acres?)\b/i.exec(plain);
  let amount: number | null = null;
  if (convert !== null) {
    const number = Number(convert[1]!.replaceAll(",", ""));
    const given = convert[2]!.toLowerCase();
    if (unit === "ha" && given === "ha") amount = number;
    else if (unit === "ha" && given.startsWith("acre")) amount = Math.round(number * acre);
    else if (unit === "hl" && given === "hl") amount = number;
  } else {
    const pattern =
      unit === "ha"
        ? /^\s*([\d\s.,\u00a0]+?)\s*(?:ha|hectares?|hectáreas?)\b/i
        : /^\s*([\d\s.,\u00a0]+?)\s*(?:hl|hectolit(?:re|er|ro)s?)\b/i;
    const match = pattern.exec(plain);
    if (match !== null) amount = parseNumber(match[1]!, language);
  }
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
  const year = /\((?:en |in )?((?:moyenne )?\d{4}(?:\s*[-–]\s*\d{4})?)\)/.exec(plain)?.[1] ?? null;
  return { amount, year };
}

/**
 * The production an Italian article lists under «Produzione» — «Provincia,
 * stagione, volume in ettolitri», one line per province and season, from the
 * yearly statistics of the 1990s — for its latest season: the provinces' lines
 * for that season, quoted, and their sum. An article without a wine's
 * template («Vino», «Denominazione vino») — a town's, a province's — has no
 * such list to read.
 */
export function italianProduction(wikitext: string): RegionFigure | null {
  if (!/\{\{\s*(?:Denominazione vino|Vino)\s*\n?\|/i.test(wikitext)) return null;
  const heading =
    /==\s*Produzione\s*==\s*\n\s*''Provincia, stagione, volume in \[\[ettolitro\|ettolitri\]\]''/.exec(
      wikitext,
    );
  if (heading === null) return null;
  const section = wikitext.slice(heading.index + heading[0].length).split(/\n==/)[0] ?? "";
  const lines = [
    ...section.matchAll(/^\*\s*([^\n(]+?)\s*\((\d{4}\/\d{2})\)\s*([\d.,]+)\s*$/gm),
  ].map((match) => ({
    amount: parseNumber(match[3]!, "it"),
    line: `${match[1]!.trim()} (${match[2]}) ${match[3]}`,
    season: match[2]!,
  }));
  if (lines.length === 0 || lines.some((line) => line.amount === null)) return null;
  const latest = lines
    .map((line) => line.season)
    .sort()
    .at(-1)!;
  const those = lines.filter((line) => line.season === latest);
  const amount = Math.round(those.reduce((sum, line) => sum + line.amount!, 0));
  if (amount <= 0) return null;
  return { amount, quote: those.map((line) => line.line).join("; "), year: latest };
}

/** The planted area and production a region's article gives, if any. */
export function regionFigures(wikitext: string, language: string): RegionFigures | null {
  if (language === "it") {
    const production = italianProduction(wikitext);
    return production === null ? null : { planted: null, production };
  }
  const spec = fields[language];
  if (spec === undefined) return null;
  const parameters = infobox(wikitext, spec.templates);
  if (parameters === null) return null;
  const first = (names: readonly string[], unit: "ha" | "hl"): RegionFigure | null => {
    for (const name of names) {
      const value = parameters.get(name);
      if (value === undefined || value === "") continue;
      const figure = readFigure(value, unit, language);
      if (figure !== null) return { ...figure, quote: `${name} = ${value}` };
    }
    return null;
  };
  return { planted: first(spec.planted, "ha"), production: first(spec.production, "hl") };
}

export const figureLanguages = [...Object.keys(fields), "it"];
