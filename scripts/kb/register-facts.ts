/**
 * What a registered wine name's technical file says of its wines, read from
 * the text: the categories of grapevine product it may be, and its main grape
 * varieties as the register writes them.
 *
 * Both are standard in every member state's file. The categories carry the
 * numbers of Annex VII, Part II of Regulation (EU) No 1308/2013 ("1. Wine",
 * "4. Sparkling wine", "15. Wine from raisined grapes") whatever the language
 * the file is written in, so the number is read and the language is not. The
 * grape varieties are listed one to a line under a heading every language
 * words differently ("VITIGNI PRINCIPALI", "Inventaire des principaux
 * cépages", "Απογραφή κύριων οινοποιήσιμων ποικιλιών"…); the names are kept
 * as written there, cleaned only of the register's own marks (colour codes,
 * "(OIV)", asterisks).
 *
 * Nothing here is translated or inferred: a file that cannot be read gives
 * nothing rather than a guess.
 */

/** Annex VII, Part II categories a wine name can cover. */
export const wineCategories = [1, 3, 4, 5, 6, 7, 8, 9, 15, 16] as const;
export type WineCategory = (typeof wineCategories)[number];

const categoryHeading =
  /(CAT[ÉE]GORIES DE PRODUITS|CATEGORIE DI PRODOTTI|ΚΑΤΗΓΟΡ[ΊΙ]ΕΣ ΑΜΠΕΛΟΟΙΝΙΚ|KATEGORIEN VON WEINBAU|КАТЕГОРИИ ЛОЗАРО|CATEGOR[ÍI]AS DE PRODUCTOS|CATEGORII DE PRODUSE|CATEGORIA DE PRODUTOS|SZŐLŐBŐL KÉSZÜLT TERMÉKEK KATEGÓRIÁI|CATEGORIEËN VAN WIJNBOUW|KATEGORIJE PROIZVOD|KATEGÓRIE VINÁRSKYCH|KATEGORIE VINAŘSKÝCH|KATEGORIER AF VINAVL|CATEGORIES OF GRAPEVINE|Categories of grapevine|KATEGORIJE VINSKIH|KATEGORIJI TA)/;

/** The heading of the main-varieties inventory, in the older file format. */
const inventoryHeading =
  /\n\s*a\.\s*(Απογραφή|Списък на основните|Inventar der|Inventarul|Inventaris van|Popis osnovnih|Inventário das|Inventaire des|Inventario de|Inventario dei|Elenco dei|Inventory of|Fortegnelse|Seznam|Soupis|Zoznam|Az? (fő|legfontosabb)|Inventari|Lista|Popis glavnih)[^\n]*\n/;

/** The heading of the main varieties, in the newer format and the Official Journal. */
const varietiesHeading =
  /(VITIGNI PRINCIPALI|UVE DA VINO PRINCIPALI|PRINCIPALES UVAS|C[ÉE]PAGES PRINCIPAUX|ΚΎΡΙΑ ΟΙΝΟΠΟΙΉΣΙΜΑ|ΚΥΡΙΑ ΟΙΝΟΠΟΙΗΣΙΜΑ|WICHTIGSTE KELTERTRAUBEN|FONTOSABB BORSZŐLŐFAJT|HLAVNÍ MOŠTOVÉ ODRŮDY|HLAVNÉ MUŠTOVÉ|PRINCIPAIS UVAS|PRIMÆRE DRUESORTER|ОСНОВ[ЕНИ]+ ВИН[ЕНИ]+ СОРТ|SOIURI PRINCIPALE|GLAVNE SORTE|VOORNAAMSTE|BELANGRIJKSTE|Main wine grape|MAIN WINE GRAPE|PRINCIPALI SOIURI)/;

/** Page furniture repeated on every page of a technical file. */
function isPageFurniture(line: string): boolean {
  return /(FICHE TECHNIQUE|SCHEDA TECNICA|FICHA T[ÉE]CNICA|ΤΕΧΝΙΚ|TECHNISCHE|TECHNICAL FILE|ТЕХНИЧЕСКО|FIȘA TEHNIC|FICHEIRO|MŰSZAKI|TECHNICKÁ|TEHNIČN|Número|Numéro|Numero|Aktenzeichen|Αριθμός|^\s*\d+\s*\/\s*\d+\s*$)/.test(
    line,
  );
}

function plain(text: string): string {
  return (
    text
      .replace(/[ \t\u00a0]+/g, " ")
      // The Official Journal sets a list number on a line of its own: "1.\nWine".
      .replace(/(\n ?\d{1,2}\.) ?\n ?/g, "$1 ")
  );
}

/** The categories the file lists, by their Annex VII number. */
export function registerCategories(text: string): WineCategory[] {
  const source = plain(text);
  const heading = categoryHeading.exec(source);
  if (heading === null) return [];
  const found = new Set<WineCategory>();
  // In the Official Journal the list runs on one line: "1. Wine 15. Wine…".
  const block = source.slice(heading.index + heading[0].length, heading.index + 1_500);
  for (const line of block.split("\n").slice(1)) {
    const trimmed = line.trim();
    if (trimmed === "" || isPageFurniture(trimmed)) continue;
    const entries = [
      ...trimmed.matchAll(/(?:^|\s)(\d{1,2})\.\s+([^\d]{2,70}?)(?=\s+\d{1,2}\.\s|$)/g),
    ];
    const categories = entries
      .map((entry) => Number(entry[1]))
      .filter((number): number is WineCategory =>
        (wineCategories as readonly number[]).includes(number),
      );
    // A line that is not a category (the next section's heading, written in
    // capitals or longer than any category's name) ends the list.
    if (
      categories.length === 0 ||
      // The next section, "Description of the wine(s)", in any language.
      /(descri|beschreib|περιγραφ|описани|leírás|popis|beskriv|omschrijving|opis)/iu.test(
        trimmed,
      ) ||
      entries.some((entry) => /\p{Lu}{6,}/u.test(entry[2]!) && !/\p{Ll}/u.test(entry[2]!))
    )
      break;
    for (const category of categories) found.add(category);
  }
  return [...found].sort((left, right) => left - right);
}

/**
 * One line of a varieties list as the variety's name: the first of its names
 * (the Official Journal adds synonyms after a dash, Spanish files after a
 * comma), without the OIV colour code ("N", "B", "Rs"), the "(OIV)" or
 * "(MAIN)" marks or list asterisks; a name written in capitals is set in
 * title case. Null for a line that is not a name.
 */
export function registerGrapeName(line: string): string | null {
  let name = line
    .replace(/^\s*[*•·-]+\s*/, "")
    // Inventory numbers: "06. CABERNET SAUVIGNON", "15 Траминер".
    .replace(/^\d{1,2}\.?\s+(?=\p{L})/u, "")
    .replace(/\((MAIN|OIV|OTHER)\)/gi, "")
    // Czech files: "Ryzlink rýnský (syn. Rheinriesling)", sometimes unclosed.
    .replace(/\(syn\..*$/i, "")
    // A parenthesis the line break left open: "Modrý Portugal (Blauer…".
    .replace(/\s*\([^)]*$/, "")
    .split(/\s+[-–]\s+/)[0]!
    .split(",")[0]!
    // Italian files: "Calabrese o Nero d'Avola" — the first name.
    .split(/\s+o\s+/i)[0]!
    .replace(/\s+(B|N|G|Rs|Rg|Gr|R|Bl)\.?\s*$/i, "")
    .replace(/[.,;:]+\s*$/, "")
    .trim();
  if (name.length < 2 || name.length > 45 || /\d/.test(name)) return null;
  if (name.split(/\s+/).length > 5) return null;
  if (!/\p{L}/u.test(name)) return null;
  if (name === name.toUpperCase()) {
    name = name
      .toLowerCase()
      .replace(
        /(^|[\s(-])(\p{L})/gu,
        (_, before: string, letter: string) => before + letter.toUpperCase(),
      )
      // The little words of a name stay small: "Malvasia Bianca di Candia".
      .replace(/(?<=\s)(Di|Del|Della|Dal|De|Du|Da|Do|Dos|Das|La|Le|Von|Van)(?=\s)/g, (word) =>
        word.toLowerCase(),
      )
      .replace(/(?<=\s)D'(\p{L})/gu, (_, letter: string) => `d'${letter.toUpperCase()}`);
  }
  return name;
}

function listedNames(lines: string[]): string[] {
  const names: string[] = [];
  // A heading the page width wrapped: its second line starts in lower case.
  let afterHeading = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "" || isPageFurniture(line)) continue;
    // The next part ("c. Other varieties", a numbered section) ends the list.
    if (/^(c\.\s|[1-9]\.\s|[IVX]+\.\s)/.test(line)) break;
    if (/^b\.\s/.test(line)) {
      afterHeading = true;
      continue;
    }
    if (afterHeading && /^\p{Ll}/u.test(line)) continue;
    afterHeading = false;
    // The Official Journal lists synonyms after a dash on the same line.
    const first = line.split(/\s+[-–]\s+/)[0]!;
    if (first.length > 60 || (/[.:;]$/.test(first) && first.split(/\s+/).length > 4)) {
      if (names.length > 0) break;
      continue;
    }
    const name = registerGrapeName(line);
    if (name !== null && !names.includes(name)) names.push(name);
  }
  return names;
}

/** The main grape varieties the file lists, as it names them. */
export function registerGrapes(text: string): string[] {
  const source = plain(text);
  const inventory = inventoryHeading.exec(source);
  if (inventory !== null) {
    const names = listedNames(
      source
        .slice(inventory.index + inventory[0].length)
        .split("\n")
        .slice(0, 120),
    );
    if (names.length > 0) return names;
  }
  const heading = varietiesHeading.exec(source);
  if (heading === null) return [];
  return listedNames(source.slice(heading.index).split("\n").slice(1, 80));
}
