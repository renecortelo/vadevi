/**
 * The checks every translated summary in the library must pass against the
 * text it translates. Translations are written by hand and read twice; these
 * catch what a second reading can miss:
 *
 * - every number in the original (a year, hectares, a percentage, a grade) is
 *   in the translation, and the translation adds none;
 * - the translation is written in its language: its own common words
 *   outnumber those of the original's language;
 * - its length is in proportion to the original's;
 * - it is not the original copied.
 */

export type Language =
  | "bg"
  | "ca"
  | "cs"
  | "da"
  | "de"
  | "el"
  | "en"
  | "es"
  | "fr"
  | "hr"
  | "hu"
  | "it"
  | "nl"
  | "pt"
  | "ro"
  | "ru"
  | "sk"
  | "sl";

/** Short, frequent words that tell one language from another. */
const commonWords: Record<Language, string[]> = {
  ca: [
    "el",
    "els",
    "la",
    "les",
    "de",
    "del",
    "i",
    "és",
    "amb",
    "per",
    "que",
    "una",
    "un",
    "dels",
    "al",
    "als",
    "en",
    "es",
    "més",
    "aquest",
    "seva",
    "seu",
  ],
  de: [
    "der",
    "die",
    "das",
    "und",
    "ist",
    "mit",
    "von",
    "den",
    "dem",
    "des",
    "ein",
    "eine",
    "wird",
    "im",
    "zu",
    "auf",
    "für",
    "sich",
    "nicht",
    "als",
    "aus",
  ],
  en: [
    "the",
    "and",
    "is",
    "of",
    "in",
    "with",
    "to",
    "a",
    "an",
    "its",
    "for",
    "from",
    "by",
    "it",
    "as",
    "which",
    "are",
    "was",
    "on",
    "that",
  ],
  es: [
    "el",
    "la",
    "los",
    "las",
    "de",
    "del",
    "y",
    "es",
    "con",
    "por",
    "que",
    "una",
    "un",
    "en",
    "se",
    "su",
    "sus",
    "al",
    "más",
    "como",
  ],
  fr: [
    "le",
    "la",
    "les",
    "de",
    "du",
    "des",
    "et",
    "est",
    "avec",
    "pour",
    "que",
    "une",
    "un",
    "en",
    "dans",
    "sur",
    "au",
    "aux",
    "qui",
    "son",
    "sa",
  ],
  it: [
    "il",
    "lo",
    "la",
    "i",
    "gli",
    "le",
    "di",
    "del",
    "della",
    "e",
    "è",
    "con",
    "per",
    "che",
    "una",
    "un",
    "in",
    "nel",
    "nella",
    "dei",
    "da",
  ],
  nl: [
    "de",
    "het",
    "een",
    "en",
    "is",
    "van",
    "met",
    "in",
    "op",
    "voor",
    "die",
    "dat",
    "wordt",
    "zijn",
    "uit",
    "als",
    "door",
    "aan",
    "ook",
  ],
  pt: [
    "o",
    "os",
    "a",
    "as",
    "de",
    "do",
    "da",
    "dos",
    "das",
    "e",
    "é",
    "com",
    "por",
    "que",
    "uma",
    "um",
    "em",
    "no",
    "na",
    "se",
    "mais",
  ],
  ru: ["и", "в", "на", "с", "по", "из", "для", "что", "это", "как", "его", "от", "не"],
  // The originals' languages, where a wine's only article is in its country's.
  bg: ["и", "в", "на", "с", "по", "от", "за", "е", "се", "да", "са", "това", "които", "който"],
  cs: ["a", "je", "v", "ve", "na", "se", "z", "do", "pro", "jako", "který", "která", "jsou", "od"],
  da: ["og", "er", "i", "på", "af", "til", "med", "en", "et", "den", "det", "der", "som", "fra"],
  el: [
    "και",
    "το",
    "η",
    "ο",
    "του",
    "της",
    "των",
    "στην",
    "στο",
    "σε",
    "με",
    "για",
    "από",
    "είναι",
    "που",
    "τα",
    "οι",
  ],
  hr: ["i", "je", "u", "na", "se", "za", "od", "s", "sa", "su", "koji", "koja", "što", "ili", "do"],
  hu: ["a", "az", "és", "egy", "is", "van", "hogy", "ez", "meg", "mint", "vagy", "pedig", "között"],
  ro: [
    "și",
    "de",
    "la",
    "în",
    "cu",
    "pe",
    "din",
    "este",
    "al",
    "ale",
    "care",
    "un",
    "o",
    "pentru",
    "sunt",
  ],
  sk: ["a", "je", "v", "vo", "na", "sa", "z", "do", "pre", "ako", "ktorý", "ktorá", "sú", "od"],
  sl: ["in", "je", "v", "na", "se", "za", "od", "z", "so", "ki", "da", "pa", "ali", "do"],
};

function words(text: string): string[] {
  return text.toLowerCase().match(/\p{L}+/gu) ?? [];
}

/**
 * How many of a language's common words a text uses, counting only those the
 * other language does not share: Catalan and Spanish both write "el", "la",
 * "de", and those tell nothing.
 */
function score(text: string, language: Language, against: Language): number {
  const shared = new Set(commonWords[against]);
  const set = new Set(commonWords[language].filter((word) => !shared.has(word)));
  return words(text).filter((word) => set.has(word)).length;
}

/**
 * The numbers a text states, written the same way whatever the language's
 * separators: "1,470", "1.470" and "1 470" are all 1470; "4,5%" and "4.5%"
 * are both 4.5.
 */
export function numbersIn(text: string): string[] {
  // A century in Roman numerals ("siglo XX", "segle XIX") is the 20th, the
  // 19th: the same number an English or German text writes in digits.
  // Italian and French put the numeral first ("XX secolo", "XIXe siècle").
  const centuries = [
    ...text.matchAll(/\b(?:siglos?|segles?|siècles?|secoli|secolo|séculos?)\s+([IVXL]+)\b/gi),
    ...text.matchAll(/\b([IVXL]+)(?:e|ᵉ)?\s+(?:secolo|secoli|siècles?)\b/g),
  ].map((match) => String(roman(match[1]!.toUpperCase())));
  // An English article spells it out ("the late eighteenth century").
  const ordinals = [
    ...text.matchAll(
      /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty-first)\s+century\b/gi,
    ),
  ].map((match) => String(spelled.indexOf(match[1]!.toLowerCase()) + 1));
  // A date in figures ("03/09/2004", "01/09/97") is its day and its year in a
  // translation that names the month: "3 de septiembre de 2004".
  const dates: string[] = [];
  const rest = text.replace(
    /\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g,
    (_, day: string, __, year: string) => {
      const full =
        year.length === 4 ? Number(year) : Number(year) + (Number(year) > 30 ? 1900 : 2000);
      dates.push(String(Number(day)), String(full));
      return " ";
    },
  );
  // "entre 75 et 80 000 pieds" is 75 000 to 80 000: the first number of a
  // range shares the thousands written after the second.
  const ranged = rest.replace(
    /(?<![\p{L}\d.,]|\d[\s\u00a0\u202f])(\d{1,3})(\s+(?:et|à|a|y|i|e|to|and|bis|tot|en|ou|or|o)\s+\d{1,3}[\s\u00a0\u202f]000)(?!\d)/gu,
    "$1 000$2",
  );
  // A digit written into a unit or formula ("km2", "CO2") is not a figure.
  // A number runs on through "." or "," followed by a digit, and through a
  // space only before exactly three digits ("1 800"): "In 2002, 21,048,500"
  // is two numbers.
  const digits = ranged.match(/(?<!\p{L})\d+(?:[.,]\d+|[\s\u00a0\u202f]\d{3}(?!\d))*/gu) ?? [];
  return [
    ...centuries,
    ...ordinals,
    ...dates,
    ...digits.map((raw) => {
      const compact = raw.replace(/[\s\u00a0\u202f]/g, "");
      // A separator followed by exactly three digits groups thousands;
      // otherwise it marks decimals.
      const grouped = compact.replace(/[.,](?=\d{3}(?:\D|$))/g, "");
      return grouped.replace(",", ".");
    }),
  ].sort();
}

const spelled = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "thirteenth",
  "fourteenth",
  "fifteenth",
  "sixteenth",
  "seventeenth",
  "eighteenth",
  "nineteenth",
  "twentieth",
  "twenty-first",
];

function roman(numeral: string): number {
  const value: Record<string, number> = { I: 1, L: 50, V: 5, X: 10 };
  let total = 0;
  for (let index = 0; index < numeral.length; index += 1) {
    const current = value[numeral[index]!]!;
    const next = value[numeral[index + 1] ?? ""] ?? 0;
    total += current < next ? -current : current;
  }
  return total;
}

function withoutCopiedRuns(target: string, source: string): string {
  const sourceWords = words(source);
  const trigrams = new Set(
    sourceWords
      .slice(2)
      .map((word, index) => `${sourceWords[index]} ${sourceWords[index + 1]} ${word}`),
  );
  const targetWords = words(target);
  const copied = new Set<number>();
  for (let index = 0; index + 2 < targetWords.length; index += 1) {
    const trigram = `${targetWords[index]} ${targetWords[index + 1]} ${targetWords[index + 2]}`;
    if (trigrams.has(trigram)) [index, index + 1, index + 2].forEach((at) => copied.add(at));
  }
  return targetWords.filter((_, index) => !copied.has(index)).join(" ");
}

export type Problem = { message: string };

export function checkTranslation(
  original: { language: Language; text: string },
  translation: { language: Language; text: string },
): Problem[] {
  const problems: Problem[] = [];
  const source = original.text.trim();
  const target = translation.text.trim();
  if (target.length === 0) return [{ message: "empty translation" }];
  if (target === source) problems.push({ message: "identical to the original" });

  const wanted = numbersIn(source);
  const given = numbersIn(target);
  const missing = wanted.filter((number) => !given.includes(number));
  const added = given.filter((number) => !wanted.includes(number));
  if (missing.length > 0) problems.push({ message: `numbers missing: ${missing.join(", ")}` });
  if (added.length > 0) problems.push({ message: `numbers added: ${added.join(", ")}` });

  const ratio = target.length / source.length;
  if (source.length > 60 && (ratio < 0.6 || ratio > 1.7)) {
    problems.push({ message: `length ${ratio.toFixed(2)}× the original's` });
  }

  if (translation.language !== original.language && words(target).length >= 8) {
    // A name or a designation kept in the original's words ("denominazione di
    // origine controllata e garantita") says nothing of the translation's
    // language: runs of three or more words copied from the original are
    // left out of the count.
    const prose = withoutCopiedRuns(target, source);
    const own = score(prose, translation.language, original.language);
    const theirs = score(prose, original.language, translation.language);
    if (own <= theirs) {
      problems.push({
        message: `reads more like ${original.language} (${theirs}) than ${translation.language} (${own})`,
      });
    }
  }
  return problems;
}

/**
 * Which of the given languages a text is written in: the one whose common
 * words it uses most, or null when it uses none of them.
 */
export function languageOf(text: string, among: readonly Language[]): Language | null {
  const textWords = words(text);
  const ranked = among
    .map((language) => {
      const set = new Set(commonWords[language]);
      return { count: textWords.filter((word) => set.has(word)).length, language };
    })
    .sort((left, right) => right.count - left.count);
  return ranked[0] !== undefined && ranked[0].count > 0 ? ranked[0].language : null;
}
