import type {
  ExternalResult,
  FoodPairingPort,
  FoodPairingRequest,
  FoodPairingResult,
  PairingWineStyle,
  ResearchLocale,
} from "@vadevi/domain";

import { type DishProfile, profileDish, recognisedDish } from "./dish-profile";

/**
 * Food-and-wine pairing with no provider behind it.
 *
 * The previous source charged for this and allowed ten questions a month, which
 * is a poor trade for knowledge that has been stable for a century: acidity cuts
 * fat, tannin wants protein, nothing should be louder than the plate, and a
 * dessert wine must be sweeter than the dessert. That is a rule set, not a
 * lookup, so it lives here — free, offline, and able to say why.
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
type StyleProfile = Readonly<{
  acidity: number;
  body: number;
  sweetness: number;
  tannin: number;
}>;

type Style = Readonly<{
  color: string;
  country: string | null;
  grapes: string[];
  name: string;
  profile: StyleProfile;
  region: string | null;
}>;

/**
 * Styles, not bottles. Each is a recognisable shape a reader can go and buy, and
 * each carries the grapes that let `matchCellarToPairing` recognise it in a
 * cellar — that function matches on type, grape or region, so a style with no
 * grapes named would be useless to it.
 */
const styles: readonly Style[] = [
  {
    color: "white",
    country: "ES",
    grapes: ["Albariño", "Verdejo", "Godello", "Loureiro"],
    name: "Crisp Atlantic white",
    profile: { acidity: 5, body: 2, sweetness: 1, tannin: 1 },
    region: "Rías Baixas",
  },
  {
    color: "white",
    country: "FR",
    grapes: ["Sauvignon Blanc", "Melon de Bourgogne"],
    name: "Sharp herbaceous white",
    profile: { acidity: 5, body: 2, sweetness: 1, tannin: 1 },
    region: "Loire",
  },
  {
    color: "white",
    country: "FR",
    grapes: ["Chardonnay"],
    name: "Unoaked Chardonnay",
    profile: { acidity: 4, body: 3, sweetness: 1, tannin: 1 },
    region: "Chablis",
  },
  {
    color: "white",
    country: null,
    grapes: ["Chardonnay", "Viognier", "Marsanne"],
    name: "Rich barrel-aged white",
    profile: { acidity: 3, body: 4, sweetness: 1, tannin: 1 },
    region: null,
  },
  {
    color: "white",
    country: "DE",
    grapes: ["Riesling", "Gewürztraminer", "Moscatel"],
    name: "Off-dry aromatic white",
    profile: { acidity: 4, body: 3, sweetness: 3, tannin: 1 },
    region: "Mosel",
  },
  {
    color: "sparkling",
    country: "ES",
    grapes: ["Macabeo", "Xarel·lo", "Parellada", "Chardonnay"],
    name: "Traditional-method sparkling",
    profile: { acidity: 5, body: 2, sweetness: 1, tannin: 1 },
    region: "Penedès",
  },
  {
    color: "rose",
    country: "FR",
    grapes: ["Garnacha", "Cinsault", "Syrah"],
    name: "Dry rosé",
    profile: { acidity: 4, body: 2, sweetness: 1, tannin: 1 },
    region: "Provence",
  },
  {
    color: "orange",
    country: null,
    grapes: ["Garnacha Blanca", "Pinot Gris", "Rkatsiteli"],
    name: "Skin-contact white",
    profile: { acidity: 4, body: 3, sweetness: 1, tannin: 2 },
    region: null,
  },
  {
    color: "red",
    country: "FR",
    grapes: ["Pinot Noir", "Gamay", "Mencía"],
    name: "Light red, low tannin",
    profile: { acidity: 4, body: 2, sweetness: 1, tannin: 2 },
    region: "Burgundy",
  },
  {
    color: "red",
    country: "ES",
    grapes: ["Tempranillo", "Sangiovese", "Garnacha"],
    name: "Medium-bodied red",
    profile: { acidity: 4, body: 3, sweetness: 1, tannin: 3 },
    region: "Rioja",
  },
  {
    color: "red",
    country: null,
    grapes: ["Cabernet Sauvignon", "Syrah", "Monastrell", "Tempranillo"],
    name: "Full structured red",
    profile: { acidity: 3, body: 5, sweetness: 1, tannin: 5 },
    region: "Ribera del Duero",
  },
  {
    // Smoke and char want ripe fruit to meet them. An austere, high-tannin red
    // against barbecue tastes bitter twice over.
    color: "red",
    country: null,
    grapes: ["Garnacha", "Zinfandel", "Primitivo", "Syrah"],
    name: "Ripe fruit-forward red",
    profile: { acidity: 3, body: 4, sweetness: 1, tannin: 3 },
    region: null,
  },
  {
    color: "fortified",
    country: "ES",
    grapes: ["Palomino"],
    name: "Dry fortified, saline",
    profile: { acidity: 4, body: 2, sweetness: 1, tannin: 1 },
    region: "Jerez",
  },
  {
    color: "fortified",
    country: "PT",
    grapes: ["Touriga Nacional", "Pedro Ximénez"],
    name: "Sweet fortified",
    profile: { acidity: 3, body: 5, sweetness: 5, tannin: 2 },
    region: "Douro",
  },
  {
    color: "white",
    country: "FR",
    grapes: ["Sémillon", "Moscatel", "Riesling"],
    name: "Sweet late-harvest white",
    profile: { acidity: 4, body: 4, sweetness: 5, tannin: 1 },
    region: "Sauternes",
  },
];

/** Why a style was chosen, before it is put into words. */
type Reason =
  "acidity" | "bubbles" | "protein" | "smoke" | "sweeter" | "tannin_clash" | "umami" | "weight";

/**
 * The wine this plate is asking for.
 *
 * Each line is a rule with a century behind it, and each one is the reason a
 * caller can be given. Nothing here is fitted to data or tuned; if a rule is
 * wrong it can be argued with, which is the point of writing it down.
 */
function target(dish: DishProfile): { profile: StyleProfile; reasons: Reason[] } {
  const reasons: Reason[] = [];

  // Fat wants acidity. So does a sharp plate, which a flabby wine tastes dull beside.
  let acidity = 3;
  if (dish.richness >= 4) {
    acidity = 5;
    reasons.push("acidity");
  } else if (dish.richness === 3) acidity = 4;
  if (dish.acidic) {
    acidity = 5;
    reasons.push("acidity");
  }

  // Nothing should shout over the other. Weight follows the plate's own volume.
  if (dish.intensity >= 4 || dish.intensity <= 2) reasons.push("weight");

  // Tannin needs protein and fat to soften against; on fish it turns metallic.
  let tannin = 1;
  if (dish.protein === "red_meat") {
    tannin = 5;
    reasons.push("protein");
  } else if (dish.protein === "white_meat" || dish.protein === "legume") tannin = 3;
  else if (dish.protein === "cheese") tannin = 2;
  else if (
    dish.protein === "oily_fish" ||
    dish.protein === "lean_fish" ||
    dish.protein === "shellfish"
  ) {
    tannin = 1;
    reasons.push("tannin_clash");
  }

  // Umami makes tannin taste harder and drier than it is. Soy, miso, mushroom
  // and aged cheese are why a Cabernet fights teriyaki and a juicy low-tannin
  // red does not — the wine has not changed, the plate has moved the goalposts.
  if (dish.umami && tannin > 2) {
    tannin = 2;
    reasons.push("umami");
  }

  // Char wants ripe fruit to meet it. An austere red against barbecue is bitter
  // twice over, so weight goes up while tannin stays moderate.
  let body = Math.min(5, Math.max(1, dish.intensity));
  if (dish.smoky) {
    body = Math.max(body, 4);
    // Weight, not grip — and not on fish at all. Smoked salmon is still salmon,
    // and tannin still turns metallic against it; letting smoke raise the
    // tannin here would have answered smoked mackerel with a Cabernet.
    const fish =
      dish.protein === "lean_fish" || dish.protein === "oily_fish" || dish.protein === "shellfish";
    if (!fish) tannin = Math.min(Math.max(tannin, 3), 4);
    reasons.push("smoke");
  }

  // Heat is quenched by sugar and inflamed by tannin and alcohol.
  let sweetness = 1;
  if (dish.spicy) {
    sweetness = 3;
    tannin = Math.min(tannin, 2);
    reasons.push("sweeter");
  }
  // A wine drier than the pudding tastes sour next to it.
  if (dish.sweet) {
    sweetness = 5;
    tannin = 1;
    reasons.push("sweeter");
  }

  if (dish.richness >= 4 && !dish.sweet) reasons.push("bubbles");

  return { profile: { acidity, body, sweetness, tannin }, reasons };
}

/** How far a style sits from what the plate asked for. Lower is better. */
function distance(style: StyleProfile, wanted: StyleProfile): number {
  // Not all axes matter equally, and weighting them evenly showed it: a rich
  // barrel-aged Chardonnay tied with a sharp Albariño against seared salmon,
  // because what it gained on body it lost on acidity. Against fat, acidity is
  // the whole point and body is a preference, so they cannot count the same.
  //
  // Sweetness is weighted hardest of all: a dry wine with dessert is not a near
  // miss, it is unpleasant. Tannin next, for the same reason on fish.
  return (
    Math.abs(style.acidity - wanted.acidity) * 1.5 +
    Math.abs(style.body - wanted.body) +
    Math.abs(style.tannin - wanted.tannin) * 1.5 +
    Math.abs(style.sweetness - wanted.sweetness) * 2
  );
}

const reasonCopy: Record<ResearchLocale, Record<Reason, string>> = {
  ca: {
    acidity: "acidesa alta que talla el greix del plat",
    bubbles: "la bombolla neteja el paladar entre mossegades",
    protein: "tanins que es dolceixen amb la proteïna de la carn",
    smoke: "fruita madura que surt a trobar el fum de la brasa",
    sweeter: "un punt de dolçor que calma el picant o acompanya les postres",
    tannin_clash: "tanins baixos: amb el peix es tornen metàl·lics",
    umami: "tanins continguts: l'umami de la soja o el bolet els endureix",
    weight: "cos a l'altura del plat, sense tapar-lo",
  },
  de: {
    acidity: "hohe Säure, die das Fett des Gerichts schneidet",
    bubbles: "Perlage, die den Gaumen zwischen den Bissen reinigt",
    protein: "Tannine, die am Eiweiß des Fleisches weich werden",
    smoke: "reife Frucht, die dem Rauch entgegenkommt",
    sweeter: "etwas Süße gegen die Schärfe oder zum Dessert",
    tannin_clash: "wenig Tannin: zu Fisch wird es metallisch",
    umami: "zurückhaltendes Tannin: Umami aus Soja oder Pilz lässt es härter wirken",
    weight: "Körper auf Augenhöhe mit dem Gericht, ohne es zu übertönen",
  },
  en: {
    acidity: "high acidity to cut the fat on the plate",
    bubbles: "bubbles to clear the palate between mouthfuls",
    protein: "tannin, which softens against the protein in red meat",
    smoke: "ripe fruit to meet the smoke off the fire",
    sweeter: "a touch of sweetness to calm the heat, or to meet the pudding",
    tannin_clash: "low tannin: it turns metallic against fish",
    umami: "restrained tannin: umami from soy or mushroom makes it taste harder",
    weight: "weight to match the dish without burying it",
  },
  es: {
    acidity: "acidez alta que corta la grasa del plato",
    bubbles: "burbuja que limpia el paladar entre bocados",
    protein: "taninos que se suavizan con la proteína de la carne",
    smoke: "fruta madura que sale al encuentro del humo",
    sweeter: "un punto de dulzor que calma el picante o acompaña el postre",
    tannin_clash: "taninos bajos: con el pescado se vuelven metálicos",
    umami: "taninos contenidos: el umami de la soja o la seta los endurece",
    weight: "cuerpo a la altura del plato, sin taparlo",
  },
  fr: {
    acidity: "acidité élevée pour trancher le gras du plat",
    bubbles: "des bulles qui nettoient le palais entre deux bouchées",
    protein: "des tanins qui s'assouplissent sur la protéine de la viande",
    smoke: "un fruit mûr qui va à la rencontre du fumé",
    sweeter: "une pointe de sucre pour calmer le piquant ou accompagner le dessert",
    tannin_clash: "peu de tanin : sur le poisson il devient métallique",
    umami: "des tanins retenus : l'umami du soja ou du champignon les durcit",
    weight: "un corps à la hauteur du plat, sans l'écraser",
  },
  it: {
    acidity: "acidità alta che taglia il grasso del piatto",
    bubbles: "bollicine che puliscono il palato tra un boccone e l'altro",
    protein: "tannini che si ammorbidiscono sulla proteina della carne",
    smoke: "frutta matura che va incontro all'affumicato",
    sweeter: "un tocco di dolcezza per calmare il piccante o accompagnare il dolce",
    tannin_clash: "tannini bassi: sul pesce diventano metallici",
    umami: "tannini contenuti: l'umami di soia o fungo li indurisce",
    weight: "corpo all'altezza del piatto, senza coprirlo",
  },
  nl: {
    acidity: "hoge zuren die het vet van het gerecht doorsnijden",
    bubbles: "bubbels die het gehemelte tussen happen schoonspoelen",
    protein: "tannine, die zacht wordt tegen het eiwit van rood vlees",
    smoke: "rijp fruit dat de rook tegemoet komt",
    sweeter: "een vleug zoet tegen de pit, of bij het nagerecht",
    tannin_clash: "weinig tannine: bij vis wordt het metaalachtig",
    umami: "ingetogen tannine: umami uit soja of paddenstoel maakt die harder",
    weight: "body op de hoogte van het gerecht, zonder het te overstemmen",
  },
  "pt-PT": {
    acidity: "acidez alta que corta a gordura do prato",
    bubbles: "bolha que limpa o palato entre garfadas",
    protein: "taninos que amaciam com a proteína da carne",
    smoke: "fruta madura que vai ao encontro do fumo",
    sweeter: "um toque de doçura para acalmar o picante ou acompanhar a sobremesa",
    tannin_clash: "taninos baixos: com peixe tornam-se metálicos",
    umami: "taninos contidos: o umami da soja ou do cogumelo endurece-os",
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
 */
const reasonOrder: readonly Reason[] = [
  "sweeter",
  "protein",
  "tannin_clash",
  "umami",
  "smoke",
  "acidity",
  "bubbles",
  "weight",
];

export function pairingStylesFor(dish: DishProfile, locale: ResearchLocale): PairingWineStyle[] {
  const wanted = target(dish);
  const copy = reasonCopy[locale];
  const worst = 16; // the furthest any style in the catalogue can sit from a target
  const given = new Set(wanted.reasons);
  const explanation = reasonOrder
    .filter((reason) => given.has(reason) || reason === "weight")
    .slice(0, 2)
    .map((reason) => copy[reason])
    .join("; ");

  return styles
    .map((style) => ({ gap: distance(style.profile, wanted.profile), style }))
    .sort((left, right) => left.gap - right.gap)
    .slice(0, offered)
    .map(({ gap, style }, index) => ({
      color: style.color,
      country: style.country,
      description: explanation,
      grapes: style.grapes,
      matchPercent: Math.max(40, Math.round(100 - (gap / worst) * 100)),
      name: style.name,
      rank: index + 1,
      region: style.region,
    }));
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
