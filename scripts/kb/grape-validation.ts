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
/** From dry to sweet: the wines a grape makes, as a range ("dry to sweet"). */
export type Sweetness = "dry" | "medium" | "sweet";
export type SweetnessRange = { from: Sweetness; to: Sweetness };
export type Evidence = {
  field: string;
  quote: string;
  value: string; /** The article the quote is from, when not the grape's English one. */
  sourceUrl?: string;
  /**
   * The place whose wine the quote describes, where it is not the variety
   * everywhere: a single-variety DOC's wine, or the wine of the region where
   * nearly all of the grape grows. Its atlas entry, where it is one.
   */
  place?: string;
  placeId?: string;
};

export type GrapeEntry = {
  acidity: Level | null;
  /** The alcohol its wines typically reach, as its sources state it. */
  alcohol: Level | null;
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
  /** Dry, off-dry or sweet — a range where its sources give one. */
  sweetness: SweetnessRange | null;
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
  // Chinese and Japanese leave no spaces between words: there, ten characters.
  const substantial = (piece: string) =>
    piece.split(" ").length >= 4 ||
    (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(piece) && piece.length >= 10);
  if (!pieces.some(substantial)) return false;
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

/**
 * The words a level is stated in, in English and in the languages a grape's
 * own article may be read in — Spanish, Catalan, French, Italian, Portuguese
 * and German — accents set aside, as `normalize` leaves them.
 */
export const levelWords: Record<Level, RegExp> = {
  high: /\b(high|higher|highly|full|full-bodied|pronounced|pronunciad[ao]s?|bracing|firm|robust|powerful|heavy|plenty of|marked|considerable|alta|alto|altas|altos|elevad[ao]s?|elevat[ao]?s?|alts?|elevee?s?|haute?s?|fortes?|potentes?|puissante?s?|robust[ao]s?|ricc[ao]|hoch|hohe[nr]?|kraftige?|vollmundige?|plen[ao]s?|corpulent[ao]s?|marcad[ao]s?|marcat[ao]|gran|grandes?|much[ao]s?|importantes?|korperreiche?|notevol[ei]|rics?|abondante?s?|abundante?s?|corsee?s?|charpentee?s?|encorpad[ao]s?|vollen?|viel(e[nrs]?)?|rich|riches?|richesse|noticeable|notables?|molt[ae]?s?|markante?[nrs]?|(tannin|extrakt|korper|saure|alkohol)reich[a-z]*|[a-z]*herbe[nr]?|[a-z]*betonte[nr]?|magas|magasabb|eros|testes|bogat[aei]?|ridicat[aei]?|visok[aeiou]?|visoki[hm]?|vysok[a-z]*|vyss[a-z]*|pesant[ei]|alkoholstark[a-z]*|alcooliques?|alcoholicos?|alcolic[io]|acides?|acidos?|acid[io]|tanniques?|tanicos?|tannic[io]|hoog|hoge|hogere|krachtige?|stevige?|volle|hog[at]?|fyllig[at]?|kraftig[at]?|høy[et]?|høj[et]?|fyldig[et]?|korkea[a-z]*|taytelai[a-z]*|yuksek|altua|pun(a|e|i|im|o|og)?|plny|plna|plne|wysok[a-z]*|pełn[a-z]*)\b|высок|повышенн|значительн|полнотел|насыщенн|висок|підвищен|повишен|плътн|повнотіл|насичен|υψηλ|πλουσι|εντον|მაღალ|(?<![\u0590-\u05ff])(?:מלא|חזק|גבוה)|(?<![а-яё])пун(?:о|ог|а|е|и|им)?(?![а-яё])|高い|高め|豊か|強い|フルボディ|較高|较高|很高|浓郁|濃郁|饱满|飽滿|丰厚|豐厚/,
  low: /\b(low|lower|light|light-bodied|soft|lacks?|lacking|little|thin|mild|mildly|subtle|gentle|baj[ao]s?|bass[ao]|baix(a|os|es)?|faibles?|liger[ao]s?|legger[ao]|legere?s?|ligeir[ao]s?|leves?|lleugera?|suaves?|suau|morbid[ao]|souples?|niedrig(e[mnrs]?)?|leichte[rn]?|manquant|manque|pas assez|peu|weiche[nr]?|fehlt|escas[ao]s?|poc[ao]?s?|scars[ao]|pouc[ao]|geringe[mnrs]?|pauvres?|wenig|(saure|tannin|alkohol|korper)arm[a-z]*|alacsony|konnyu|keves|nizak|nisk[a-z]*|nizk[a-z]*|lagan[aio]?|lahk[a-z]*|lehk[a-z]*|lekk[a-z]*|scazut[aei]?|redus[aei]?|slab[a-z]*|nizs[a-z]*|chud[a-z]*|laag|lage|lagere|weinig|lichte?|zachte?|lag[at]?|latt[a]?|mjuk[a]?|lav[et]?|lett[e]?|matala[a-z]*|alhai[a-z]*|dusuk|baxua)\b|низк|невысок|невисок|невелик|мягк|легк|низьк|ниск|(?<![а-яё])лек(а|о|и|ото)?(?![а-яё])|м.як|χαμηλ|ελαφρ|დაბალ|მსუბუქ|(?<![\u0590-\u05ff])קל(?![\u0590-\u05ff])|低い|低め|少な|穏やか|軽い|ライトボディ|較低|较低|清淡|轻盈|輕盈/,
  medium:
    /\b(medium|moderate|moderately|medium-bodied|average|medi[ao]|mediana|moyenne?|moyennement|mediamente|moderee?|moderad[ao]|moderadamente|moderat[ao]?|mediocremente|mitjana?|mittel|mittlere[mnr]?|mittelschwere[nr]?|kozepes|umeren[a-z]*|gemiddelde?|matige?|medel|mellan|middels|mellem|keskitas[a-z]*|keski[a-z]*|orta|ertain[a-z]*|srednj[a-z]*|stredn[a-z]*|sredni[a-z]*|mediu|medie)\b|средн|умеренн|середн|помірн|умерен|μετρι|μεσαι|საშუალო|中程度|ミディアム|中等|適度|适中|適中/,
};

export const fieldWords: Record<"acidity" | "alcohol" | "body" | "tannin", RegExp> = {
  acidity:
    /acid|saure|кислот|киселин|\bsav(tartalm[a-z]*|ass[a-z]*|as|asabb|ak|a|ai[a-z]*)?\b|kiselin|kislin|kysel|kwas|aciditat|οξυτητ|მჟავ|zuur|\bsyr(a|lig[a-z]*|ahalt|or)\b|\bsyre|happo|hapo|asid|asit|azido|חומצ|酸/,
  alcohol:
    /alcohol|alkohol|alcool|alcol|graduaci|spiritos|алкогол|алкохол|спирт|αλκοολ|ალკოჰოლ|\balkol|アルコール|酒精/,
  body: /bod(y|ied)|weight|mittelschwer|structure|cuerpo|corps|corpo|\bcos\b|korper|struttur|estructur|estrutur|struktur|\bcorsee?s?\b|charpentee?s?|encorpad[ao]s?|тел[оа]|телесн|полнотел|структур|\btestes[a-z]*|\btestu\b|\btijel[a-z]*|\btel(o|a|esa|esn[a-z]*)\b|\bcorp(ul)?\b|ciał|тяло|тіл|σωμα|სხეულ|structuur|corpus|kropp|\bkrop\b|fyld|runko|govde|gorputz|ボディ|骨格|酒体|酒體|גוף/,
  tannin:
    /tann?in|tannic|tanic|tannique|gerbstoff|танин|танін|дубильн|csersav|cserzoanyag|garbnik|trislovin|τανιν|ταννιν|ტანინ|\btanen|タンニン|渋|单宁|單寧/,
};

/**
 * The words a wine's sweetness is stated in: dry, off-dry, sweet — and the
 * sweet wines named by how they are made (late harvest, noble rot, passito).
 */
const sweetnessWords: Record<Sweetness, RegExp> = {
  dry: /\b(dry|seco|secos|seca|secas|sec|secs|seche|seches|trocken[a-z]*|secco|secchi|secca|secche|asciutt[oaie]|szaraz|suh[aoie]?|suv[aoi]?|seci|seaca|such[aey]|suche|wytrawn[a-z]*|droge?|torr[at]?|tørr?[et]?|kuiva[a-z]*|sek|lehor[a-z]*)\b|(?<![а-яёіїє])сух|ξηρ|მშრალ|辛口|干型|干白|干红|乾型/,
  medium:
    /\b(off-dry|slightly[- ]sweet|ligeramente dulces?|leggermente dolc[ei]|l[ée]g[èe]rement (doux|douce)|leicht s(ü|ue)(ss|ß)e?|medium[- ](sweet|dry)|semi-?(sweet|dry)|semi-?seco|semi-?dulce|demi-sec|halbtrocken|halbsu(ss|ß)[a-z]*|lieblich|feinherb|abboccato|amabile|meio-seco|felszaraz|feledes|polusuh[a-z]*|polsuh[a-z]*|polsuch[a-z]*|polosuch[a-z]*|połwytrawn[a-z]*|połsłodk[a-z]*|demisec[a-z]*|demidulc[a-z]*|halfdroog|halfzoet|halvtorr[at]?|halvsot[a]?|halvtørr?[et]?|puolikuiva[a-z]*|puolimakea[a-z]*)\b|полусух|полусладк|напівсух|напівсолодк|ημιξηρ|ημιγλυκ|やや甘口|半甘口|半辛口|半干|半甜/,
  sweet:
    /\b(sweet|sweeter|dessert|late[- ]harvest|botryti[sz]ed|noble rot|dulce|dulces|doux|douce|liquoreux|liquoreuse|moelleux|su(ss|ß)[a-z]*|edelsu[a-z]*|dolce|dolci|passito|doce|doces|licoroso|vendanges? tardives?|vendimia tardia|podredumbre noble|pourriture noble|edes|slatk[a-z]*|sladk[a-z]*|dulc[ei]|słodk[a-z]*|desertn[a-z]*|zoete?|dessertwijn[a-z]*|sot[a]?|søte?|søde?|dessertvin[a-z]*|makea[a-z]*|tatl[ıi]|gozo[a-z]*)\b|(?<![а-яёіїє])сладк|солодк|десертн|ликерн|γλυκ|ტკბილ|甘口|甜型|甜酒|デザートワイン|貴腐/,
};

function toSweetness(value: unknown): SweetnessRange | null {
  if (typeof value !== "string") return null;
  const ends = normalize(value)
    .split(/\s*(?:-|to|–)\s*/)
    .map((end) => (["dry", "medium", "sweet"].includes(end) ? (end as Sweetness) : null));
  if (ends.length === 0 || ends.length > 2 || ends.some((end) => end === null)) return null;
  const order = ["dry", "medium", "sweet"];
  const sorted = (ends as Sweetness[]).sort(
    (one, other) => order.indexOf(one) - order.indexOf(other),
  );
  return { from: sorted[0]!, to: sorted.at(-1)! };
}

/** A country's name as English articles still write it, where it has changed. */
const formerNames: Record<string, string[]> = {
  CZ: ["Czech Republic"],
  MK: ["Macedonia"],
  TR: ["Turkey"],
};

/**
 * How an article in any of the library's languages may say a country, for an
 * origin read by hand: the country's own name (in English and in the
 * article's language), its adjective («autóctona española», «di origine
 * spagnola»), or a region that lies wholly within it («autòctona de
 * Catalunya», «originaire du Languedoc»). Written as `normalize` writes text.
 */
const countryWords: Readonly<Record<string, readonly string[]>> = {
  BG: ["bulgaro", "bulgara", "bulgare", "bulgarisch", "bulgarische", "bulgaars", "bulgarian"],
  ES: [
    "espanol",
    "espanola",
    "espanyol",
    "espanyola",
    "espagnol",
    "espagnole",
    "spanisch",
    "spanische",
    "spanischen",
    "spagnolo",
    "spagnola",
    "spaans",
    "spaanse",
    "espanhol",
    "espanhola",
    "spanish",
    "catalunya",
    "cataluna",
    "catalonia",
    "catalogne",
    "katalonien",
    "catalogna",
    "galicia",
    "galice",
    "galizien",
    "galizia",
    "galicia",
    "andalucia",
    "andalusia",
    "andalousie",
    "andalusien",
    "rioja",
  ],
  FR: [
    "frances",
    "francesa",
    "francais",
    "francaise",
    "franzosisch",
    "franzosische",
    "francese",
    "frans",
    "franse",
    "french",
    "languedoc",
    "charentes",
    "burgundy",
    "bourgogne",
    "burgund",
    "borgogna",
    "alsace",
    "elsass",
    "alsazia",
    "angers",
  ],
  GB: ["uk", "british", "britanico", "britannique", "britisch", "britannico", "brits"],
  GR: [
    "griego",
    "griega",
    "grec",
    "grecque",
    "griechisch",
    "griechische",
    "greco",
    "greca",
    "grieks",
    "grego",
    "grega",
    "greek",
  ],
  IT: [
    "italiano",
    "italiana",
    "italien",
    "italienne",
    "italienisch",
    "italienische",
    "italiaans",
    "italian",
    "sicilia",
    "sicily",
    "sicile",
    "sizilien",
    "siciliano",
    "siciliana",
    "sardegna",
    "sardinia",
    "trentino",
    "toscana",
    "tuscany",
    "toscane",
    "piemonte",
    "piedmont",
    "piemont",
  ],
  PT: [
    "portugues",
    "portuguesa",
    "portugais",
    "portugaise",
    "portugiesisch",
    "portugiesische",
    "portoghese",
    "portugees",
    "portuguese",
    "douro",
  ],
  US: [
    "american",
    "americano",
    "americain",
    "amerikanisch",
    "california",
    "californie",
    "kalifornien",
  ],
};

/**
 * The beginnings of a country's words where an article's language declines
 * them — «z Włoch», «z Hiszpanii», «автохтонним іспанським сортом», «на
 * острове Мадейра» — or writes them in another script: a word of the quote
 * that starts so names the country. Each a country's name, its adjective or a
 * region wholly within it, as `normalize` writes it.
 */
const countryStems: Readonly<Record<string, readonly string[]>> = {
  BA: ["hercegovin", "герцеговин"],
  ES: [
    "hiszpan",
    "spanel",
    "spanyol",
    "spanjolsk",
    "испан",
    "іспан",
    "канарск",
    "канарськ",
    "андалус",
  ],
  FR: [
    "proven",
    "lengadoc",
    "franci",
    "frant",
    "francouz",
    "francusk",
    "франц",
    "бургунд",
    "burgundi",
    "burgundsk",
  ],
  GE: ["georgi", "грузи", "грузин", "кахет", "საქართველ", "კახეთ"],
  HU: ["hongaar", "hungar", "magyar", "madar", "wegier", "венгер", "угорськ", "унгар"],
  IT: [
    "italiaans",
    "italiensk",
    "italialai",
    "włoch",
    "włosk",
    "italsk",
    "olasz",
    "talijansk",
    "итал",
    "італ",
    "пьемонт",
    "кампани",
    "кампані",
    "умбри",
    "венето",
  ],
  PT: ["bairrad", "portugal", "portugalsk", "португал", "мадеир", "madeir"],
};

/** The quote says the country, in the article's language or in English. */
export function originNamed(quote: string, code: string, lang: string): boolean {
  const body = ` ${normalize(quote).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  if ((countryStems[code] ?? []).some((stem) => body.includes(` ${stem}`))) return true;
  const names = [
    ...new Set(
      [lang, "en"].flatMap((language) => {
        const name = new Intl.DisplayNames([language], { type: "region" }).of(code);
        return name === undefined || name === code ? [] : [name];
      }),
    ),
    ...(formerNames[code] ?? []),
    ...(countryWords[code] ?? []),
  ];
  return names.some((name) =>
    body.includes(
      ` ${normalize(name)
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()} `,
    ),
  );
}

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
  pink: /\b(grey|gray|pink|gris|rose|rosy|copper|fleischfarben)|розов|сер[оы]/,
  red: /\b(black|red|dark|blue|purple|noir|nero|nera|nere|tinto|tinta|negra|rouge)|schwarz|черн|красн|темно-син/,
  white: /\b(white|green|yellow|golden|blanc|bianco|blanco|weiss|weiß)|бел[аоыи]|зелен|желт/,
};

const styleWords: Record<string, RegExp> = {
  blending:
    /blend|mezcla|coupage|assembla|uvaggio|taglio|\blote|cupatge|ensambla|mistura|verschnitt|cuvee|купаж|ассамбляж|смес/,
  fortified:
    /fortif|port\b|sherry|madeira|marsala|vins? doux|generos|liquoros|porto\b|jerez|portwein|крепл|портвеин/,
  rose: /\bros(e|es|ado|ados|ato|ati|at|ats)\b|blush|rosewein|розов/,
  sparkling:
    /sparkl|champagne|cava|prosecco|cremant|sekt|spumant|petillant|frizzant|mousseu|espumos|espumant|escumos|schaumwein|игрист|шампанск/,
  // Still wine is what a wine grape makes unless it is only ever sparkling or
  // fortified, so any sentence about the wines made from it supports it.
  still:
    /\b(still|table wine|varietal|wines?|vinos?|vins?|vini|vinhos?|vi|weine?|wijn|wijnen)\b|вин(?:[оаы]|ам|ами|ах|ом)?(?![а-я])|столов/,
  sweet:
    /sweet|dessert|botryti|noble rot|late.harvest|ice ?wine|passito|vin santo|tokaj|dulce|dolce|\bdoce|\bdoux|\bdolc|moelleux|liquoreux|vendimia tardia|vendanges tardives|suss|suß|recioto|appassiment|\bzoet|сладк|десертн/,
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
  alcohol: Level | null;
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
  sweetness: SweetnessRange | null;
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
    // English articles still write some countries by an older name.
    const names = country === undefined ? [] : [country, ...(formerNames[code] ?? [])];
    if (
      country !== undefined &&
      (names.some((name) => mentions(originField.quote, name)) || wikidataOrigin.includes(code))
    ) {
      origin = code;
      evidence.push({ field: "origin", quote: originField.quote, value: code });
    } else reject("origin", originField.value, "country not named in the quote");
  }

  const level = (name: "acidity" | "alcohol" | "body" | "tannin"): Level | null => {
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
  const alcohol = level("alcohol");
  // Each end of the range in the quote: "both dry and sweet wines".
  const sweetnessEntry = quoted("sweetness");
  let sweetness: SweetnessRange | null = null;
  if (sweetnessEntry !== null) {
    const range = toSweetness(sweetnessEntry.value);
    // "süß" ends in a letter a regular expression does not count as one.
    const quote = normalize(sweetnessEntry.quote).replaceAll("ß", "ss");
    if (
      range !== null &&
      sweetnessWords[range.from].test(quote) &&
      sweetnessWords[range.to].test(quote)
    ) {
      sweetness = range;
      evidence.push({
        field: "sweetness",
        quote: sweetnessEntry.quote,
        value: range.from === range.to ? range.from : `${range.from}-${range.to}`,
      });
    } else reject("sweetness", JSON.stringify(sweetnessEntry.value), "quote does not state it");
  }

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

  // An article in another language names an aroma in its own words; the
  // proposal gives the library's English term with the word the article uses
  // (`words`: {"plum": "ciruela"}), and it is that word the quote must hold.
  const wordsOf = (name: string): Record<string, string> => {
    const words = (field(proposal, name) as { words?: unknown }).words;
    return typeof words === "object" && words !== null ? (words as Record<string, string>) : {};
  };
  const aromaWords = wordsOf("aromas");
  const pairingWords = wordsOf("pairings");
  // A place, too, is named in the article's script: "Kakheti" is "Кахетии".
  const regionWords = wordsOf("regions");
  const aromas = items("aromas", (item, quote) => mentions(quote, aromaWords[item] ?? item));
  const synonyms = items("synonyms", (item, quote) => mentions(quote, item));
  const pairings = items("pairings", (item, quote) => mentions(quote, pairingWords[item] ?? item));
  const styles = items("styles", (item, quote) => {
    const pattern = styleWords[normalize(item)];
    return pattern !== undefined && pattern.test(normalize(quote));
  }).map((style) => normalize(style));
  const regions = items("regions", (item, quote) => {
    const region = parseRegion(item);
    return region !== null && mentions(quote, regionWords[item] ?? region.name);
  }).flatMap((item) => {
    const region = parseRegion(item);
    return region === null ? [] : [region];
  });

  return {
    acidity,
    alcohol,
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
    sweetness,
    synonyms,
    tannin,
  };
}

/** The first two sentences of a Wikipedia lead, kept short for a card. */
export function summaryOf(lead: string, limit = 420, paragraphs = 1): string | null {
  // An explanation (a style, a method) may run to the lead's later
  // paragraphs; a card's summary keeps to the first.
  // A web-archive note the extract keeps from a citation ("Bodega Mustiguillo
  // Archived 2015-07-03 at the Wayback Machine.") is not the article's text.
  const paragraph = clean(lead)
    .replace(/\s*Archived \d{4}-\d{2}-\d{2} at the Wayback Machine/g, "")
    .split("\n")
    .filter((line) => line.trim().length > 40)
    .slice(0, paragraphs)
    .map((line) => line.trim())
    .join(" ");
  if (paragraph.length === 0) return null;
  // A sentence ends at a full stop after a lowercase word or a figure — not
  // after an abbreviation like "D.O." or "Ca.", which would cut it short.
  // A reference left glued to the text ("Colombard.«Colombard». Vitis
  // International Variety Catalogue.") is split off as a sentence of its own.
  const sentences = paragraph.split(
    /(?<=[a-zß-ÿ0-9)»"]{2}[.!?])\s+(?=[A-ZÀ-ÖØ-Þ¿¡"«(])|(?<=[a-zß-ÿ]{2}\.)(?=«)/,
  );
  const kept: string[] = [];
  for (const sentence of sentences) {
    const length = kept.join(" ").length;
    if (kept.length > 0 && length + sentence.length > limit) break;
    kept.push(sentence.trim());
  }
  // A lead that ends mid-sentence ("common grapes in the"), on a sentence
  // introducing a list it no longer has ("the following cantons:"), or on a
  // citation ("Consultado em 21 de maio"), ends at the sentence before. A
  // sentence that merely lacks its full stop is kept.
  while (kept.length > 1 && unfinished(kept[kept.length - 1]!)) kept.pop();
  return kept.join(" ").trim();
}

const trailingWords = new Set([
  "a",
  "al",
  "an",
  "and",
  "da",
  "das",
  "de",
  "dei",
  "del",
  "della",
  "der",
  "des",
  "di",
  "die",
  "do",
  "du",
  "e",
  "el",
  "en",
  "et",
  "het",
  "i",
  "in",
  "la",
  "le",
  "les",
  "lo",
  "o",
  "of",
  "on",
  "the",
  "to",
  "un",
  "una",
  "und",
  "van",
  "y",
]);

function unfinished(sentence: string): boolean {
  const trimmed = sentence.trim();
  // A colon announcing a list, a comma or semicolon the lead was cut at, or
  // a bare quoted title left from a reference.
  if (/[:,;]$/.test(trimmed) || /^«[^»]+»\.?$/.test(trimmed)) return true;
  if (
    /\b(Consultado (em|el)|Retrieved|Abgerufen am|Consulté le|Consultato il|Variety Catalogue)\b/.test(
      trimmed,
    )
  ) {
    return true;
  }
  // A quotation opened and never closed: the lead was cut in the middle of it.
  // German opens with „ and closes with “, which opens an English quotation.
  const count = (pattern: RegExp) => trimmed.match(pattern)?.length ?? 0;
  if (
    count(/"/g) % 2 === 1 ||
    count(/“/g) > count(/”/g) + count(/„/g) ||
    count(/«/g) > count(/»/g)
  ) {
    return true;
  }
  const last = trimmed.split(/\s+/).pop()?.toLowerCase() ?? "";
  return trailingWords.has(last);
}
