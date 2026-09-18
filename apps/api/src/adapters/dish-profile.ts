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
  /** Grilled over wood, smoked, chipotle: wants ripe fruit, not austerity. */
  smoky: boolean;
  spicy: boolean;
  sweet: boolean;
  /** Words that were recognised, so a caller can say what it understood. */
  terms: string[];
  /**
   * Soy, miso, fish sauce, mushrooms, aged cheese, tomato concentrate.
   *
   * The axis European home cooking barely needs and half the world cooks on.
   * Umami makes tannin taste harder and drier than it is, which is why a
   * Cabernet fights teriyaki and a fruity low-tannin red does not.
   */
  umami: boolean;
}>;

type Contribution = Readonly<{
  acidic?: boolean;
  intensity?: number;
  protein?: DishProtein;
  richness?: number;
  smoky?: boolean;
  spicy?: boolean;
  sweet?: boolean;
  umami?: boolean;
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
      "lamsvlees kalfsvlees vitela borrego " +
      // Latin American Spanish and the cuts people name instead of the animal.
      "res filete arrachera costilla costillas falda aguja diezmillo sirloin ribeye " +
      "picana picanha matambre vacio bife",
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
      "chicken pork turkey rabbit pollo cerdo pavo conejo cochinillo pollastre porc gall " +
      "pechuga muslo pierna alitas puerco chancho cochino lechon lomo " +
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
      "pregado linguado corvina huachinango mojarra tilapia",
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
      "garnaal kreeft krab mossel oester inktvis camarao lavagante caranguejo mexilhao polvo lula " +
      "camaron camarones langosta jaiba",
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
  // The generic words. Naming every species and not the category left
  // "fish and chips" with no protein at all.
  {
    contribution: { intensity: 2, protein: "lean_fish", richness: 2 },
    terms: "fish pescado peix peixe poisson fisch pesce vis pescados mariscos seafood",
  },
  {
    contribution: { intensity: 4, protein: "red_meat", richness: 4 },
    terms: "meat carne viande fleisch vlees",
  },
  {
    contribution: { intensity: 3, protein: "white_meat", richness: 3, umami: true },
    terms: "carbonara",
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

  // ---------------------------------------------------------------------
  // The rest of the world.
  //
  // Dish names contribute flavour and method; the protein is still decided by
  // the ingredient words, so "tacos de pollo" and "chicken tikka" land on white
  // meat without either dish name claiming it. Much of this vocabulary is
  // loanwords that are spelled the same in all eight locales, which is why world
  // cooking is cheaper to cover here than European home cooking was.
  // ---------------------------------------------------------------------

  // Soy, miso, fish sauce, cured umami. The axis that decides whether tannin
  // works at all, and the reason a Cabernet fights teriyaki.
  {
    contribution: { umami: true },
    terms:
      "soy soja soia sojasauce shoyu tamari teriyaki miso dashi umami ponzu hoisin oyster " +
      "worcestershire anchoa anchovy parmesano parmesan parmigiano pecorino manchego curado " +
      "cured seco trufa truffle tartufo trufel",
  },
  {
    contribution: { intensity: 3, umami: true },
    terms:
      "mushroom seta setas champinon bolet funghi shiitake porcini boletus paddenstoel cogumelo pilz",
  },

  // Smoke and char want ripe fruit, not austerity.
  {
    contribution: { intensity: 4, smoky: true },
    terms:
      "smoked smoky barbecue chipotle brisket ribs ahumado ahumada fumado defumado fume fumee " +
      "geraeuchert geraucht affumicato gerookt churrasco costillas asador",
  },

  // East and Southeast Asia.
  {
    contribution: { intensity: 2, protein: "lean_fish", richness: 2, umami: true },
    terms: "sushi sashimi nigiri maki temaki poke",
  },
  {
    contribution: { intensity: 3, richness: 3, umami: true },
    terms: "ramen pho udon soba noodles fideos yakisoba wok bibimbap bulgogi gochujang kimchi",
  },
  {
    contribution: { intensity: 3, richness: 4, umami: true },
    terms:
      "teriyaki yakitori katsu tonkatsu tempura karaage gyoza dumpling dumplings dimsum bao baozi wonton",
  },
  {
    contribution: { intensity: 4, richness: 4, spicy: true },
    terms: "thai satay rendang laksa massaman panang sambal nasi mie",
  },

  // South Asia.
  {
    contribution: { intensity: 4, richness: 4, spicy: true },
    terms: "tandoori tikka masala vindaloo madras jalfrezi biryani rogan",
  },
  { contribution: { intensity: 3, richness: 4 }, terms: "korma paneer dal daal naan raita lassi" },

  // Middle East and North Africa.
  {
    contribution: { intensity: 3, protein: "legume", richness: 3 },
    terms: "hummus houmous falafel tabbouleh baba tahini",
  },
  {
    contribution: { intensity: 4, richness: 4 },
    terms: "tagine tajine couscous cuscus kuskus harira",
  },

  // Latin America.
  {
    contribution: { intensity: 4, richness: 3 },
    terms: "taco tacos enchilada enchiladas chilaquiles tostada tostadas",
  },
  {
    contribution: { intensity: 4, protein: "white_meat", richness: 4 },
    terms: "carnitas cochinita pozole pibil",
  },
  {
    contribution: { intensity: 4, protein: "red_meat", richness: 4 },
    terms: "barbacoa birria asada",
  },
  { contribution: { intensity: 4, richness: 4, umami: true }, terms: "mole" },
  {
    contribution: { intensity: 3, richness: 3 },
    terms:
      "tamal tamales arepa arepas quesadilla empanada empanadas guacamole chimichurri feijoada",
  },

  // Sub-Saharan Africa.
  {
    contribution: { intensity: 4, richness: 3, spicy: true },
    terms: "jollof berbere piri suya injera doro",
  },

  // North America.
  {
    contribution: { intensity: 4, richness: 5 },
    terms: "burger hamburguesa cheeseburger hamburger gumbo jambalaya pastrami",
  },

  // ---------------------------------------------------------------------
  // Named dishes from the eight locales this ships in.
  //
  // The words a reader actually types. Each is one distinctive token, never a
  // phrase, because the matcher works on tokens — "coq au vin" is listed as
  // `bourguignon`-style single words or not at all. Where a dish is famous for
  // what was done to it rather than what is in it, the method axes carry it and
  // the protein is left to the ingredients.
  // ---------------------------------------------------------------------

  // Long braises. Weight and softened collagen, which is where tannin belongs.
  {
    contribution: { intensity: 5, protein: "red_meat", richness: 5 },
    terms: "bourguignon ossobuco osobuco rabo wellington shepherd goulash gulasch stroganoff",
  },
  // The sour braises: vinegar or wine in the pot changes what the wine must do.
  {
    contribution: { acidic: true, intensity: 4, protein: "red_meat", richness: 4 },
    terms: "sauerbraten hachee",
  },

  // Cured pork and charcuterie: salt and age, which is umami by another name.
  {
    contribution: { intensity: 4, protein: "white_meat", richness: 4, umami: true },
    terms:
      "jamon prosciutto bresaola speck presunto pancetta guanciale porchetta leitao bifana " +
      "botifarra alheira secallona fuet",
  },
  {
    contribution: { intensity: 4, protein: "white_meat", richness: 4, smoky: true, spicy: true },
    terms: "chorizo chourico sobrasada morcilla",
  },

  // Bean and pulse dishes heavy enough to want a red.
  {
    contribution: { intensity: 4, protein: "legume", richness: 5 },
    terms: "fabada cassoulet cocido escudella erwtensoep potaje acorda",
  },

  // Cheese as the dish, not the garnish.
  {
    contribution: { intensity: 4, protein: "cheese", richness: 5 },
    terms: "tartiflette raclette fondue fonduta parmigiana kasespatzle",
  },
  {
    contribution: { acidic: true, intensity: 3, protein: "cheese", richness: 3, umami: true },
    terms: "caprese margherita pizza",
  },

  // Fish stews and the cold salt-cod salads.
  {
    contribution: { intensity: 3, protein: "lean_fish", richness: 3 },
    terms: "bouillabaisse suquet cataplana marmitako cacciucco caldeirada zarzuela",
  },
  {
    contribution: { acidic: true, intensity: 2, protein: "lean_fish", richness: 2 },
    terms: "esqueixada brandada",
  },

  // Vegetables, and the two Catalan ones that arrive off the coals.
  {
    contribution: { acidic: true, intensity: 2, protein: "vegetable", richness: 2 },
    terms: "gazpacho salmorejo ratatouille pisto samfaina trinxat minestrone boerenkool",
  },
  {
    contribution: { intensity: 3, protein: "vegetable", richness: 3, smoky: true },
    terms: "escalivada calcots",
  },

  // Rice and pasta. A tomato ragù is sharp and savoury before it is meat.
  {
    contribution: { acidic: true, intensity: 4, protein: "red_meat", richness: 4, umami: true },
    terms: "bolognese ragu lasagna lasagne canelons cannelloni",
  },
  {
    contribution: { acidic: true, intensity: 4, protein: "white_meat", richness: 4, umami: true },
    terms: "amatriciana puttanesca",
  },
  {
    contribution: { intensity: 3, richness: 3 },
    terms: "paella risotto fideua gnocchi polenta arroz",
  },

  // Fried until it is mostly fat, which is what the bubbles are for.
  {
    contribution: { intensity: 4, richness: 5 },
    terms:
      "schnitzel croquetas croquete bitterballen kroket arancini francesinha pasty chips " +
      "bunuelos milanesa empanizado rebozado",
  },

  // Sausage and the sour cabbage that usually comes with it.
  {
    contribution: { intensity: 4, protein: "white_meat", richness: 4 },
    terms: "bratwurst bangers eisbein kassler stamppot hutspot rookworst frikandel",
  },
  {
    contribution: { acidic: true, intensity: 4, protein: "white_meat", richness: 4 },
    terms: "choucroute sauerkraut chucrut",
  },
  {
    contribution: { intensity: 4, protein: "white_meat", richness: 4, spicy: true },
    terms: "currywurst",
  },

  // Puddings that the dessert entry would otherwise miss by name.
  {
    contribution: { protein: "none", sweet: true },
    terms:
      "tiramisu strudel tatin trifle toffee stroopwafel speculaas catalana panacotta pavlova " +
      "clafoutis profiterol churros",
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

/**
 * The vocabulary split once, at load, instead of on every question.
 *
 * Terms under three characters are dropped here rather than guarded at each
 * comparison. A two-letter word is a preposition in some language on this list,
 * and writing a phrase into a token list once left `a` behind as a term, which
 * matched "à la mode".
 */
const entries = lexicon.map((entry) => ({
  contribution: entry.contribution,
  terms: entry.terms.split(" ").filter((term) => term.length >= 3),
}));

/** The shortest shared opening that is evidence of the same word, not a coincidence. */
const stemLength = 5;

/**
 * Does any word the reader typed mean this term?
 *
 * Exact first, then a shared stem — because Spanish, and especially the Spanish
 * spoken outside Spain, arrives in diminutives and variants that an exact match
 * cannot see: costillitas, pechuguita, camaroncitos, filetito. All of them share
 * their first five letters with a word already in the vocabulary, so a stem
 * catches a whole class of miss without adding a single entry.
 *
 * Five is the floor on both sides, which is what keeps it honest. `res` stays an
 * exact match and cannot reach "restaurante"; `chips` cannot reach "chipotle",
 * which shares only four. A shorter floor would turn this from a stemmer into a
 * guess.
 *
 * It is still a heuristic and it does misfire: "cordelito" shares five letters
 * with "cordero" and is read as lamb. Six would stop that and would also stop
 * "filetito" reaching "filete", which is a word people actually type about food.
 * The trade is taken deliberately — this only ever reads a question that is
 * already about a dish, where a non-food word sharing five letters with a food
 * one is rarer than a diminutive of the food itself.
 */
function matches(term: string, tokens: ReadonlySet<string>): boolean {
  if (tokens.has(term)) return true;
  if (term.length < stemLength) return false;
  for (const token of tokens) {
    if (token.length < stemLength) continue;
    let shared = 0;
    const limit = Math.min(token.length, term.length);
    while (shared < limit && token[shared] === term[shared]) shared += 1;
    if (shared >= stemLength) return true;
  }
  return false;
}

const neutral: DishProfile = {
  acidic: false,
  intensity: 3,
  protein: "none",
  richness: 3,
  smoky: false,
  spicy: false,
  sweet: false,
  terms: [],
  umami: false,
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

  for (const entry of entries) {
    const hit = entry.terms.find((term) => matches(term, tokens));
    if (hit === undefined) continue;
    profile.terms.push(hit);

    const { acidic, intensity, protein, richness, smoky, spicy, sweet, umami } = entry.contribution;
    if (protein !== undefined && (!proteinDecided || protein === "none")) {
      profile = { ...profile, protein };
      proteinDecided = true;
    }
    if (intensity !== undefined)
      profile = { ...profile, intensity: Math.max(profile.intensity, intensity) };
    if (richness !== undefined)
      profile = { ...profile, richness: Math.max(profile.richness, richness) };
    if (acidic === true) profile = { ...profile, acidic: true };
    if (smoky === true) profile = { ...profile, smoky: true };
    if (spicy === true) profile = { ...profile, spicy: true };
    if (sweet === true) profile = { ...profile, sweet: true };
    if (umami === true) profile = { ...profile, umami: true };
  }

  return profile;
}

/** Whether anything at all was understood, so a caller can ask instead of guessing. */
export function recognisedDish(profile: DishProfile): boolean {
  return profile.terms.length > 0;
}

const proteinWords: Record<DishProtein, string> = {
  cheese: "a cheese dish",
  lean_fish: "lean white fish",
  legume: "a pulse dish",
  none: "a dish with no single main protein",
  oily_fish: "oily fish",
  red_meat: "red meat",
  shellfish: "shellfish",
  vegetable: "vegetables",
  white_meat: "white meat",
};

const scale = ["very light", "light", "moderate", "rich", "very rich"] as const;
const loudness = ["very delicate", "delicate", "moderate", "pronounced", "powerful"] as const;

/**
 * The plate in words, so an answer can say *why* before it says what to drink.
 *
 * A reader asking what goes with roast chicken is owed the reasoning — that the
 * dish is white meat, moderately rich, moderate in flavour — and not only a list
 * of bottles. This is the half of the explanation that belongs to the food; the
 * styles carry the half that belongs to the wine.
 *
 * English, like every other statement handed to the language model, which renders
 * the answer in the reader's own language.
 */
export function describeDish(dish: string): string {
  const profile = profileDish(dish);
  const parts = [
    proteinWords[profile.protein],
    `${scale[Math.min(4, Math.max(0, profile.richness - 1))]} on the palate`,
    `${loudness[Math.min(4, Math.max(0, profile.intensity - 1))]} in flavour`,
  ];
  if (profile.acidic) parts.push("sharp with acidity of its own");
  if (profile.spicy) parts.push("hot with spice");
  if (profile.smoky) parts.push("smoky from the fire");
  if (profile.umami) parts.push("savoury with umami");
  if (profile.sweet) parts.push("sweet");
  return parts.join(", ");
}
