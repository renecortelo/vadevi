import type {
  ExternalResult,
  FoodPairingPort,
  FoodPairingRequest,
  FoodPairingResult,
  PairingWineStyle,
  ResearchLocale,
} from "@vadevi/domain";

import { type DishProfile, profileDish, recognisedDish } from "./dish-profile";
import {
  classicPairings,
  type DishFamily,
  type PairingPrinciple,
  type StyleCode,
  styleGrapeCitations,
} from "./pairing-knowledge";

/**
 * Food-and-wine pairing with no provider behind it.
 *
 * The previous source charged for this and allowed ten questions a month, which
 * is a poor trade for knowledge that has been stable for a century: acidity cuts
 * fat, tannin wants protein, nothing should be louder than the plate, and a
 * dessert wine must be sweeter than the dessert. That is a rule set, not a
 * lookup, so it lives here — free, offline, and able to say why. Each rule, each
 * style's grapes and each classic pairing is quoted from an open source in
 * `pairing-knowledge.ts`, and checked against it.
 *
 * It answers the general question only: which *styles* suit this dish. Ranking
 * the reader's own bottles is done elsewhere, against their own recorded
 * attributes, exactly as it was when a provider answered this part. Nothing here
 * ever names a wine the reader owns, or claims one exists.
 *
 * The honest limit is that a rule set is a good sommelier's floor, not their
 * ceiling. It will not know that this particular Priorat is atypically light. It
 * will also never invent a wine, never leak the dish to anyone, and never run
 * out of monthly credit.
 */

/** What a wine tastes like on the axes a pairing is argued from, 1–5. */
export type StyleProfile = Readonly<{
  acidity: number;
  body: number;
  sweetness: number;
  tannin: number;
}>;

export type Style = Readonly<{
  /** Alcohol, 1–5: what spice and salt make taste hot. */
  alcohol: number;
  code: StyleCode;
  color: string;
  country: string | null;
  /** The earthy wine the sources pair with an earthy dish. */
  earthy: boolean;
  grapes: string[];
  name: string;
  profile: StyleProfile;
  region: string | null;
  /**
   * The kind of wine a grape must be known to make before it is placed here
   * by name. Where the library knows nothing of a grape's styles, the source
   * that names it is taken at its word.
   */
  requires: "fortified" | "rose" | "sparkling" | "sweet" | null;
  /** Said by a source to go with a whole meal, whatever the plate. */
  versatile: boolean;
  /**
   * A shape described by structure alone, so a grape no source names can be
   * placed in it by its own structure. "Crisp Atlantic white" is Albariño's
   * style, not every crisp white's.
   */
  placeable: boolean;
}>;

type Shape = Omit<Style, "code" | "grapes">;

const still = { earthy: false, placeable: false, requires: null, versatile: false } as const;

/**
 * Styles, not bottles. Each is a recognisable shape a reader can go and buy, and
 * each carries the grapes that let `matchCellarToPairing` recognise it in a
 * cellar — that function matches on type, grape or region, so a style with no
 * grapes named would be useless to it. The grapes are those a source names for
 * the style (`styleGrapeCitations`); the shapes follow the weights the same
 * sources give ("Lighter whites", "Heavier reds").
 */
const shapes: Readonly<Record<StyleCode, Shape>> = {
  light_crisp_white: {
    ...still,
    placeable: true,
    alcohol: 2,
    color: "white",
    country: null,
    name: "Light crisp white",
    profile: { acidity: 4, body: 2, sweetness: 1, tannin: 1 },
    region: null,
  },
  crisp_atlantic_white: {
    ...still,
    alcohol: 3,
    color: "white",
    country: "ES",
    name: "Crisp Atlantic white",
    profile: { acidity: 5, body: 3, sweetness: 1, tannin: 1 },
    region: "Rías Baixas",
  },
  sharp_herbaceous_white: {
    ...still,
    alcohol: 2,
    color: "white",
    country: "FR",
    name: "Sharp herbaceous white",
    profile: { acidity: 5, body: 2, sweetness: 1, tannin: 1 },
    region: "Loire",
  },
  dry_aromatic_white: {
    ...still,
    alcohol: 3,
    color: "white",
    country: "FR",
    name: "Dry aromatic white",
    profile: { acidity: 4, body: 3, sweetness: 1, tannin: 1 },
    region: "Alsace",
  },
  unoaked_chardonnay: {
    ...still,
    alcohol: 2,
    color: "white",
    country: "FR",
    name: "Unoaked Chardonnay",
    profile: { acidity: 4, body: 2, sweetness: 1, tannin: 1 },
    region: "Chablis",
  },
  full_bodied_white: {
    ...still,
    placeable: true,
    alcohol: 4,
    color: "white",
    country: null,
    name: "Full-bodied white",
    profile: { acidity: 3, body: 4, sweetness: 1, tannin: 1 },
    region: null,
  },
  off_dry_aromatic_white: {
    ...still,
    alcohol: 2,
    color: "white",
    country: "DE",
    name: "Off-dry aromatic white",
    profile: { acidity: 4, body: 3, sweetness: 3, tannin: 1 },
    region: "Mosel",
    requires: "sweet",
  },
  dry_rose: {
    ...still,
    placeable: true,
    alcohol: 3,
    color: "rose",
    country: "FR",
    name: "Dry rosé",
    profile: { acidity: 4, body: 2, sweetness: 1, tannin: 1 },
    region: "Provence",
    requires: "rose",
  },
  skin_contact_white: {
    ...still,
    alcohol: 3,
    color: "orange",
    country: "GE",
    name: "Skin-contact white",
    profile: { acidity: 4, body: 3, sweetness: 1, tannin: 3 },
    region: "Kakheti",
  },
  light_red_low_tannin: {
    ...still,
    placeable: true,
    alcohol: 2,
    color: "red",
    country: "FR",
    earthy: true,
    name: "Light red, low tannin",
    profile: { acidity: 4, body: 2, sweetness: 1, tannin: 2 },
    region: "Burgundy",
  },
  medium_bodied_red: {
    ...still,
    placeable: true,
    alcohol: 3,
    color: "red",
    country: "ES",
    name: "Medium-bodied red",
    profile: { acidity: 4, body: 3, sweetness: 1, tannin: 3 },
    region: "Rioja",
  },
  full_structured_red: {
    ...still,
    placeable: true,
    alcohol: 4,
    color: "red",
    country: null,
    name: "Full structured red",
    profile: { acidity: 4, body: 5, sweetness: 1, tannin: 5 },
    region: "Bordeaux",
  },
  ripe_fruit_forward_red: {
    ...still,
    alcohol: 5,
    color: "red",
    country: "US",
    name: "Ripe fruit-forward red",
    profile: { acidity: 3, body: 4, sweetness: 1, tannin: 3 },
    region: null,
  },
  traditional_method_sparkling: {
    ...still,
    alcohol: 2,
    color: "sparkling",
    country: "ES",
    name: "Traditional-method sparkling",
    profile: { acidity: 5, body: 2, sweetness: 1, tannin: 1 },
    region: "Penedès",
    requires: "sparkling",
    versatile: true,
  },
  off_dry_sparkling: {
    ...still,
    alcohol: 1,
    color: "sparkling",
    country: "IT",
    name: "Sweet or off-dry sparkling",
    profile: { acidity: 3, body: 1, sweetness: 4, tannin: 1 },
    region: "Asti",
    requires: "sparkling",
  },
  dry_fortified_saline: {
    ...still,
    alcohol: 4,
    color: "fortified",
    country: "ES",
    name: "Dry fortified, saline",
    profile: { acidity: 4, body: 2, sweetness: 1, tannin: 1 },
    region: "Jerez",
    requires: "fortified",
  },
  nutty_fortified: {
    ...still,
    alcohol: 5,
    color: "fortified",
    country: "ES",
    name: "Nutty fortified",
    profile: { acidity: 4, body: 4, sweetness: 1, tannin: 1 },
    region: "Jerez",
    requires: "fortified",
  },
  sweet_fortified: {
    ...still,
    alcohol: 5,
    color: "fortified",
    country: "PT",
    name: "Sweet fortified",
    profile: { acidity: 3, body: 5, sweetness: 5, tannin: 3 },
    region: "Douro",
    requires: "fortified",
  },
  sweet_late_harvest_white: {
    ...still,
    alcohol: 3,
    color: "white",
    country: "FR",
    name: "Sweet late-harvest white",
    profile: { acidity: 4, body: 4, sweetness: 5, tannin: 1 },
    region: "Sauternes",
    requires: "sweet",
  },
};

export const pairingStyleCatalogue: readonly Style[] = (
  Object.entries(shapes) as Array<[StyleCode, Shape]>
).map(([code, shape]) => ({
  ...shape,
  code,
  grapes: [...new Set(styleGrapeCitations[code].flatMap((entry) => entry.grapes))],
}));

/** Why a style was chosen, before it is put into words. */
export type Reason =
  | "acid_match"
  | "acidity"
  | "alcohol_heat"
  | "char"
  | "classic"
  | "earthy"
  | "no_protein"
  | "protein"
  | "salt_sweet"
  | "sweet_heat"
  | "sweet_sour"
  | "sweeter"
  | "tannin_clash"
  | "weight";

/** The principle each reason applies; `classic` cites its own sources. */
export const reasonPrinciples: Readonly<Record<Exclude<Reason, "classic">, PairingPrinciple>> = {
  acid_match: "acidMatch",
  acidity: "acidFat",
  alcohol_heat: "alcoholHeat",
  char: "char",
  earthy: "earthy",
  no_protein: "noProtein",
  protein: "protein",
  salt_sweet: "saltSweet",
  sweet_heat: "sweetHeat",
  sweet_sour: "sweetSour",
  sweeter: "sweeter",
  tannin_clash: "char",
  weight: "weight",
};

/** What the plate asks of a wine, and how much each shortfall costs. */
type Target = Readonly<{
  /** Per level of acidity the wine lacks. */
  acidLack: number;
  profile: StyleProfile;
  reasons: Reason[];
  /** Per level of sweetness the wine lacks, and per level it has too much. */
  sweetLack: number;
  sweetSurplus: number;
}>;

const fish = new Set(["lean_fish", "oily_fish", "shellfish"]);

/**
 * The wine this plate is asking for.
 *
 * Each line applies a principle in `pairingPrinciples`, which quotes the
 * source that states it; the reason it records is what the reader is told.
 * Nothing here is fitted to data or tuned to an answer. If a rule is wrong it
 * can be argued with, and its source checked, which is the point.
 */
function target(dish: DishProfile): Target {
  const reasons: Reason[] = [];

  // Fat and salt want acidity; a tart dish wants a wine at least as tart, or
  // the wine "may taste thin and weak". Not for a pudding: there the sugar,
  // not the acid, decides.
  let acidity = 3;
  let acidLack = 1;
  if (!dish.sweet) {
    if (dish.richness >= 5) acidity = 5;
    else if (dish.richness >= 3) acidity = 4;
    if (dish.salty) acidity = Math.max(acidity, 4);
    if (dish.richness >= 4 || dish.salty) reasons.push("acidity");
  }
  // Against a tart dish a flatter wine is a fault, not a preference.
  if (dish.acidic) {
    acidity = 5;
    acidLack = 1.5;
    reasons.push("acid_match");
  }

  // Weight against weight: the most basic rule of all.
  const body = Math.min(5, Math.max(1, dish.intensity));
  if (dish.intensity >= 4 || dish.intensity <= 2) reasons.push("weight");

  // Tannin binds to protein and fat and softens; without them it dries the
  // mouth, and fish oils turn it metallic. Hard cheese softens it too.
  let tannin = 1;
  if (dish.protein === "red_meat") {
    tannin = dish.richness >= 4 ? 5 : 4;
    reasons.push("protein");
  } else if (dish.protein === "white_meat") {
    // Middling on every axis, which is why white meat goes with almost anything.
    tannin = 2.5;
  } else if (dish.protein === "legume") tannin = 3;
  else if (dish.protein === "cheese") {
    tannin = dish.intensity >= 4 && !dish.sweetWelcome ? 3 : 2;
    if (tannin === 3) reasons.push("protein");
  } else if (fish.has(dish.protein)) {
    reasons.push("tannin_clash");
  } else if (!dish.sweet) {
    reasons.push("no_protein");
  }

  // Char lets a tannic wine play — but never on fish, whose oils still turn
  // tannin metallic however the fish was cooked.
  if (dish.smoky && !fish.has(dish.protein)) {
    tannin = Math.max(tannin, 3);
    reasons.push("char");
  }

  // Spice and sweetness make tannin taste harsher; sweetness in the wine
  // calms heat and meets a sweet-and-sour sauce; salt and rich foods take a
  // sweet wine as contrast; and a sweet wine must out-sweeten the pudding.
  let sweetness = 1;
  let sweetLack = 2;
  let sweetSurplus = 2;
  if (dish.spicy) {
    sweetness = 3;
    sweetLack = 1;
    sweetSurplus = 1;
    tannin = Math.min(tannin, 2);
    reasons.push("sweet_heat", "alcohol_heat");
  }
  if (dish.sweetSavory) {
    sweetness = 3;
    sweetLack = 1;
    sweetSurplus = 1;
    tannin = Math.min(tannin, 2);
    reasons.push("sweet_sour");
  }
  if (dish.sweetWelcome) {
    sweetness = 5;
    sweetLack = 0.4;
    sweetSurplus = 0.4;
    reasons.push("salt_sweet");
  }
  if (dish.sweet) {
    sweetness = 5;
    sweetLack = 2.5;
    sweetSurplus = 2;
    tannin = 1;
    reasons.push("sweeter");
  }
  if (dish.earthy) reasons.push("earthy");

  return {
    acidLack,
    profile: { acidity, body, sweetness, tannin },
    reasons,
    sweetLack,
    sweetSurplus,
  };
}

/**
 * How far a style's structure sits from another, on the four axes. Lower is
 * closer. Used to place a grape the catalogue does not name.
 */
export function styleDistance(style: StyleProfile, wanted: StyleProfile): number {
  return (
    Math.abs(style.acidity - wanted.acidity) * 1.5 +
    Math.abs(style.body - wanted.body) +
    Math.abs(style.tannin - wanted.tannin) * 1.5 +
    Math.abs(style.sweetness - wanted.sweetness) * 2
  );
}

/** The distinct sources that pair this style with any of these families. */
export function classicSources(code: StyleCode, families: readonly DishFamily[]): string[] {
  const sources = new Set<string>();
  for (const classic of classicPairings) {
    if (!classic.styles.includes(code)) continue;
    if (!classic.families.some((family) => families.includes(family))) continue;
    sources.add("source" in classic.cite ? classic.cite.source : `grape:${classic.cite.grape}`);
  }
  return [...sources];
}

/**
 * How far a style sits from what the plate asked for. Lower is better, and
 * below zero is a classic the sources name, close in shape as well.
 *
 * The axes are not weighed alike. A wine less acid than a fatty or tart dish
 * fails it; one more acid merely stands out. Tannin above what the plate can
 * soften is a fault; below it, a lighter choice. A dry wine with a dessert is
 * not a near miss. Alcohol counts only where spice or salt make it burn.
 */
export function styleGap(style: Style, dish: DishProfile, wanted = target(dish)): number {
  const shape = style.profile;
  const want = wanted.profile;
  // Alcohol is weight too: a fortified wine is heavier than its body alone.
  const weight = style.alcohol > shape.body ? (shape.body + style.alcohol) / 2 : shape.body;
  let gap =
    Math.max(0, want.acidity - shape.acidity) * wanted.acidLack +
    Math.max(0, shape.acidity - want.acidity) * 0.25 +
    Math.abs(weight - want.body) +
    Math.max(0, shape.tannin - want.tannin) * 1.5 +
    Math.max(0, want.tannin - shape.tannin) * 0.75 +
    Math.max(0, want.sweetness - shape.sweetness) * wanted.sweetLack +
    Math.max(0, shape.sweetness - want.sweetness) * wanted.sweetSurplus;
  if (dish.spicy) gap += Math.max(0, style.alcohol - 3) * 1.5;
  if (dish.salty) gap += Math.max(0, style.alcohol - 4) * 0.5;
  if (dish.earthy && style.earthy) gap -= 1.5;
  if (style.versatile && !dish.sweet) gap -= 0.5;
  // A pairing a source names counts; each further source that names it counts
  // a little more, up to three.
  const named = Math.min(3, classicSources(style.code, dish.families).length);
  if (named > 0) gap -= 1 + named;
  return gap;
}

const reasonCopy: Record<ResearchLocale, Record<Reason, string>> = {
  ca: {
    acid_match: "acidesa a l'altura de la del plat: si no, el vi sembla prim",
    acidity: "acidesa alta que talla el greix del plat",
    alcohol_heat: "alcohol moderat: l'alcohol aviva el picant",
    char: "tanins que s'entenen amb el torrat de la brasa",
    classic: "una combinació clàssica que recullen les fonts",
    earthy: "notes terroses que acompanyen les del plat",
    no_protein: "pocs tanins: sense proteïna que els suavitzi, assequen la boca",
    protein: "tanins que s'estoven amb la proteïna i el greix",
    salt_sweet: "dolçor que contrasta amb la sal del plat",
    sweet_heat: "un punt de dolçor que calma el picant",
    sweet_sour: "un punt de dolçor per a una salsa agredolça",
    sweeter: "més dolç que les postres: si no, el vi sembla àcid i prim",
    tannin_clash: "tanins baixos: amb el peix es tornen metàl·lics",
    weight: "cos a l'altura del plat, sense tapar-lo",
  },
  de: {
    acid_match: "Säure auf der Höhe des Gerichts, sonst wirkt der Wein dünn",
    acidity: "hohe Säure, die das Fett des Gerichts schneidet",
    alcohol_heat: "moderater Alkohol: Alkohol verstärkt die Schärfe",
    char: "Tannin, das zu den Röstaromen vom Grill passt",
    classic: "eine klassische Kombination, die die Quellen nennen",
    earthy: "erdige Noten, die das Gericht aufgreifen",
    no_protein: "wenig Tannin: ohne Eiweiß, das es mildert, trocknet es den Mund aus",
    protein: "Tannine, die an Eiweiß und Fett weich werden",
    salt_sweet: "Süße als Gegenspieler zum Salz des Gerichts",
    sweet_heat: "etwas Süße gegen die Schärfe",
    sweet_sour: "etwas Süße zu einer süßsauren Sauce",
    sweeter: "süßer als das Dessert, sonst wirkt der Wein sauer und dünn",
    tannin_clash: "wenig Tannin: zu Fisch wird es metallisch",
    weight: "Körper auf Augenhöhe mit dem Gericht, ohne es zu übertönen",
  },
  en: {
    acid_match: "acidity to match the dish's own, without which the wine tastes thin",
    acidity: "high acidity to cut the fat on the plate",
    alcohol_heat: "moderate alcohol, since alcohol fans the heat of the spice",
    char: "tannin that meets the char of the grill",
    classic: "a classic pairing the sources name",
    earthy: "earthy notes that echo the dish",
    no_protein: "little tannin: with no protein to soften it, it dries the mouth",
    protein: "tannin, which softens against protein and fat",
    salt_sweet: "sweetness set against the salt of the plate",
    sweet_heat: "a touch of sweetness to calm the heat",
    sweet_sour: "a touch of sweetness to meet a sweet-and-sour sauce",
    sweeter: "more sweetness than the dessert, or the wine tastes tart and thin",
    tannin_clash: "low tannin: it turns metallic against fish",
    weight: "weight to match the dish without burying it",
  },
  es: {
    acid_match: "acidez a la altura de la del plato: si no, el vino parece flaco",
    acidity: "acidez alta que corta la grasa del plato",
    alcohol_heat: "alcohol moderado: el alcohol aviva el picante",
    char: "taninos que se entienden con el tostado de la brasa",
    classic: "una combinación clásica que recogen las fuentes",
    earthy: "notas terrosas que acompañan a las del plato",
    no_protein: "pocos taninos: sin proteína que los suavice, secan la boca",
    protein: "taninos que se suavizan con la proteína y la grasa",
    salt_sweet: "dulzor que contrasta con la sal del plato",
    sweet_heat: "un punto de dulzor que calma el picante",
    sweet_sour: "un punto de dulzor para una salsa agridulce",
    sweeter: "más dulce que el postre: si no, el vino parece ácido y flaco",
    tannin_clash: "taninos bajos: con el pescado se vuelven metálicos",
    weight: "cuerpo a la altura del plato, sin taparlo",
  },
  fr: {
    acid_match: "une acidité à la hauteur de celle du plat, sans quoi le vin paraît maigre",
    acidity: "acidité élevée pour trancher le gras du plat",
    alcohol_heat: "un alcool modéré : l'alcool attise le piquant",
    char: "des tanins qui s'accordent au grillé de la braise",
    classic: "un accord classique que citent les sources",
    earthy: "des notes terreuses qui font écho au plat",
    no_protein: "peu de tanins : sans protéines pour les assouplir, ils assèchent la bouche",
    protein: "des tanins qui s'assouplissent sur les protéines et le gras",
    salt_sweet: "une douceur qui contraste avec le sel du plat",
    sweet_heat: "une pointe de sucre pour calmer le piquant",
    sweet_sour: "une pointe de sucre pour une sauce aigre-douce",
    sweeter: "plus sucré que le dessert, sans quoi le vin paraît acide et maigre",
    tannin_clash: "peu de tanin : sur le poisson il devient métallique",
    weight: "un corps à la hauteur du plat, sans l'écraser",
  },
  it: {
    acid_match: "un'acidità all'altezza di quella del piatto, altrimenti il vino sembra magro",
    acidity: "acidità alta che taglia il grasso del piatto",
    alcohol_heat: "alcol moderato: l'alcol ravviva il piccante",
    char: "tannini che si intendono con la tostatura della brace",
    classic: "un abbinamento classico citato dalle fonti",
    earthy: "note terrose che richiamano quelle del piatto",
    no_protein: "pochi tannini: senza proteine che li ammorbidiscano, asciugano la bocca",
    protein: "tannini che si ammorbidiscono con le proteine e il grasso",
    salt_sweet: "dolcezza che contrasta con la sapidità del piatto",
    sweet_heat: "un tocco di dolcezza che calma il piccante",
    sweet_sour: "un tocco di dolcezza per una salsa agrodolce",
    sweeter: "più dolce del dessert, altrimenti il vino sembra acido e magro",
    tannin_clash: "tannini bassi: sul pesce diventano metallici",
    weight: "corpo all'altezza del piatto, senza coprirlo",
  },
  nl: {
    acid_match: "zuren die opwegen tegen die van het gerecht, anders smaakt de wijn dun",
    acidity: "hoge zuren die het vet van het gerecht doorsnijden",
    alcohol_heat: "gematigde alcohol: alcohol wakkert de pit aan",
    char: "tannine die past bij het geroosterde van de grill",
    classic: "een klassieke combinatie die de bronnen noemen",
    earthy: "aardse tonen die die van het gerecht oppakken",
    no_protein: "weinig tannine: zonder eiwit om die te verzachten droogt ze de mond uit",
    protein: "tannine, die zacht wordt tegen eiwit en vet",
    salt_sweet: "zoet als tegenwicht voor het zout van het gerecht",
    sweet_heat: "een vleug zoet tegen de pit",
    sweet_sour: "een vleug zoet bij een zoetzure saus",
    sweeter: "zoeter dan het nagerecht, anders smaakt de wijn zuur en dun",
    tannin_clash: "weinig tannine: bij vis wordt het metaalachtig",
    weight: "body op de hoogte van het gerecht, zonder het te overstemmen",
  },
  "pt-PT": {
    acid_match: "acidez à altura da do prato: caso contrário, o vinho parece magro",
    acidity: "acidez alta que corta a gordura do prato",
    alcohol_heat: "álcool moderado: o álcool aviva o picante",
    char: "taninos que se entendem com o tostado da brasa",
    classic: "uma combinação clássica que as fontes referem",
    earthy: "notas terrosas que acompanham as do prato",
    no_protein: "poucos taninos: sem proteína que os amacie, secam a boca",
    protein: "taninos que amaciam com a proteína e a gordura",
    salt_sweet: "doçura que contrasta com o sal do prato",
    sweet_heat: "um toque de doçura que acalma o picante",
    sweet_sour: "um toque de doçura para um molho agridoce",
    sweeter: "mais doce do que a sobremesa: caso contrário, o vinho parece ácido e magro",
    tannin_clash: "taninos baixos: com peixe tornam-se metálicos",
    weight: "corpo à altura do prato, sem o tapar",
  },
};

/** How many styles are worth offering. More than this is a list, not an answer. */
const offered = 4;

/**
 * Which reasons to lead with.
 *
 * The rule that decided the answer should be the one the reader is told. For
 * roast lamb that is the tannin, not the acidity that also happens to be true —
 * saying "acidity cuts the fat" about a lamb chop is not wrong, it is just not
 * why a Cabernet is at the top. `weight` is last and always present, so an
 * explanation is never empty even for a dish with no strong claim on any axis.
 * A classic, where there is one, is said first: that the sources name it is
 * the strongest reason there is.
 */
const reasonOrder: readonly Reason[] = [
  "sweeter",
  "salt_sweet",
  "sweet_heat",
  "sweet_sour",
  "protein",
  "tannin_clash",
  "char",
  "no_protein",
  "alcohol_heat",
  "earthy",
  "acid_match",
  "acidity",
  "weight",
];

/** Every style, nearest first, with how far it sits. */
export function rankStyles(dish: DishProfile): Array<{ gap: number; style: Style }> {
  const wanted = target(dish);
  return pairingStyleCatalogue
    .map((style) => ({ gap: styleGap(style, dish, wanted), style }))
    .sort((left, right) => left.gap - right.gap);
}

export function pairingStylesFor(dish: DishProfile, locale: ResearchLocale): PairingWineStyle[] {
  const wanted = target(dish);
  const copy = reasonCopy[locale];
  const given = new Set(wanted.reasons);
  const general = reasonOrder
    .filter((reason) => given.has(reason) || reason === "weight")
    .filter((reason) => reason !== "earthy");

  return rankStyles(dish)
    .slice(0, offered)
    .map(({ gap, style }, index) => {
      const own = [
        ...(classicSources(style.code, dish.families).length > 0 ? (["classic"] as const) : []),
        ...(given.has("earthy") && style.earthy ? (["earthy"] as const) : []),
      ];
      return {
        color: style.color,
        country: style.country,
        description: [...own, ...general.slice(0, 2)].map((reason) => copy[reason]).join("; "),
        grapes: style.grapes,
        // A classic close in shape sits below zero; a fair match near it.
        matchPercent: Math.round(Math.min(100, Math.max(40, 92 - gap * 4))),
        name: style.name,
        rank: index + 1,
        region: style.region,
      };
    });
}

/**
 * The port the rest of the application already speaks, so nothing downstream
 * changes: the assistant still asks for styles and still ranks the reader's own
 * wines against them. Only where the styles come from is different.
 */
export class LocalFoodPairingAdapter implements FoodPairingPort {
  pair(input: FoodPairingRequest): Promise<ExternalResult<FoodPairingResult>> {
    const dish = profileDish(input.dish);
    if (!recognisedDish(dish)) {
      // Nothing in the vocabulary matched. Guessing from a neutral profile would
      // produce a confident answer to a question nobody asked, so this reports
      // the same "no result" shape a provider would and lets the caller say so.
      return Promise.resolve({
        reason: "not_found",
        retryAfterSeconds: null,
        status: "unavailable",
      });
    }
    return Promise.resolve({
      cached: false,
      data: { provider: "local", styles: pairingStylesFor(dish, input.locale) },
      status: "success",
    });
  }
}
