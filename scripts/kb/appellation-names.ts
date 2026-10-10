/**
 * The atlas's shapes and the pure parts of its build, apart from the script
 * that reads the cache, so the tests and the SQL can use them.
 */

export type RegionEntry = {
  countryCode: string;
  eambrosiaId: string;
  giType: "PDO" | "PGI";
  grapes: { grapeId: string; quote: string; sourceUrl: string }[];
  id: string;
  latitude: number | null;
  legalUrl: string | null;
  longitude: number | null;
  name: string;
  names: { locale: string; name: string; source: "register" | "wikidata" }[];
  /** Where the point comes from; "area" and "place" are approximate. */
  pointSource?: "area" | "item" | "place" | null;
  prominence: number;
  registeredOn: string | null;
  /**
   * What the register's single document says of the wines: the categories of
   * grapevine product (Annex VII numbers) and the main grape varieties as it
   * writes them, each linked to a library grape where one bears that name.
   */
  register?: {
    categories: number[];
    grapes: { grapeId: string | null; name: string }[];
    sourceUrl: string;
  };
  /** `translated`: a faithful translation of the article at `url`. */
  summaries: Record<
    string,
    {
      /** Wikipedia's (CC BY-SA 4.0) unless said: the Official Journal's is the EU's. */
      license?: string;
      text: string;
      translated?: boolean;
      url: string;
    }
  >;
  wikidataId: string | null;
};

/**
 * The names a register entry goes by. Alternatives are written with " / " or
 * ";" ("Mura / Murai"); a name of three or more hyphenated words lists the
 * same place in several languages ("Jerez-Xérès-Sherry"), and each word is a
 * name readers use. Two hyphenated words are one name ("Utiel-Requena").
 */
export function registerNames(protectedName: string): string[] {
  const parts = protectedName
    .split(/\s*[/;]\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const names = new Set(parts);
  for (const part of parts) {
    const words = part.split("-").map((word) => word.trim());
    if (words.length >= 3 && words.every((word) => word.length >= 3)) {
      for (const word of words) names.add(word);
    }
  }
  return [...names];
}

/**
 * A key for matching names across scripts: accents dropped, case folded, and
 * any letter kept — Greek and Cyrillic included. The library's own
 * normalisation keeps only a–z, which turns "Νεμέα" into nothing, and nothing
 * matches everything.
 */
export function matchKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const greek: Record<string, string> = {
  α: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "i",
  θ: "th",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "y",
  φ: "f",
  χ: "ch",
  ψ: "ps",
  ω: "o",
};
const cyrillic: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sht",
  ъ: "a",
  ь: "y",
  ю: "yu",
  я: "ya",
};

/**
 * A Greek or Bulgarian name in Latin letters ("Νεμέα" → "Nemea"), letter by
 * letter: the shape readers type, and a stable id. Latin names lose only
 * their accents.
 */
export function transliterate(name: string): string {
  const plain = name.normalize("NFKD").replace(/\p{M}+/gu, "");
  let result = "";
  for (const character of plain) {
    const lower = character.toLocaleLowerCase("el");
    const latin = greek[lower] ?? cyrillic[lower];
    if (latin === undefined) result += character;
    else result += character === lower ? latin : latin.charAt(0).toUpperCase() + latin.slice(1);
  }
  // "ου" is "ou", not "oy".
  return result.replace(/oy/g, "ou").replace(/Oy/g, "Ou");
}

/**
 * Whether a Wikipedia lead is about wine, rather than the town or river the
 * wine is named for: a matched item may be the place itself.
 */
export function leadIsAboutWine(lead: string): boolean {
  const words = new Set(
    lead
      .normalize("NFKD")
      .replace(/\p{M}+/gu, "")
      .toLocaleLowerCase("en")
      .split(/[^a-z]+/),
  );
  return [
    "wine",
    "wines",
    "vineyard",
    "vineyards",
    "appellation",
    "viticulture",
    "vino",
    "vini",
    "vinos",
    "vinedo",
    "vinedos",
    "denominacion",
    "vi",
    "vins",
    "vinya",
    "vinyes",
    "denominacio",
    "vin",
    "vignoble",
    "vignobles",
    "viticole",
    "wein",
    "weine",
    "weinbau",
    "weinbaugebiet",
    "anbaugebiet",
    "wijn",
    "wijnen",
    "wijnbouw",
    "wijnstreek",
    "vinho",
    "vinhos",
    "vinha",
    "vinhas",
    "denominacao",
    "doc",
    "docg",
    "igt",
    "igp",
    "aoc",
    "aop",
    "dop",
    "pdo",
    "pgi",
  ].some((word) => words.has(word));
}

/**
 * The countries of a register entry as ISO codes. The register writes Greece
 * as "EL" and the United Kingdom as "UK", and a name shared across a border as
 * "be,nl"; the first country is the one the entry is filed under.
 */
export function registerCountries(countryId: string): string[] {
  return countryId
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code))
    .map((code) => (code === "EL" ? "GR" : code === "UK" ? "GB" : code));
}

/** A style or method in the library (`data/kb/topics.json`). */
export type TopicEntry = {
  aliases: { locale: string; name: string }[];
  category: "concept" | "farming" | "kind" | "method";
  id: string;
  names: Record<string, string>;
  prominence: number;
  /** `translated`: a faithful translation of the article at `url`. */
  summaries: Record<
    string,
    {
      /** Wikipedia's (CC BY-SA 4.0) unless said: the Official Journal's is the EU's. */
      license?: string;
      text: string;
      translated?: boolean;
      url: string;
    }
  >;
  wikidataId: string;
};

/** A picture in the library, with what its licence asks to be shown. */
export type ImageEntry = {
  author: string;
  license: string;
  licenseUrl: string | null;
  path: string;
  sourceUrl: string;
};
