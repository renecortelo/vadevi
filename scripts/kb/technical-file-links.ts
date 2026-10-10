import { openingOf, upToSentenceEnd } from "./register-links";

/**
 * The opening of a registered wine name's "link with the geographical area",
 * read from its technical file in the EU register — the single document as
 * the Member State filed it, in its own language. Names protected before 2011
 * have no other: their single document was never published in the Official
 * Journal, so the Union never translated it.
 *
 * The register's PDF is a form: the template's labels are set in one face
 * (Times New Roman) and what the applicant wrote in another (Arial), in every
 * language. The link is the form's seventh section. So the section is found,
 * and its text told from the form's, by the page's layout, not by any
 * language's words. Nothing is reworded: a paragraph is taken as it stands,
 * or not at all.
 *
 * The text is read from Ghostscript's character-level XML (`txtwrite` with
 * `-dTextFormat=1`): its plain-text output cuts long lines short.
 */

export type FileLine = Readonly<{
  font: string;
  page: number;
  size: number;
  text: string;
  /** Left and right edges, and the baseline, in points. */
  x: number;
  x1: number;
  y: number;
}>;

const entities: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) =>
    code.startsWith("#x") || code.startsWith("#X")
      ? String.fromCodePoint(Number.parseInt(code.slice(2), 16))
      : code.startsWith("#")
        ? String.fromCodePoint(Number(code.slice(1)))
        : (entities[code] ?? whole),
  );
}

type Char = { c: string; x: number };
type RawLine = { -readonly [Key in Exclude<keyof FileLine, "text">]: FileLine[Key] } & {
  chars: Char[];
};

/** Each line of the document, with the face, size and place it is set in. */
export function fileLines(xml: string): FileLine[] {
  const pages: RawLine[][] = xml.split("<page").map((page, index) =>
    [...page.matchAll(/<line>([\s\S]*?)<\/line>/g)].flatMap(([, line]) => {
      const spans = [
        ...line!.matchAll(/<span bbox="([^"]*)" font="([^"]*)" size="([^"]*)">([\s\S]*?)<\/span>/g),
      ];
      const first = spans[0];
      const last = spans.at(-1);
      if (first === undefined || last === undefined) return [];
      const chars = spans.flatMap(([, , , , content]) =>
        [...content!.matchAll(/<char bbox="([^"]*)" c="([^"]*)"\/>/g)].map(([, box, c]) => ({
          c: decode(c!),
          x: Number(box!.split(" ")[0]),
        })),
      );
      const [x, y] = first[1]!.split(" ").map(Number);
      return [
        {
          chars,
          // "DMRTBE+ArialMT-Identity-H" is ArialMT.
          font: first[2]!.replace(/^[A-Z]{6}\+/, "").replace(/-Identity-[HV]$/, ""),
          page: index,
          size: Math.round(Number(first[3]) * 10) / 10,
          x: x!,
          x1: Number(last[1]!.split(" ")[2]),
          y: y!,
        },
      ];
    }),
  );
  // One printed line can come out in pieces, each taken for a line: a piece
  // on the same baseline, going on where the one before it stops, joins it.
  for (const lines of pages) {
    for (let index = lines.length - 1; index > 0; index -= 1) {
      const before = lines[index - 1]!;
      const piece = lines[index]!;
      if (
        piece.font === before.font &&
        Math.abs(piece.y - before.y) < 1.5 &&
        piece.x >= before.x1 - 2 &&
        piece.x - before.x1 < piece.size * 2
      ) {
        const gap = piece.x - before.x1 > piece.size * 0.2 ? [{ c: " ", x: before.x1 }] : [];
        before.chars = [...before.chars, ...gap, ...piece.chars];
        before.x1 = piece.x1;
        lines.splice(index, 1);
      }
    }
  }
  // A superscript ("21ου", "20ο", "1er") is set smaller and a little higher,
  // so it comes out as a line of its own: it goes back into the line it
  // belongs to, where it stands.
  for (const lines of pages) {
    for (const small of [...lines]) {
      const host = lines.find(
        (line) =>
          line !== small &&
          // Smaller, or a piece of a few letters raised above the line.
          (small.size < line.size * 0.8
            ? Math.abs(line.y - small.y) < line.size * 0.8
            : small.chars.length <= 3 &&
              line.chars.length > small.chars.length &&
              line.y - small.y > 0 &&
              line.y - small.y < line.size * 0.7) &&
          small.x >= line.x - 1 &&
          small.x <= line.x1 + 1,
      );
      if (host === undefined) continue;
      // It follows the letter or digit it is raised from ("20ο έως"), even
      // where the text layer sets it a little further on ("30 ,ο με", or past
      // the next word's first letter: "10 έοως"). A number just before it is
      // the one it is raised from.
      const before = (char: Char) => char.x <= small.x + 1;
      const number = host.chars.findLastIndex(
        (char) => /\p{N}/u.test(char.c) && before(char) && small.x - char.x <= host.size * 2,
      );
      const at =
        number !== -1
          ? number
          : host.chars.findLastIndex((char) => /[\p{L}\p{N}]/u.test(char.c) && before(char));
      let rest = host.chars.slice(at + 1);
      const next = rest.findIndex((char) => char.c !== " ");
      if (next > 0 && /[,.;:]/.test(rest[next]!.c)) rest = rest.slice(next);
      host.chars = [...host.chars.slice(0, at + 1), ...small.chars, ...rest];
      host.x1 = Math.max(host.x1, small.x1);
      lines.splice(lines.indexOf(small), 1);
    }
  }
  return pages.flat().map(({ chars, ...line }) => ({
    ...line,
    text: chars.map((char) => char.c).join(""),
  }));
}

/** The form's own words: its labels, set in Times New Roman at 13 points or more. */
const isForm = (line: FileLine) => line.font.startsWith("TimesNewRoman") && line.size >= 13;
const sectionHeading = /^\s*\d{1,2}\.\s+\S/;

/**
 * The link's opening, from the lines of a technical file, or null where the
 * file has no such section or too little prose in it.
 *
 * The register has filed it in two forms. In the one with the larger
 * headings, the link is the seventh section; in the other (the single
 * document as laid down in 2019, the name and the kind of indication its
 * first two sections), it is the eighth, after the main grapes.
 */
export function technicalFileLink(lines: readonly FileLine[]): string | null {
  const headings = lines.filter((line) => isForm(line) && sectionHeading.test(line.text));
  const size = Math.max(...headings.map((line) => line.size));
  const number = size >= 15 ? "7" : "8";
  const heading = headings.find(
    (line) => line.size === size && line.text.trim().startsWith(`${number}.`),
  );
  if (heading === undefined) return null;
  const start = lines.indexOf(heading);
  // The next section's heading, in the same face and size, ends it.
  const end = lines.findIndex(
    (line, index) =>
      index > start && isForm(line) && line.size === size && sectionHeading.test(line.text),
  );
  // The page's running head and foot: the file's title, number, date and folio.
  const folios = lines.filter((line) => /^\s*\d+ ?\/ ?\d+\s*$/.test(line.text));
  const section = lines
    .slice(start + 1, end === -1 ? undefined : end)
    .filter(
      (line) =>
        line.y >= 50 &&
        !line.font.startsWith("Helvetica") &&
        !folios.some((folio) => folio.page === line.page && Math.abs(folio.y - line.y) < 3),
    );
  const written = section.filter((line) => !isForm(line));
  // Where a full line ends: a paragraph's last line stops short of it.
  const right = Math.max(...written.map((line) => line.x1));

  const blocks: { heading: boolean; text: string }[] = [];
  let paragraph = "";
  let previous: FileLine | null = null;
  let previousText = "";
  const close = () => {
    if (paragraph.length > 0) blocks.push({ heading: false, text: paragraph });
    paragraph = "";
  };
  for (const line of section) {
    const text = line.text.replace(/\s+/g, " ").trim();
    // A label the form failed to translate ("label.newWineName…").
    if (text.length === 0 || /^label\.\S+$/.test(text)) continue;
    if (isForm(line)) {
      close();
      blocks.push({ heading: true, text });
      previous = null;
      continue;
    }
    if (previous !== null) {
      const spacing = line.size * 2.2;
      // A sentence's end on a line that stops short of the margin ends the
      // paragraph. Lines are wrapped raggedly in some files, so a line with
      // no full stop ends one only when it is a title of its own — well short
      // of the margin, with a new start after it ("1) Fattori naturali…",
      // "α. Ποιότητα").
      const width = right - line.x;
      const ended = /[.!?:;»"”)]$/.test(paragraph)
        ? previous.x1 < right - Math.max(30, width / 6)
        : /^[\p{Lu}\p{N}\-–•(«"“]/u.test(text) &&
          (previous.x1 < line.x + width * 0.6 ||
            // A one-line title with a list's mark: "a) - Description des facteurs…".
            (paragraph === previousText && /^([\p{L}\p{N}]{1,2}[.)]|[-–•])\s/u.test(paragraph)));
      const apart = line.page === previous.page && line.y - previous.y > spacing;
      if (ended || apart) close();
    }
    // A line that ends in a hyphen goes on with the next, as one word.
    paragraph =
      paragraph.length === 0
        ? text
        : /\p{L}-$/u.test(paragraph)
          ? `${paragraph}${text}`
          : `${paragraph} ${text}`;
    previous = line;
    previousText = text;
  }
  close();
  // A last sentence left without its full stop is left out; the rest stands.
  return openingOf(
    blocks.map((block) => {
      if (block.heading) return block;
      // A title with a list's mark, run in at the start ("Α. Ιστορικός δεσμός.
      // Η αμπελοκαλλιέργεια…") or left at the end ("… Β. Πολιτιστικός δεσμός.").
      block = {
        ...block,
        text: block.text
          .replace(/^([\p{L}\p{N}]{1,2}[.)]|[-–•])\s+[^.!?]{1,90}[.!?]\s+(?=\p{Lu})/u, "")
          .replace(/(?<=[.!?])\s+\p{Lu}[.)]\s+[^.!?()]{1,90}[.!?]?$/u, ""),
      };
      // A paragraph that begins mid-sentence is not an opening.
      if (/^\p{Ll}/u.test(block.text)) return { ...block, heading: true };
      if (/[.!?»"”)]$/.test(block.text)) return block;
      const whole = upToSentenceEnd(block.text);
      return whole.length === 0 ? block : { ...block, text: whole };
    }),
  );
}
