/**
 * The opening of a registered wine name's "link with the geographical area",
 * read from its single document as the Official Journal publishes it.
 *
 * The section tells, in the Union's own words, where the wine comes from and
 * why it is as it is — the land, the climate, the people — and the Journal
 * publishes it in every official language, translated by the Union itself.
 * Its first paragraphs, whole sentences only, make the summary of a name no
 * encyclopedia describes. Nothing is reworded: a paragraph is taken as it
 * stands, or not at all.
 */

export const journalLanguages = {
  de: "deu",
  en: "eng",
  es: "spa",
  fr: "fra",
  it: "ita",
  nl: "nld",
  "pt-PT": "por",
} as const;
export type JournalLocale = keyof typeof journalLanguages;

/**
 * The section's heading, numbered, as each language words it — with the
 * variants the Journal has used over the years ("Lien avec l’aire
 * géographique", "Beschrijving van het (de) verband(en)").
 */
const headings: Record<JournalLocale, RegExp> = {
  de: /^\s*\d{1,2}\.\s+(Beschreibung des Zusammenhangs|Zusammenhang mit dem geografischen)/i,
  en: /^\s*\d{1,2}\.\s+(Description of the link|Link with the geographical area)/i,
  // "Descripción del (de los) vino(s)" is another section: the link's word, or nothing.
  es: /^\s*\d{1,2}\.\s+(Descripci[oó]n de[^\n]{0,16}v[ií]nculo|V[ií]nculo con la zona)/i,
  fr: /^\s*\d{1,2}\.\s+(Description du ou des liens?|Description du lien|Lien avec l[’']aire|Lien avec la zone)/i,
  it: /^\s*\d{1,2}\.\s+(Descrizione del legame|Legame con la zona)/i,
  nl: /^\s*\d{1,2}\.\s+(Beschrijving van het( \(de\))? verband|Verband met het geografische)/i,
  "pt-PT": /^\s*\d{1,2}\.\s+(Descrição da\(s\) relaç|Descrição da relaç|Relação com a área)/i,
};

/** A line of prose, not a heading: long, and ending as a sentence does. */
function isProse(line: string): boolean {
  return line.length >= 120 && /[.!?»"”)]$/.test(line);
}

/** Up to `limit` characters, ending at the end of a sentence. */
function wholeSentences(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\u00a0"));
  return end > 0 ? cut.slice(0, end + 1) : "";
}

export function linkSummary(text: string, locale: JournalLocale): string | null {
  const lines = text.split("\n").map((line) => line.replace(/\s+/g, " ").trim());
  // The last such heading: in a communication of an amendment, the list of
  // changes comes first and may name the link too; the single document,
  // with the link as it now reads, comes after it.
  const start = lines.findLastIndex((line) => headings[locale].test(line));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  // The next numbered section ends the link.
  const end = rest.findIndex((line) => /^\d{1,2}\.\s+\S/.test(line));
  return openingOf(
    rest.slice(0, end === -1 ? undefined : end).map((line) => ({ heading: false, text: line })),
  );
}

/**
 * The link's opening: its first paragraphs of prose, whole sentences only,
 * from the section's lines in order. A heading, or a short line, before them
 * is passed over; one after them starts another part, and ends the opening.
 */
export function openingOf(lines: readonly { heading: boolean; text: string }[]): string | null {
  const paragraphs: string[] = [];
  for (const { heading, text } of lines) {
    if (heading || !isProse(text)) {
      if (paragraphs.length > 0 && text.length > 0) break;
      continue;
    }
    // "The link … applies to the 'wine' and 'wine of overripe grapes'
    // categories" says what the link covers, not what the land is like.
    if (text.length < 320 && /categor|kategor|κατηγορ|категор/i.test(text)) continue;
    paragraphs.push(text);
    if (paragraphs.join(" ").length >= 320 || paragraphs.length === 3) break;
  }
  const summary = wholeSentences(paragraphs.join(" "), 900);
  return summary.length >= 120 ? summary : null;
}
