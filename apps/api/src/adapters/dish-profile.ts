import { normalizeWineText } from "../repositories/wine-memory";

/**
 * What a dish is, on the axes that decide a pairing.
 *
 * Wine and food meet on a handful of properties, not on recipes: how rich the
 * plate is, how loudly it is flavoured, whether it is sharp, sweet or hot, and
 * what the main protein does to a tannin. A pairing engine that works on these
 * can explain itself — "high acidity to cut the fat" — where one that works on
 * dish names can only assert.
 *
 * Deliberately coarse. "Salmón salteado" and "grilled mackerel" land in nearly
 * the same place, and they should: an oily fish cooked hot wants the same wine
 * either way.
 */
export type DishProtein =
  | "cheese"
  | "lean_fish"
  | "legume"
  | "none"
  | "oily_fish"
  | "red_meat"
  | "shellfish"
  | "vegetable"
  | "white_meat";

export type DishProfile = Readonly<{
  /** Sharp with tomato, citrus or vinegar: the wine must not be flatter than the plate. */
  acidic: boolean;
  /** How loud the flavour is, 1–5. Quiet food is buried by a loud wine. */
  intensity: number;
  protein: DishProtein;
  /** Fat and unctuousness, 1–5. This is what acidity is for. */
  richness: number;
  spicy: boolean;
  sweet: boolean;
  /** Words that were recognised, so a caller can say what it understood. */
  terms: string[];
}>;

type Contribution = Readonly<{
  acidic?: boolean;
  intensity?: number;
  protein?: DishProtein;
  richness?: number;
  spicy?: boolean;
  sweet?: boolean;
}>;

/**
 * One multilingual vocabulary rather than eight catalogues.
 *
 * These are not interface strings — nobody reads them — they are the words a
 * reader might type, in any of the eight locales this ships with, normalized so
 * accents and case do not matter. The assistant already recognises its pairing
 * verbs this way; this is the same trick applied to food.
 *
 * It does not need to be complete to be useful. An unrecognised word simply
 * contributes nothing, and a dish nothing is recognised in falls back to a
 * neutral profile, which the caller can detect and handle by asking.
 */
const lexicon: ReadonlyArray<{ contribution: Contribution; terms: string }> = [
  // Red meat and game: tannin has something to bind to here, and nowhere else.
  {
    contribution: { intensity: 4, protein: "red_meat", richness: 4 },
    terms:
      "beef steak lamb veal buey ternera vaca cordero solomillo entrecot chuleta bistec cabrito " +
      "carn vedella xai rind kalb lamm boeuf agneau veau manzo agnello vitello rundvlees " +
      "lamsvlees kalfsvlees vitela borrego",
  },
  {
    contribution: { intensity: 5, protein: "red_meat", richness: 4 },
    terms:
      "venison game boar venado jabali caza cabra wild wildschwein gibier selvaggina cinghiale wildzwijn javali",
  },
  // White meat: middling on every axis, which is why it pairs with almost anything.
  {
    contribution: { intensity: 3, protein: "white_meat", richness: 3 },
    terms:
      "chicken pork turkey rabbit pollo cerdo pavo conejo cochinillo lomo pollastre porc gall " +
      "dindi conill huhn haehnchen schwein pute kaninchen poulet porc dinde lapin maiale tacchino " +
      "coniglio kip varken kalkoen konijn frango porco peru coelho",
  },
  // Oily fish: fat and a strong flavour, the classic case for sharp white.
  {
    contribution: { intensity: 4, protein: "oily_fish", richness: 4 },
    terms:
      "salmon tuna sardine mackerel anchovy herring salmo atun sardina caballa anchoa boqueron " +
      "arenque tonyina verat anxova saumon thon sardine maquereau anchois hareng lachs thunfisch " +
      "makrele sardellen hering salmone tonno sgombro acciughe aringa zalm tonijn makreel ansjovis " +
      "haring salmao atum cavala anchova",
  },
  // Lean fish: quiet, and buried by anything loud.
  {
    contribution: { intensity: 2, protein: "lean_fish", richness: 2 },
    terms:
      "cod hake sole turbot bass bream haddock bacalao merluza lubina dorada rodaballo lenguado " +
      "rape bacalla lluc llobarro orada llenguado morue colin bar daurade turbot sole kabeljau " +
      "seehecht wolfsbarsch dorade steinbutt seezunge merluzzo nasello branzino orata rombo " +
      "sogliola kabeljauw heek zeebaars zeebrasem tarbot tong bacalhau pescada robalo dourada " +
      "pregado linguado",
  },
  // Shellfish: delicate, saline, and allergic to tannin.
  {
    contribution: { intensity: 2, protein: "shellfish", richness: 2 },
    terms:
      "prawn shrimp lobster crab mussel clam oyster scallop squid octopus cuttlefish gamba " +
      "langostino bogavante cangrejo mejillon almeja ostra vieira calamar pulpo sepia marisco " +
      "gambes llagosta cranc musclo cloissa ostre petxina polbo crevette homard crabe moule " +
      "palourde huitre coquille poulpe garnele hummer krabbe miesmuschel auster jakobsmuschel " +
      "tintenfisch gambero astice granchio cozza vongole ostrica capasanta calamaro polpo seppia " +
      "garnaal kreeft krab mossel oester inktvis camarao lavagante caranguejo mexilhao polvo lula",
  },
  {
    contribution: { intensity: 3, protein: "cheese", richness: 4 },
    terms: "cheese queso formatge fromage kase kaese formaggio kaas queijo",
  },
  {
    contribution: { intensity: 2, protein: "vegetable", richness: 2 },
    terms:
      "vegetable salad mushroom asparagus artichoke verdura verduras ensalada seta setas " +
      "champinon esparrago alcachofa verdures amanida bolet carxofa esparrec gemuse salat pilz " +
      "spargel artischocke legume salade champignon asperge artichaut verdure insalata fungo " +
      "funghi asparago carciofo groente sla paddenstoel asperge artisjok salada cogumelo espargo " +
      "alcachofra",
  },
  {
    contribution: { intensity: 3, protein: "legume", richness: 3 },
    terms:
      "lentil bean chickpea lenteja judia garbanzo alubia llentia mongeta cigro linse bohne " +
      "kichererbse lentille haricot pois lenticchia fagiolo cece linze boon kikkererwt lentilha " +
      "feijao grao",
  },

  // How it was cooked. Fat added in the pan is still fat on the plate.
  {
    contribution: { intensity: 4, richness: 4 },
    terms:
      "fried sauteed roast roasted braised stewed confit frito salteado asado estofado guisado " +
      "rustido fregit saltejat rostit estofat frit saute roti braise gebraten sautiert geschmort " +
      "gebacken fritto saltato arrosto brasato stufato gebakken gesauteerd geroosterd gestoofd " +
      "frito assado",
  },
  {
    contribution: { intensity: 2, richness: 1 },
    terms:
      "steamed poached boiled raw vapor hervido escalfado crudo cocido vapeur poche bouilli cru " +
      "gedampft pochiert gekocht roh vapore bollito crudo gestoomd gekookt rauw cozido vapor",
  },
  {
    contribution: { intensity: 4, richness: 5 },
    terms:
      "cream butter cheesy gratin carbonara bechamel crema nata mantequilla gratinado mantega " +
      "creme beurre sahne butter rahm panna burro room boter manteiga natas",
  },
  {
    contribution: { intensity: 4, richness: 3 },
    terms:
      "grilled barbecue parrilla brasa plancha graellada grille gegrillt grigliato gegrild " +
      "grelhado churrasco",
  },

  // Flavours that override the protein.
  {
    contribution: { spicy: true },
    terms:
      "spicy curry chili chilli hot picante guindilla pimenton harissa wasabi jalapeno picant " +
      "epice piquant scharf piccante pittig apimentado",
  },
  {
    contribution: { acidic: true },
    terms:
      "tomato lemon vinegar ceviche escabeche pickled citrus tomate limon vinagre encurtido " +
      "tomaquet llimona vinagre citron vinaigre zitrone essig pomodoro limone aceto sottaceto " +
      "tomaat citroen azijn limao",
  },
  {
    contribution: { protein: "none", sweet: true },
    terms:
      "dessert cake chocolate ice cream tart pastry postre pastel tarta helado bizcocho xocolata " +
      "gelat dolc dessert gateau glace patisserie kuchen schokolade eis nachtisch torta " +
      "cioccolato gelato dolce taart chocola ijs toetje sobremesa bolo gelado doce",
  },
];

const neutral: DishProfile = {
  acidic: false,
  intensity: 3,
  protein: "none",
  richness: 3,
  spicy: false,
  sweet: false,
  terms: [],
};

/**
 * Read a dish into the axes a pairing can be argued from.
 *
 * Every recognised word contributes, and the strongest claim wins on each axis:
 * "salmón salteado" is an oily fish (rich 4) cooked in fat (rich 4), and stays
 * rich 4 rather than averaging down to something neither word said. A protein
 * named later does not overwrite one named earlier, because the first noun in
 * "salmon with lentils" is usually the point of the plate.
 *
 * Recognises nothing? The profile comes back neutral with no terms, and the
 * caller is expected to notice and ask rather than guess.
 */
export function profileDish(dish: string): DishProfile {
  const words = normalizeWineText(dish).split(" ").filter(Boolean);
  if (words.length === 0) return neutral;

  // Singulars as well as what was typed. Readers write "ostras" and "gambas",
  // and a vocabulary that only knows "ostra" would quietly understand nothing
  // and then answer anyway. Crude on purpose: it costs a lookup, not a stemmer.
  const tokens = new Set(words);
  for (const word of words) {
    if (word.length > 4 && word.endsWith("es")) tokens.add(word.slice(0, -2));
    if (word.length > 3 && word.endsWith("s")) tokens.add(word.slice(0, -1));
  }

  let profile = { ...neutral, terms: [] as string[] };
  let proteinDecided = false;

  for (const entry of lexicon) {
    // Short tokens are thrown away rather than trusted. A two-letter word is a
    // preposition in some language on this list, and "à la mode" once matched
    // the `a` left behind by writing a multi-word phrase into a token list.
    const hit = entry.terms.split(" ").find((term) => term.length >= 3 && tokens.has(term));
    if (hit === undefined) continue;
    profile.terms.push(hit);

    const { acidic, intensity, protein, richness, spicy, sweet } = entry.contribution;
    if (protein !== undefined && (!proteinDecided || protein === "none")) {
      profile = { ...profile, protein };
      proteinDecided = true;
    }
    if (intensity !== undefined)
      profile = { ...profile, intensity: Math.max(profile.intensity, intensity) };
    if (richness !== undefined)
      profile = { ...profile, richness: Math.max(profile.richness, richness) };
    if (acidic === true) profile = { ...profile, acidic: true };
    if (spicy === true) profile = { ...profile, spicy: true };
    if (sweet === true) profile = { ...profile, sweet: true };
  }

  return profile;
}

/** Whether anything at all was understood, so a caller can ask instead of guessing. */
export function recognisedDish(profile: DishProfile): boolean {
  return profile.terms.length > 0;
}
