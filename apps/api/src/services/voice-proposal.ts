import { hueLabels } from "../repositories/hue-labels";

/**
 * Voice tastings, step two, the part that trusts nothing: what a model proposes
 * from a transcript becomes a proposal only field by field, and a field only
 * when its value fits the form and the words it came from are in the
 * transcript. A value without those words was not said — it is dropped, never
 * guessed (the library's rule: no fact without its source).
 */

/** The form fields a spoken tasting may fill, and what each accepts. */
export const voiceFields = {
  // The wine, as said: for finding or creating it, never saved on its own.
  producerName: "text",
  wineName: "text",
  vintageYear: "year",
  region: "text",
  countryCode: "country",
  grapes: "list",
  // The contract's own types (`WineTypeSchema`); a sweet wine is told by its
  // sweetness, not a type of its own.
  wineType: ["red", "white", "rose", "sparkling", "fortified", "orange"],
  alcoholAbv: "percent",
  bottleSizeMl: "volume",
  priceAmount: "money",
  currency: "currency",
  // The tasting.
  tastedAt: "date",
  score100: "score",
  sentiment: ["dislike", "neutral", "like"],
  wouldDrinkAgain: ["yes", "no", "unsure"],
  wouldBuy: ["yes", "no", "unsure"],
  appearanceClarity: ["clear", "hazy"],
  appearanceColorFamily: ["white", "rose", "red", "orange", "brown"],
  appearanceIntensity: "scale",
  appearanceHue: "text",
  appearanceText: "text",
  viscosity: "scale",
  aromas: "list",
  noseCondition: ["clean", "possible_fault"],
  noseIntensity: "scale",
  noseText: "text",
  noseSwirledIntensity: "scale",
  noseSwirledText: "text",
  palateText: "text",
  conclusionText: "text",
  sweetness: "scale",
  acidity: "scale",
  tanninLevel: "scale",
  body: "scale",
  finishLength: "scale",
  alcoholPerception: "scale",
  balance: "scale",
  tanninTexture: ["silky", "fine", "grippy", "coarse"],
  palateTexture: ["lean", "round", "creamy", "oily"],
  effervescence: "scale",
  beadSize: ["fine", "medium", "coarse"],
  foodText: "text",
  servingTemperatureC: "temperature",
  decanted: "boolean",
} as const;

export type VoiceField = keyof typeof voiceFields;

export type ProposedField = {
  /** "ambiguous" when the speaker hedged ("I think", "maybe"): offered, not filled. */
  status: "ambiguous" | "explicit";
  /** The transcript's words the value came from. */
  quote: string;
  value: boolean | number | string | string[];
};

export type VoiceProposal = {
  fields: Partial<Record<VoiceField, ProposedField>>;
  /** Proposed values left out, and why — counted, never shown as the reader's words. */
  discarded: {
    field: string;
    reason: "name-overlap" | "no-evidence" | "not-a-field" | "out-of-range" | "second-wine";
  }[];
  /** The speaker described more than one wine: only the first is proposed. */
  severalWines: boolean;
};

/** Text compared without case, accents, punctuation or spacing differences. */
export function comparable(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;

/**
 * The day a tasting was, counted from the words that say it — the model's
 * arithmetic missed by one ("last Saturday" on a Saturday, third batch, 18
 * October 2026). The model finds which words name the tasting's day; this
 * counts back from the reader's own "today". Written as `comparable` writes
 * text. The longer phrases first: "antes de ayer" holds "ayer".
 */
const daysBack: [RegExp, number][] = [
  [
    /\b(anteayer|antes de ayer|abans d ahir|abans dahir|the day before yesterday|avant hier|l altro ieri|ieri l altro|altroieri|vorgestern|eergisteren|anteontem)\b/,
    2,
  ],
  [/\b(ayer|ahir|yesterday|hier|ieri|gestern|gisteren|ontem)\b/, 1],
  [
    /\b(hoy|avui|today|tonight|aujourd hui|ce soir|oggi|stasera|heute|vandaag|hoje|esta noche|aquesta nit)\b/,
    0,
  ],
];
const weekdays: Record<string, number> = {
  domingo: 0,
  diumenge: 0,
  sunday: 0,
  dimanche: 0,
  domenica: 0,
  sonntag: 0,
  zondag: 0,
  lunes: 1,
  dilluns: 1,
  monday: 1,
  lundi: 1,
  lunedi: 1,
  montag: 1,
  maandag: 1,
  martes: 2,
  dimarts: 2,
  tuesday: 2,
  mardi: 2,
  martedi: 2,
  dienstag: 2,
  dinsdag: 2,
  miercoles: 3,
  dimecres: 3,
  wednesday: 3,
  mercredi: 3,
  mercoledi: 3,
  mittwoch: 3,
  woensdag: 3,
  jueves: 4,
  dijous: 4,
  thursday: 4,
  jeudi: 4,
  giovedi: 4,
  donnerstag: 4,
  donderdag: 4,
  viernes: 5,
  divendres: 5,
  friday: 5,
  vendredi: 5,
  venerdi: 5,
  freitag: 5,
  vrijdag: 5,
  sabado: 6,
  dissabte: 6,
  saturday: 6,
  samedi: 6,
  sabato: 6,
  samstag: 6,
  sonnabend: 6,
  zaterdag: 6,
  "segunda feira": 1,
  "terca feira": 2,
  "quarta feira": 3,
  "quinta feira": 4,
  "sexta feira": 5,
};
const counts: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  one: 1,
  um: 1,
  uma: 1,
  een: 1,
  einem: 1,
  einen: 1,
  dos: 2,
  two: 2,
  deux: 2,
  due: 2,
  zwei: 2,
  twee: 2,
  dois: 2,
  duas: 2,
  tres: 3,
  three: 3,
  trois: 3,
  tre: 3,
  drei: 3,
  drie: 3,
  cuatro: 4,
  quatre: 4,
  four: 4,
  quattro: 4,
  vier: 4,
  quatro: 4,
  cinco: 5,
  cinc: 5,
  five: 5,
  cinq: 5,
  cinque: 5,
  funf: 5,
  vijf: 5,
  seis: 6,
  sis: 6,
  six: 6,
  sei: 6,
  sechs: 6,
  zes: 6,
  siete: 7,
  set: 7,
  seven: 7,
  sept: 7,
  sette: 7,
  sieben: 7,
  zeven: 7,
  sete: 7,
};
const agoPhrase =
  /\b(?:hace|fa|il y a|vor|ha)\s+(\w+)\s+(?:dias|dies|jours|tagen|dias)\b|\b(\w+)\s+(?:days ago|giorni fa|dagen geleden|dias atras)\b/;

/**
 * The date the words name, counted back from `today`; null when they name
 * none, or more than one ("I opened it yesterday and taste it today").
 */
export function spokenDay(words: string, today: string): string | null {
  const said = comparable(words);
  const back = (count: number) =>
    new Date(Date.parse(`${today}T12:00:00Z`) - count * 86_400_000).toISOString().slice(0, 10);
  const named = new Set<string>();
  let rest = said;
  for (const [pattern, count] of daysBack) {
    if (pattern.test(rest)) {
      named.add(back(count));
      // "antes de ayer" is not also "ayer".
      rest = rest.replace(new RegExp(pattern.source, "g"), " ");
    }
  }
  const ago = agoPhrase.exec(said);
  const amount = ago === null ? undefined : (ago[1] ?? ago[2]);
  if (amount !== undefined) {
    const count = /^\d+$/.test(amount) ? Number(amount) : counts[amount];
    if (count !== undefined && count >= 0 && count <= 60) named.add(back(count));
  }
  const todayWeekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  for (const [name, weekday] of Object.entries(weekdays)) {
    if (!new RegExp(`\\b${name}\\b`).test(said)) continue;
    // The last such day before today: "last Saturday" on a Saturday is a week ago.
    named.add(back(((todayWeekday - weekday + 6) % 7) + 1));
  }
  return named.size === 1 ? [...named][0]! : null;
}

/**
 * Words that hedge what follows, in the app's languages: a value said after
 * one is offered as a guess, whatever the model marked. Models missed one in
 * three of eight test notes ("Diria que hi ha garnatxa…"). Written as
 * `comparable` writes text: no accents, no hyphens.
 */
const hedges =
  /\b(creo|me parece|diria|crec|em sembla|potser|quizas|quiza|tal vez|i think|maybe|perhaps|probably|i guess|je pense|je crois|peut etre|il me semble|credo|penso|forse|mi sembra|ich glaube|ich denke|vielleicht|wohl|ik denk|misschien|volgens mij|acho|talvez|parece me|suspeito|no se si|no se cuant\w*|no se como|no estoy segur\w*|not sure|i don t know|je ne sais pas|non so|weiss nicht|weet niet|nao sei)\b/;

/**
 * Words that bring in another wine, in the app's languages, as `comparable`
 * writes them: "ahora otro vino", "després passo a", "next wine". Models missed
 * a second wine in two of four test notes (lote 2, 16 October 2026).
 */
// Changing bottles, said as such, was missed in four of eight notes of the
// third batch ("ahora cambio de botella", "je passe maintenant à", "cambio
// vino", "agora mudo de garrafa", 18 October 2026); and "buy another bottle"
// is a purchase, not a second wine.
const anotherWine =
  /(?<!\b(?:buy|buying|purchase|comprar|compraria|comprare|acheter|kaufen|kopen|comprei|compro) )\b(otro vino|segundo vino|siguiente vino|despues paso a|luego paso a|ahora paso a|cambio de botella|cambio de vino|un altre vi|segon vi|despres passo a|ara passo a|canvi d ampolla|canvio d ampolla|canvi de vi|another wine|second wine|next wine|moving on to|switching to|now on to|un autre vin|deuxieme vin|vin suivant|ensuite je passe|je passe maintenant a|je change de bouteille|je change de vin|un altro vino|secondo vino|poi passo a|ora passo a|cambio vino|cambio di vino|cambio bottiglia|cambio di bottiglia|ein anderer wein|zweiter wein|der zweite wein|naechster wein|ich wechsle die flasche|ich wechsle den wein|een andere wijn|tweede wijn|volgende wijn|ik wissel van fles|ik wissel van wijn|outro vinho|segundo vinho|depois passo a|agora passo a|mudo de garrafa|mudo de vinho|a seguir o|otra botella|segunda botella|altra ampolla|segona ampolla|another bottle|a different bottle|different wine|second bottle|autre bouteille|deuxieme bouteille|altra bottiglia|seconda bottiglia|andere flasche|zweite flasche|andere fles|tweede fles|outra garrafa|segunda garrafa)\b/;

/**
 * A choice said in the note's language, read as the form's: models answered
 * `true`, "Yes" or "limpio" for most "would buy" and "would drink again" of
 * the third batch, all out of range (18 October 2026). Keys as `comparable`
 * writes them.
 */
const choiceWords: Partial<Record<VoiceField, Record<string, string>>> = {
  appearanceClarity: {
    brillant: "clear",
    brillante: "clear",
    bright: "clear",
    clean: "clear",
    clear: "clear",
    helder: "clear",
    klar: "clear",
    limpido: "clear",
    limpio: "clear",
    limpo: "clear",
    net: "clear",
    cloudy: "hazy",
    hazy: "hazy",
    torbido: "hazy",
    troebel: "hazy",
    trouble: "hazy",
    trub: "hazy",
    turbio: "hazy",
    turvo: "hazy",
    velado: "hazy",
  },
  palateTexture: {
    cremeux: "creamy",
    cremig: "creamy",
    cremoso: "creamy",
    cremosa: "creamy",
    romig: "creamy",
    maigre: "lean",
    mager: "lean",
    magro: "lean",
    schlank: "lean",
    huileux: "oily",
    olig: "oily",
    oleoso: "oily",
    untuoso: "oily",
    redondo: "round",
    rond: "round",
    rotondo: "round",
    rund: "round",
  },
  wineType: {
    bianco: "white",
    blanc: "white",
    blanco: "white",
    branco: "white",
    weiss: "white",
    weisswein: "white",
    wit: "white",
    rosado: "rose",
    rosato: "rose",
    rosso: "red",
    rot: "red",
    rotwein: "red",
    rouge: "red",
    rood: "red",
    tinto: "red",
  },
};
const ternary: Record<string, string> = {
  false: "no",
  maybe: "unsure",
  nee: "no",
  nein: "no",
  non: "no",
  nao: "no",
  si: "yes",
  sim: "yes",
  true: "yes",
  oui: "yes",
  ja: "yes",
  undecided: "unsure",
};

/** Bubbles said to be absent ("no tiene burbujas", "with no bubbles") are no value. */
/**
 * The level a scale's words say, in the app's languages, as `comparable`
 * writes them: models read German "hoher", "hohem", "hochintensiv" as 5 where
 * the form's "high" is 4 (second batch, 18 October 2026). "Very" raises a
 * high to 5 and lowers a low to 1.
 */
const levelWords: [RegExp, number][] = [
  [
    /\b(low|niedrig\w*|baj[ao]s?|bas|basse|bass[oa]|baix[ao]|laag|lage|feble|poc[ao]?|weinig|light|leicht\w*|liger[ao]|leger|legere|leggero|leggera|licht|lichte|leve|lleuger[ao]?|short|kurz\w*|cort[ao]|court|courte|kort|curt[ao]|suaves?|soft|mild\w*|zacht\w*|mous|souple)\b/,
    2,
  ],
  [
    /\b(medium|mittel\w*|medi[ao]s?|median[ao]s?|moyen\w*|mitja|mitjana|gemiddeld\w*|middel\w*|media)\b/,
    3,
  ],
  [
    /\b(high|hoch\w*|hoh(e|er|em|en|es)|alt[ao]?s?|elevee?s?|eleve|elevat[ao]|hoog|hoge|full|kraftig\w*|voll\w*|plen[ao]|pien[ao]|vol|volle|cheio|corse|ple|long|lang\w*|larg[ao]|lung[ao]|llarg[ao]?|pronounced|pronunciad[ao]|marcad[ao]|intens[ao]?|intense|potent\w*|firm\w*)\b/,
    4,
  ],
];
const very = /\b(very|muy|molt|tres|molto|sehr|zeer|muito|extremely|bien)\s+(\w+)/;
const sweetWords: [RegExp, number][] = [
  [/\b(dry|sec|seca|seco|secco|secca|trocken|droog|brut)\b/, 1],
  [
    /\b(off dry|ligeramente dulce|lleugerament dolc|legerement doux|leggermente dolce|halbtrocken|lieblich|licht zoet|ligeiramente doce|demi sec|semi seco|abboccato)\b/,
    2,
  ],
  [/\b(sweet|dulce|dolc|doux|dolce|suss|zoet|doce|moelleux)\b/, 4],
  [
    /\b(very sweet|muy dulce|molt dolc|tres doux|molto dolce|sehr suss|zeer zoet|muito doce|passito|dessert wine|vino de postre|vin de dessert)\b/,
    5,
  ],
];

/** "Neither dry nor sweet", in the app's languages, as `comparable` writes it. */
const neitherDryNorSweet =
  /\b((?:ni )?(?:tan |muy )?sec[oa] ni (?:tan |muy )?dulce|(?:ni )?(?:tan |muy )?dulce ni (?:tan |muy )?sec[oa]|neither dry nor sweet|ni sec ni doux|ne secco ne dolce|weder trocken noch suss|noch droog noch zoet|nem seco nem doce|ni sec ni dolc)\b/;

/** The level the words say for a scale, or null when they say none or several. */
export function spokenLevel(field: VoiceField, quote: string): number | null {
  const said = comparable(quote);
  const found = new Set<number>();
  // "Ni tan seco ni tan dulce": the middle, not sweet (a real note read it as
  // 4, 19 October 2026).
  if (field === "sweetness" && neitherDryNorSweet.test(said)) return 3;
  if (field === "balance") {
    if (
      /\b(desequilibrad\w*|unbalanced|desequilibre\w*|squilibrat\w*|unausgewogen\w*|onevenwichtig\w*)\b/.test(
        said,
      )
    )
      return 2;
    if (
      !/\b(equilibrad\w*|equilibrat\w*|balanced|equilibre\w*|ausgewogen\w*|evenwichtig\w*|armonic\w*|harmonious)\b/.test(
        said,
      )
    )
      return null;
    if (
      /\b(no|not|nicht|pas|non|niet|nao)\b(?: \w+){0,2} (equilibr|balanced|ausgewogen|evenwichtig)/.test(
        said,
      )
    ) {
      return 2;
    }
    return very.test(said) ? 5 : 4;
  }
  if (field === "sweetness") {
    // "Medium sweet", "three of five": the model's to read.
    if (
      /\b(medium|mittler\w*|medi[ao]|moyen\w*|mitja|gemiddeld\w*|middel\w*|three|drei|trois|tre|tres|drie|3)\b/.test(
        said,
      )
    ) {
      return null;
    }
    for (const [pattern, level] of sweetWords) if (pattern.test(said)) found.add(level);
    // "I said dry, I correct that: slightly sweet" is slightly sweet.
    if (found.has(2)) {
      found.delete(1);
      found.delete(4);
    }
    if (found.has(5)) found.delete(4);
    if (found.has(1) && found.size > 1) found.delete(1);
  } else {
    for (const [pattern, level] of levelWords) {
      const match = pattern.exec(said);
      if (match === null) continue;
      const before = very.exec(said);
      const raised = before !== null && pattern.test(before[2]!);
      found.add(raised ? (level === 4 ? 5 : level === 2 ? 1 : level) : level);
    }
  }
  return found.size === 1 ? [...found][0]! : null;
}

const negation =
  /\b(no|not|without|sin|sans|pas|ohne|kein|keine|senza|nessuna|geen|zonder|sem|nenhuma|still|tranquilo|tranquille|fermo|stil)\b/;

/** Words that say a name is a winery's, in the app's languages. */
const winery =
  /\b(bodega|bodegas|celler|cellers|cava|domaine|domaines|chateau|clos|maison|cave|weingut|winzer|cantina|tenuta|azienda|fattoria|quinta|adega|herdade|casa|winery|wines|estate|vineyards|cellars|wijnhuis|wijngoed|producer|productor|productora|elaborador|elabora|vigneron|produttore|produtor)\b/;

/** Fields that hold the taster's own words: the quote itself, never a paraphrase. */
const ownWords = new Set<VoiceField>([
  "appearanceText",
  "conclusionText",
  "foodText",
  "noseSwirledText",
  "noseText",
  "palateText",
]);

/**
 * The colour families a model names in the note's own language, read as the
 * form's five: it answered "rojo", "rubí", "weiß" for most notes of the second
 * batch, all of them out of range (16 October 2026).
 */
const colourFamilies: Record<string, string> = {
  ambar: "brown",
  amber: "brown",
  ambre: "brown",
  ambra: "brown",
  bernstein: "brown",
  brown: "brown",
  castano: "brown",
  marron: "brown",
  tawny: "brown",
  teja: "brown",
  bianco: "white",
  blanc: "white",
  blanco: "white",
  branco: "white",
  dorado: "white",
  gold: "white",
  golden: "white",
  lemon: "white",
  limon: "white",
  oro: "white",
  paglia: "white",
  paja: "white",
  straw: "white",
  weiss: "white",
  wit: "white",
  yellow: "white",
  amarillo: "white",
  geel: "white",
  gelb: "white",
  jaune: "white",
  naranja: "orange",
  naranjoso: "orange",
  anaranjado: "orange",
  ataronjat: "orange",
  orange: "orange",
  arancione: "orange",
  laranja: "orange",
  taronja: "orange",
  rosa: "rose",
  rosado: "rose",
  rosato: "rose",
  rose: "rose",
  salmon: "rose",
  burgundy: "red",
  cereza: "red",
  garnet: "red",
  granate: "red",
  granato: "red",
  granat: "red",
  negre: "red",
  negro: "red",
  purple: "red",
  red: "red",
  rojo: "red",
  rood: "red",
  rosso: "red",
  rot: "red",
  rouge: "red",
  ruby: "red",
  rubi: "red",
  rubino: "red",
  tinto: "red",
  vermelho: "red",
  vermell: "red",
  violet: "red",
};

/** A value as the form takes it, or null when it does not fit. */
function fit(field: VoiceField, raw: unknown, today: string): ProposedField["value"] | null {
  const kind = voiceFields[field];
  const text =
    typeof raw === "string"
      ? raw.trim()
      : typeof raw === "number" || typeof raw === "boolean"
        ? String(raw)
        : "";
  if (Array.isArray(kind)) {
    const options = kind as readonly string[];
    if (options.includes(text)) return text;
    const plain = comparable(text);
    if (options.includes(plain)) return plain;
    if (options.includes("unsure") && ternary[plain] !== undefined) return ternary[plain]!;
    const word = plain.split(" ").find((part) => choiceWords[field]?.[part] !== undefined);
    if (word !== undefined) return choiceWords[field]![word]!;
    // A colour named in the note's language, by its first word ("rojo rubí").
    if (field === "appearanceColorFamily") {
      for (const word of comparable(text).split(" ")) {
        if (colourFamilies[word] !== undefined) return colourFamilies[word]!;
      }
    }
    return null;
  }
  switch (kind) {
    case "text":
      return text.length > 0 && text.length <= 2_000 ? text : null;
    case "list": {
      const items = (Array.isArray(raw) ? raw : text.split(/\s*[,;]\s*/))
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0 && item.length <= 80);
      return items.length > 0 && items.length <= 12 ? items : null;
    }
    case "year": {
      const year = Number(text);
      const now = Number(today.slice(0, 4));
      return Number.isInteger(year) && year >= 1900 && year <= now ? year : null;
    }
    case "country":
      return /^[A-Z]{2}$/.test(text) ? text : null;
    case "currency":
      return /^[A-Z]{3}$/.test(text) ? text : null;
    case "money": {
      const value = Number(text.replace(",", "."));
      return value > 0 && value <= 100_000 ? Math.round(value * 100) / 100 : null;
    }
    case "volume": {
      const value = Number(text);
      return Number.isInteger(value) && value >= 50 && value <= 20_000 ? value : null;
    }
    case "percent": {
      const value = Number(text.replace(",", "."));
      return value >= 3 && value <= 25 ? Math.round(value * 10) / 10 : null;
    }
    case "score": {
      const value = Number(text);
      return Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
    }
    case "scale": {
      const value = Number(text);
      return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
    }
    case "temperature": {
      const value = Number(text.replace(",", "."));
      return value >= -2 && value <= 30 ? Math.round(value * 10) / 10 : null;
    }
    case "boolean":
      return text === "true" ? true : text === "false" ? false : null;
    case "date": {
      // A tasting from today or the recent past; never the future.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) return null;
      const before = days(text, today);
      return before >= 0 && before <= 60 ? text : null;
    }
  }
  return null;
}

/**
 * The proposal a model's answer makes, checked against the form and the
 * transcript. `raw` is whatever the model returned; nothing in it is trusted.
 */
export function acceptProposal(raw: unknown, transcript: string, today: string): VoiceProposal {
  const proposal: VoiceProposal = { discarded: [], fields: {}, severalWines: false };
  if (typeof raw !== "object" || raw === null) return proposal;
  const answer = raw as { fields?: unknown; wineCount?: unknown };
  proposal.severalWines = typeof answer.wineCount === "number" && answer.wineCount > 1;
  const heard = ` ${comparable(transcript)} `;
  // Where a second wine begins, if one does: what is said after it is that
  // wine's, never the first's (two bottles' grapes must not mix).
  const second = anotherWine.exec(heard);
  const secondAt = second === null || second.index < 20 ? null : second.index;
  if (secondAt !== null) proposal.severalWines = true;
  for (const item of Array.isArray(answer.fields) ? answer.fields.slice(0, 60) : []) {
    if (typeof item !== "object" || item === null) continue;
    const { certain, name, quote, value } = item as Record<string, unknown>;
    if (typeof name !== "string" || !(name in voiceFields)) {
      proposal.discarded.push({ field: String(name).slice(0, 40), reason: "not-a-field" });
      continue;
    }
    const field = name as VoiceField;
    // The words must have been said: the quote, as heard, in the transcript.
    const words = typeof quote === "string" ? comparable(quote) : "";
    if (words.length < 2 || !heard.includes(` ${words} `)) {
      proposal.discarded.push({ field, reason: "no-evidence" });
      continue;
    }
    // A sentence of the taster's is kept in their words and language: models
    // translated or paraphrased them (an Italian note came back in English).
    if (secondAt !== null && heard.indexOf(` ${words} `) > secondAt) {
      proposal.discarded.push({ field, reason: "second-wine" });
      continue;
    }
    const fitted = fit(field, ownWords.has(field) ? quote : value, today);
    if (
      fitted === null ||
      ((field === "effervescence" || field === "beadSize") && negation.test(words))
    ) {
      proposal.discarded.push({ field, reason: "out-of-range" });
      continue;
    }
    // The first proposal of a field stands; a model repeating one adds nothing.
    // The taster's own sentence is theirs to keep as said, doubts and all:
    // a hedge inside it ("tal vez algo de flor") is part of the words, so it
    // fills its field — a real nose note was left out for one (19 October 2026).
    proposal.fields[field] ??= {
      quote: (quote as string).trim().slice(0, 300),
      status:
        !ownWords.has(field) && (certain === false || hedges.test(comparable(quote as string)))
          ? "ambiguous"
          : "explicit",
      value: fitted,
    };
  }
  // A wine said to be dry or sweet, when the model left its sweetness out
  // (it did for nine of twenty notes of the second batch): the sentence that
  // says it, of the first wine, not negated.
  if (proposal.fields.sweetness === undefined) {
    const firstWine = secondAt === null ? transcript : transcript.slice(0, secondAt);
    for (const sentence of firstWine.split(/(?<=[.;!?:])\s+/)) {
      const words = comparable(sentence);
      if (!sweetWords.some(([pattern]) => pattern.test(words))) continue;
      if (/\b(no|not|nicht|kein\w*|pas|non|niet|nao|ni)\b/.test(words)) continue;
      const level = spokenLevel("sweetness", sentence);
      if (level === null) continue;
      proposal.fields.sweetness = {
        quote: sentence.trim().slice(0, 300),
        status: hedges.test(words) ? "ambiguous" : "explicit",
        value: level,
      };
      break;
    }
  }
  // A level the words say plainly is the words', not the model's arithmetic.
  for (const field of [
    "sweetness",
    "acidity",
    "tanninLevel",
    "body",
    "finishLength",
    "appearanceIntensity",
    "viscosity",
    "noseIntensity",
    "noseSwirledIntensity",
    "alcoholPerception",
    "balance",
  ] as const) {
    const said = proposal.fields[field];
    if (said === undefined) continue;
    const level = spokenLevel(field, said.quote);
    if (level !== null) said.value = level;
  }
  // The tasting's day, counted from the words the model found for it.
  const tasted = proposal.fields.tastedAt;
  if (tasted !== undefined) {
    const day = spokenDay(tasted.quote, today);
    if (day !== null) tasted.value = day;
  }
  // A name must have been said: the model answered "local region" for "de
  // aquí de la zona" (a real note, 18 October 2026). Half its words heard is
  // enough, so a name the model spelled right ("Ribeira" for "Ribera") stays.
  for (const field of ["producerName", "wineName", "region"] as const) {
    const said = proposal.fields[field];
    if (said === undefined) continue;
    const words = comparable(String(said.value))
      .split(" ")
      .filter((word) => word.length > 2);
    if (
      words.length > 0 &&
      words.filter((word) => heard.includes(` ${word}`)).length * 2 < words.length
    ) {
      delete proposal.fields[field];
      proposal.discarded.push({ field, reason: "no-evidence" });
    }
  }
  // A bottle's size only from a size that was said, not from "la botella".
  const bottle = proposal.fields.bottleSizeMl;
  if (
    bottle !== undefined &&
    !/\d|magnum|media|halbe|mezza|demi|meia|litro|liter|litre|cl|ml|jeroboam/.test(
      comparable(bottle.quote),
    )
  ) {
    delete proposal.fields.bottleSizeMl;
    proposal.discarded.push({ field: "bottleSizeMl", reason: "no-evidence" });
  }
  readWhatTheModelMissed(proposal, transcript, secondAt === null ? transcript : null);
  // What was said of the nose and the mouth, in the taster's own words, when
  // the model gave the aromas and the levels but not the sentences — it left
  // them out in both real notes of 18 October 2026.
  const aromas = proposal.fields.aromas;
  if (proposal.fields.noseText === undefined && aromas !== undefined) {
    proposal.fields.noseText = { quote: aromas.quote, status: aromas.status, value: aromas.quote };
  }
  const mouth = (
    ["sweetness", "acidity", "tanninLevel", "body", "finishLength", "palateTexture"] as const
  )
    .map((field) => proposal.fields[field])
    .filter((field): field is ProposedField => field !== undefined);
  if (proposal.fields.palateText === undefined && mouth.length > 0) {
    const quotes = [...new Set(mouth.map((field) => field.quote.trim()))];
    proposal.fields.palateText = {
      quote: quotes.join(". "),
      status: mouth.every((field) => field.status === "explicit") ? "explicit" : "ambiguous",
      value: quotes.join(". ").slice(0, 2_000),
    };
  }
  // A score of nought is only a nought that was said: models turned "no
  // score yet" into 0 (lote 2, 16 October 2026).
  const score = proposal.fields.score100;
  if (
    score?.value === 0 &&
    !/\b(0|zero|cero|zero|null|nul|nulla)\b/.test(comparable(score.quote))
  ) {
    delete proposal.fields.score100;
    proposal.discarded.push({ field: "score100", reason: "no-evidence" });
  }
  // A producer is a winery or a maker, said as one. A lone given name ("Laia",
  // "Tosca") is far more often who brought the bottle: offered, not filled.
  const maker = proposal.fields.producerName;
  if (
    maker !== undefined &&
    !/\s/.test(String(maker.value).trim()) &&
    !winery.test(comparable(maker.quote))
  ) {
    maker.status = "ambiguous";
  }
  // A producer heard inside the wine's own name ("Patio de Lucía" → "Lucía",
  // "Alina's High Path") is a reading of the name, not a producer that was
  // said: models made it in two of four test notes on 16 October 2026.
  const producer = proposal.fields.producerName;
  const wine = proposal.fields.wineName;
  if (producer !== undefined && wine !== undefined) {
    const [a, b] = [comparable(String(producer.value)), comparable(String(wine.value))];
    if (a.includes(b) || b.includes(a)) {
      delete proposal.fields.producerName;
      proposal.discarded.push({ field: "producerName", reason: "name-overlap" });
    }
  }
  return proposal;
}

/** Every name of each colour, as `comparable` writes it, the longest first. */
const hueNames = Object.entries(hueLabels)
  .flatMap(([code, labels]) => labels.map((label) => ({ code, label, said: comparable(label) })))
  .sort((left, right) => right.said.length - left.said.length);
/** Colours of one kind of wine only: their family follows from them. */
const hueFamily: Record<string, string> = {
  amber: "brown",
  brick: "red",
  brown: "brown",
  garnet: "red",
  gold: "white",
  mahogany: "brown",
  pale_pink: "rose",
  purple: "red",
  raspberry: "rose",
  ruby: "red",
  salmon: "rose",
  straw: "white",
  tawny: "red",
  yellow: "white",
};
const colourWord =
  /\b(color|colour|couleur|colore|farbe|kleur|cor|tono|tonalidad|tonalitat|tinte)\b/;
/** Swirling the glass, said as such: what follows is the swirled nose. */
const swirled =
  /\b(al remover|al moverlo|al mover la copa|tras remover|despues de remover|removiendo|al agitar|after swirling|when swirled|once swirled|swirling|en remenar|despres de remenar|en agitant|apres agitation|dopo averlo ruotato|ruotando|nach dem schwenken|geschwenkt|na het walsen|na walsen|ao agitar|depois de agitar)\b/;
/** The mouth begins: the swirled nose ends there. */
const toTheMouth =
  /\b(en boca|en la boca|de boca|al probarlo|(?:luego |ahora )?vamos a probarlo|lo pruebo|in the mouth|on the palate|tasting it|en bouche|in bocca|im mund|am gaumen|in de mond|na boca|al paladar)\b/;
/** A taster tasting, before the wine's name: "estoy probando X, de la bodega Y". */
const tastingVerb =
  /\b(?:estoy probando|probando|estoy tomando|tomando|estoy catando|catando|estoy bebiendo|bebiendo|i m tasting|tasting|i m drinking|drinking|je goute|je deguste|sto assaggiando|sto bevendo|ich probiere|ich trinke|ik proef|ik drink|estou a provar|estou provando|estic tastant|tastant)\s+(?:un |una |el |la |le |il |lo |o |a |the |an |een |ein |eine )?/;
const genericWine =
  /^(?:vino|vinito|vi|wine|vin|wein|wijn|vinho|tinto|blanco|rosado|negre|blanc|este|esto|this|ce|questo|dieses|deze|este vinho)(?: \w+)?$/;

/**
 * What the model left out of plain words, read from the transcript itself,
 * where a field is still empty: a colour named, the swirled nose, the wine's
 * name said before its producer. Each from the words that say it, kept as
 * said (two real notes of 19 October 2026 lost all three).
 */
function readWhatTheModelMissed(
  proposal: VoiceProposal,
  transcript: string,
  /** The transcript of the first wine alone, when there is only one. */
  oneWine: string | null,
): void {
  if (oneWine === null) return;
  const sentences = oneWine
    .split(/(?<=[.;!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
  // A colour named where the colour is spoken of: the hue, and its family
  // when the hue belongs to one kind of wine only.
  const said = proposal.fields.appearanceHue;
  const saidHue =
    said === undefined
      ? undefined
      : hueNames.find((name) => ` ${comparable(said.quote)} `.includes(` ${name.said} `));
  if (said !== undefined && saidHue !== undefined) said.value = saidHue.label;
  if (said === undefined) {
    for (const sentence of sentences) {
      const words = ` ${comparable(sentence)} `;
      if (!colourWord.test(words)) continue;
      const hue = hueNames.find((name) => words.includes(` ${name.said} `));
      if (hue === undefined) continue;
      proposal.fields.appearanceHue = {
        quote: sentence.slice(0, 300),
        status: hedges.test(words) ? "ambiguous" : "explicit",
        value: hue.label,
      };
      break;
    }
  }
  const hue = proposal.fields.appearanceHue;
  if (proposal.fields.appearanceColorFamily === undefined && hue !== undefined) {
    const words = comparable(hue.quote).split(" ");
    const named = words.map((word) => colourFamilies[word]).find((family) => family !== undefined);
    const code = hueNames.find((name) => name.label === hue.value)?.code;
    const family = named ?? (code === undefined ? undefined : hueFamily[code]);
    if (family !== undefined) {
      proposal.fields.appearanceColorFamily = {
        quote: hue.quote,
        status: hue.status,
        value: family,
      };
    }
  }
  // The swirled nose: from the words that say the glass was swirled to where
  // the mouth begins, in the taster's words.
  if (proposal.fields.noseSwirledText === undefined) {
    const heard = comparable(oneWine);
    const at = swirled.exec(heard);
    if (at !== null) {
      // Back to the transcript's own characters: the same words, unfolded.
      const start = findSaid(oneWine, at[0]);
      if (start >= 0) {
        const rest = oneWine.slice(start);
        const end = rest.search(/[.;!?]/);
        let text = end < 0 ? rest : rest.slice(0, end);
        const mouth = toTheMouth.exec(comparable(text));
        if (mouth !== null) {
          const cut = findSaid(text, mouth[0]);
          if (cut > 0) text = text.slice(0, cut);
        }
        text = text.trim().replace(/[,\s]+$/, "");
        if (text.split(/\s+/).length >= 3) {
          proposal.fields.noseSwirledText = {
            quote: text.slice(0, 300),
            status: "explicit",
            value: text.slice(0, 2_000),
          };
        }
      }
    }
  }
  // Tears, warmth and balance, read from the words around them: "la lágrima
  // mediana", "se siente un poco de alcohol", "creo que está muy equilibrado".
  levelAround(
    proposal,
    "viscosity",
    oneWine,
    /^(lagrima\w*|llagrim\w*|tears|legs|larmes|lacrim\w*|tranen|lagrimas|viscos\w*)$/,
    [1, 3],
  );
  levelAround(proposal, "alcoholPerception", oneWine, /^(alcohol|alcool|alkohol)$/, [4, 2]);
  levelAround(
    proposal,
    "balance",
    oneWine,
    /^(equilibrad\w*|equilibrat\w*|balanced|equilibre\w*|ausgewogen\w*|evenwichtig\w*|desequilibrad\w*|unbalanced)$/,
    [4, 1],
  );
  // The wine's name, said between the tasting and its producer: "estoy
  // probando Monte Alto, que es de la bodega Pinar".
  const maker = proposal.fields.producerName;
  if (proposal.fields.wineName === undefined && maker !== undefined) {
    const heard = comparable(transcript);
    const verb = tastingVerb.exec(heard);
    const makerAt = heard.indexOf(comparable(maker.quote));
    if (verb !== null && makerAt > verb.index) {
      const between = heard
        .slice(verb.index + verb[0].length, makerAt)
        .replace(/\b(?:que es|que son|which is|qui est|che e|das ist|dat is|que e)\s*$/, "")
        .trim();
      const words = between.split(" ").filter((word) => word.length > 0);
      if (words.length >= 1 && words.length <= 5 && !genericWine.test(between)) {
        const start = findSaid(transcript, between);
        const original = start < 0 ? between : transcript.slice(start, start + between.length);
        const name = original
          .split(/\s+/)
          .map((word, index) =>
            index > 0 && word.length <= 3
              ? word.toLowerCase()
              : word.charAt(0).toUpperCase() + word.slice(1),
          )
          .join(" ");
        proposal.fields.wineName = { quote: original, status: "explicit", value: name };
      }
    }
  }
}

/**
 * Where words that `comparable` wrote stand in the original text, or null:
 * the folded text and the original line up word for word.
 */
function spanOf(text: string, folded: string): { end: number; start: number } | null {
  const target = folded.split(" ");
  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)];
  for (let index = 0; index + target.length <= words.length; index += 1) {
    if (target.every((word, offset) => comparable(words[index + offset]![0]) === word)) {
      const last = words[index + target.length - 1]!;
      return { end: last.index! + last[0].length, start: words[index]!.index! };
    }
  }
  return null;
}

const findSaid = (text: string, folded: string) => spanOf(text, folded)?.start ?? -1;

/**
 * The few words around the first that `keyword` finds, as said: a level read
 * from a run-on note must be the level of that thing, not of the next one.
 */
function around(text: string, keyword: RegExp, before: number, after: number): string | null {
  const words = comparable(text).split(" ");
  const at = words.findIndex((word) => keyword.test(word));
  if (at < 0) return null;
  const folded = words.slice(Math.max(0, at - before), at + after + 1).join(" ");
  const span = spanOf(text, folded);
  return span === null ? null : text.slice(span.start, span.end);
}

/** A scale read from the words around what it is said of. */
function levelAround(
  proposal: VoiceProposal,
  field: "alcoholPerception" | "balance" | "viscosity",
  text: string,
  keyword: RegExp,
  /** How many words before and after it: the level's and a hedge's reach. */
  [before, after]: [number, number],
): void {
  if (proposal.fields[field] !== undefined) return;
  const quote = around(text, keyword, before, after);
  if (quote === null) return;
  const level = spokenLevel(field, quote);
  if (level === null) return;
  proposal.fields[field] = {
    quote,
    status: hedges.test(comparable(quote)) ? "ambiguous" : "explicit",
    value: level,
  };
}
