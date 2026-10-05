import { normalizeWineText } from "../repositories/wine-memory";
import type { DishFamily } from "./pairing-knowledge";

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
  /** Mushroom, truffle: a flavour an earthy wine can meet with its own. */
  earthy: boolean;
  /** The kinds of dish it belongs to, which is where the sources' classics apply. */
  families: DishFamily[];
  /** How loud the flavour is, 1–5. Quiet food is buried by a loud wine. */
  intensity: number;
  protein: DishProtein;
  /** Fat and unctuousness, 1–5. This is what acidity is for. */
  richness: number;
  /** Cured, brined, aged: salt wants acidity, and makes alcohol taste hotter. */
  salty: boolean;
  /** Off the grill or the fire: char, which a tannic wine can meet. */
  smoky: boolean;
  spicy: boolean;
  sweet: boolean;
  /** Savoury with sweetness of its own — sweet-and-sour, teriyaki. */
  sweetSavory: boolean;
  /**
   * Salty and rich enough that a sweet wine is a contrast, not a mistake:
   * blue cheese, foie gras.
   */
  sweetWelcome: boolean;
  /** Words that were recognised, so a caller can say what it understood. */
  terms: string[];
  /**
   * Soy, miso, fish sauce, mushrooms, aged cheese, tomato concentrate.
   *
   * Described to the reader, but no longer acted on: no open source the
   * rules could cite says what umami does to a wine, so the pairing is argued
   * from the salt, sweetness and spice those dishes also carry.
   */
  umami: boolean;
}>;

type Contribution = Readonly<{
  acidic?: boolean;
  earthy?: boolean;
  families?: readonly DishFamily[];
  intensity?: number;
  /** Pasta, which is the "pasta with tomato" family only with the tomato. */
  pasta?: boolean;
  protein?: DishProtein;
  richness?: number;
  salty?: boolean;
  smoky?: boolean;
  spicy?: boolean;
  sweet?: boolean;
  sweetSavory?: boolean;
  sweetWelcome?: boolean;
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
 * A term with an underscore is two words read together — `pescado_azul`,
 * `queso_cabra` — because some dishes are named by a pair whose halves mean
 * something else alone: "azul" is not a cheese, and "pescado" is not an oily
 * fish. Little words between them ("queso de cabra") are skipped.
 *
 * It does not need to be complete to be useful. An unrecognised word simply
 * contributes nothing, and a dish nothing is recognised in falls back to a
 * neutral profile, which the caller can detect and handle by asking.
 */
const lexicon: ReadonlyArray<{ contribution: Contribution; terms: string }> = [
  // Pairs first: the first protein named owns the plate, and "pescado azul"
  // must be decided as oily before "pescado" is read as lean.
  {
    contribution: { families: ["oily_fish"], intensity: 4, protein: "oily_fish", richness: 4 },
    terms:
      "pescado_azul pescados_azules peix_blau poisson_gras pesce_azzurro oily_fish vette_vis " +
      "peixe_gordo",
  },
  {
    contribution: {
      families: ["blue_cheese"],
      intensity: 5,
      protein: "cheese",
      richness: 5,
      salty: true,
      sweetWelcome: true,
    },
    terms:
      "queso_azul quesos_azules formatge_blau fromage_bleu fromages_bleus formaggio_erborinato " +
      "blue_cheese blauschimmelkase blauwe_kaas queijo_azul roquefort stilton gorgonzola " +
      "cabrales valdeon",
  },
  {
    contribution: {
      acidic: true,
      families: ["fresh_cheese"],
      intensity: 2,
      protein: "cheese",
      richness: 3,
    },
    terms:
      "queso_cabra queso_fresco formatge_cabra formatge_fresc fromage_chevre fromage_frais " +
      "goat_cheese fresh_cheese formaggio_capra ziegenkase frischkase geitenkaas verse_kaas " +
      "queijo_cabra queijo_fresco chevre crottin mozzarella burrata ricotta feta requeson mato",
  },
  {
    contribution: { families: ["soft_cheese"], intensity: 3, protein: "cheese", richness: 5 },
    terms: "brie camembert coulommiers",
  },
  {
    contribution: {
      families: ["aged_cheese"],
      intensity: 4,
      protein: "cheese",
      richness: 4,
      salty: true,
      umami: true,
    },
    terms:
      "queso_curado quesos_curados formatge_curat fromage_affine aged_cheese hard_cheese " +
      "formaggio_stagionato oude_kaas belegen_kaas queijo_curado manchego parmesano parmesan " +
      "parmigiano grana pecorino cheddar comte gruyere idiazabal emmental",
  },
  {
    contribution: {
      families: ["foie_gras"],
      intensity: 4,
      richness: 5,
      sweetWelcome: true,
    },
    terms: "foie foie_gras ganzenlever gansestopfleber",
  },

  // Red meat and game: tannin has something to bind to here, and nowhere else.
  {
    contribution: { families: ["lamb"], intensity: 4, protein: "red_meat", richness: 4 },
    terms: "lamb cordero cabrito xai lamm agneau agnello lamsvlees borrego",
  },
  {
    contribution: { families: ["red_meat"], intensity: 4, protein: "red_meat", richness: 4 },
    terms:
      "beef steak veal buey ternera vaca solomillo entrecot chuleta bistec carn vedella rind " +
      "kalb boeuf veau manzo vitello rundvlees kalfsvlees vitela " +
      // Latin American Spanish and the cuts people name instead of the animal.
      "brisket res filete arrachera costilla costillas falda aguja diezmillo sirloin ribeye " +
      "picana picanha matambre vacio bife",
  },
  {
    contribution: { families: ["game"], intensity: 5, protein: "red_meat", richness: 4 },
    terms:
      "venison game boar venado jabali caza cabra wild wildschwein gibier selvaggina cinghiale wildzwijn javali",
  },
  // White meat: middling on every axis, which is why it pairs with almost anything.
  {
    contribution: { families: ["poultry"], intensity: 3, protein: "white_meat", richness: 3 },
    terms:
      "chicken turkey duck pollo pavo pato pollastre gall pechuga muslo pierna alitas dindi " +
      "anec huhn haehnchen hahnchen pute ente poulet dinde canard tacchino anatra kip kalkoen " +
      "eend frango peru",
  },
  {
    contribution: { families: ["pork"], intensity: 3, protein: "white_meat", richness: 4 },
    terms:
      "pork cerdo cochinillo puerco chancho cochino lechon lomo porc schwein schweinefleisch " +
      "maiale varken varkensvlees porco",
  },
  {
    contribution: { intensity: 3, protein: "white_meat", richness: 3 },
    terms: "rabbit conejo conill kaninchen lapin coniglio konijn coelho",
  },
  // Oily fish: fat and a strong flavour, the classic case for sharp white.
  {
    contribution: { families: ["oily_fish"], intensity: 4, protein: "oily_fish", richness: 4 },
    terms:
      "salmon tuna sardine mackerel anchovy herring salmo atun sardina caballa anchoa boqueron " +
      "arenque tonyina verat anxova saumon thon sardine maquereau anchois hareng lachs thunfisch " +
      "makrele sardellen hering salmone tonno sgombro acciughe aringa zalm tonijn makreel ansjovis " +
      "haring salmao atum cavala anchova",
  },
  // Lean fish: quiet, and buried by anything loud.
  {
    contribution: { families: ["white_fish"], intensity: 2, protein: "lean_fish", richness: 2 },
    terms:
      "cod hake sole turbot bass bream haddock bacalao merluza lubina dorada rodaballo lenguado " +
      "rape bacalla lluc llobarro orada llenguado morue colin bar daurade turbot sole kabeljau " +
      "seehecht wolfsbarsch dorade steinbutt seezunge merluzzo nasello branzino orata rombo " +
      "sogliola kabeljauw heek zeebaars zeebrasem tarbot tong bacalhau pescada robalo dourada " +
      "pregado linguado corvina huachinango mojarra tilapia",
  },
  // Oysters: briny, which is the salt the sources set acidity against.
  {
    contribution: {
      families: ["oysters", "shellfish"],
      intensity: 2,
      protein: "shellfish",
      richness: 1,
      salty: true,
    },
    terms: "oyster ostra ostre huitre auster ostrica oester",
  },
  // Lobster and crab: rich enough for a fuller white.
  {
    contribution: {
      families: ["rich_shellfish"],
      intensity: 3,
      protein: "shellfish",
      richness: 4,
    },
    terms:
      "lobster crab bogavante langosta cangrejo centollo necora llamantol llagosta cranc " +
      "homard langouste crabe tourteau hummer languste taschenkrebs astice aragosta granchio " +
      "kreeft krab lavagante lagosta caranguejo sapateira jaiba",
  },
  // Shellfish: delicate, and allergic to tannin.
  {
    contribution: { families: ["shellfish"], intensity: 2, protein: "shellfish", richness: 2 },
    terms:
      "prawn shrimp mussel clam scallop squid octopus cuttlefish gamba langostino mejillon " +
      "almeja vieira calamar pulpo sepia marisco gambes musclo cloissa petxina polbo crevette " +
      "moule palourde coquille poulpe garnele miesmuschel jakobsmuschel tintenfisch gambero " +
      "cozza vongole capasanta calamaro polpo seppia garnaal mossel inktvis camarao mexilhao " +
      "polvo lula camaron camarones",
  },
  {
    contribution: { intensity: 3, protein: "cheese", richness: 4 },
    terms: "cheese queso formatge fromage kase kaese formaggio kaas queijo",
  },
  {
    contribution: {
      earthy: true,
      families: ["mushrooms"],
      intensity: 3,
      protein: "vegetable",
      richness: 2,
      umami: true,
    },
    terms:
      "mushroom seta setas champinon bolet funghi fungo shiitake porcini boletus paddenstoel " +
      "cogumelo pilz pilze champignon trufa truffle tartufo trufel truffe",
  },
  {
    contribution: { families: ["vegetables"], intensity: 2, protein: "vegetable", richness: 2 },
    terms:
      "vegetable salad asparagus artichoke verdura verduras ensalada esparrago alcachofa " +
      "verdures amanida carxofa esparrec gemuse salat spargel artischocke legume salade " +
      "asperge artichaut verdure insalata asparago carciofo groente sla asperge artisjok " +
      "salada espargo alcachofra",
  },
  // The generic words. Naming every species and not the category left
  // "fish and chips" with no protein at all.
  {
    contribution: { families: ["white_fish"], intensity: 2, protein: "lean_fish", richness: 2 },
    terms: "fish pescado peix peixe poisson fisch pesce vis pescados",
  },
  {
    contribution: { families: ["shellfish"], intensity: 2, protein: "shellfish", richness: 2 },
    terms: "mariscos seafood fruits_mer frutti_mare meeresfruchte zeevruchten",
  },
  {
    contribution: { families: ["red_meat"], intensity: 4, protein: "red_meat", richness: 4 },
    terms: "meat carne viande fleisch vlees",
  },
  {
    contribution: { intensity: 3, protein: "white_meat", richness: 3, umami: true },
    terms: "carbonara",
  },
  {
    contribution: { families: ["legumes"], intensity: 3, protein: "legume", richness: 3 },
    terms:
      "lentil bean chickpea lenteja judia garbanzo alubia llentia mongeta cigro linse bohne " +
      "kichererbse lentille haricot pois lenticchia fagiolo cece linze boon kikkererwt lentilha " +
      "feijao grao",
  },
  {
    contribution: { families: ["eggs"], intensity: 2, richness: 3 },
    terms:
      "egg eggs huevo huevos ous oeuf oeufs ufs eier uovo uova ovo ovos tortilla omelette frittata quiche",
  },

  // How it was cooked. Fat added in the pan is still fat on the plate.
  {
    contribution: { intensity: 4, richness: 4 },
    terms:
      "fried sauteed roast roasted braised confit frito salteado asado rustido fregit saltejat " +
      "rostit frit saute roti braise gebraten sautiert geschmort gebacken fritto saltato " +
      "arrosto brasato gebakken gesauteerd geroosterd frito assado",
  },
  // A stew is its own dish: long-cooked, dense, wanting a wine of body.
  {
    contribution: { families: ["stews"], intensity: 5, richness: 5 },
    terms:
      "stew stewed estofado guiso guisado guisat estofat ragout mijote eintopf schmorgericht " +
      "stufato spezzatino stoofpot stoofvlees estufado",
  },
  {
    contribution: { intensity: 2, richness: 1 },
    terms:
      "steamed poached boiled raw vapor hervido escalfado crudo cocido vapeur poche bouilli cru " +
      "gedampft pochiert gekocht roh vapore bollito crudo gestoomd gekookt rauw cozido vapor",
  },
  {
    contribution: { families: ["cream_sauces"], intensity: 4, richness: 5 },
    terms: "cream creamy crema creme nata natas sahne sahnesauce panna room roomsaus bechamel",
  },
  {
    contribution: { intensity: 4, richness: 5 },
    terms: "butter cheesy gratin gratinado mantequilla mantega beurre burro boter manteiga",
  },
  // Off the coals: the char the sources say a tannic wine can meet.
  {
    contribution: { intensity: 4, richness: 3, smoky: true },
    terms:
      // Not "asador": it shares its opening with "asado", which is a roast.
      "grilled parrilla brasa graellada grille gegrillt grigliato gegrild grelhado churrasco",
  },
  { contribution: { intensity: 3, richness: 3 }, terms: "plancha" },

  // ---------------------------------------------------------------------
  // The rest of the world.
  //
  // Dish names contribute flavour and method; the protein is still decided by
  // the ingredient words, so "tacos de pollo" and "chicken tikka" land on white
  // meat without either dish name claiming it. Much of this vocabulary is
  // loanwords that are spelled the same in all eight locales, which is why world
  // cooking is cheaper to cover here than European home cooking was.
  // ---------------------------------------------------------------------

  // Soy, miso, fish sauce: salt above all, which is what the rules act on.
  {
    contribution: { salty: true, umami: true },
    terms:
      "soy soja soia sojasauce shoyu tamari miso dashi umami ponzu oyster_sauce worcestershire " +
      "anchoa anchovy fish_sauce salsa_ostra salsa_ostras salsa_soja",
  },
  // Sweet with the savoury: the sauce decides the wine, not the meat.
  {
    contribution: {
      families: ["asian"],
      intensity: 3,
      richness: 3,
      sweetSavory: true,
      umami: true,
    },
    terms:
      "teriyaki hoisin agridulce agredolc aigre_doux sweet_sour agrodolce zoetzuur su_sauer " +
      "agridoce",
  },
  {
    contribution: { families: ["asian"], intensity: 3, richness: 3 },
    terms:
      "chinese chino xines xinesa chinois chinoise chinesisch cinese chinees chines " +
      "cantonese cantones wok dimsum",
  },

  // Smoke and barbecue.
  {
    contribution: { families: ["barbecue"], intensity: 5, richness: 4, smoky: true },
    terms: "barbecue bbq brisket ribs",
  },
  {
    contribution: { intensity: 4, smoky: true },
    terms:
      "smoked smoky ahumado ahumada fumado defumado fume fumee geraeuchert gerauchert geraucht " +
      "affumicato gerookt chipotle",
  },

  // East and Southeast Asia.
  {
    contribution: {
      families: ["sushi"],
      intensity: 2,
      protein: "lean_fish",
      richness: 2,
      salty: true,
      umami: true,
    },
    terms: "sushi sashimi nigiri maki temaki poke",
  },
  {
    contribution: { families: ["asian"], intensity: 3, richness: 3, umami: true },
    terms: "ramen pho udon soba noodles fideos yakisoba bibimbap bulgogi gochujang kimchi",
  },
  {
    contribution: { families: ["asian"], intensity: 3, richness: 4, umami: true },
    terms: "yakitori katsu tonkatsu tempura karaage gyoza dumpling dumplings bao baozi wonton",
  },
  {
    contribution: { families: ["spicy"], intensity: 4, richness: 4, spicy: true },
    terms: "thai satay rendang laksa massaman panang sambal nasi mie sichuan szechuan",
  },

  // South Asia.
  {
    contribution: { families: ["spicy"], intensity: 4, richness: 4, spicy: true },
    terms: "tandoori tikka masala vindaloo madras jalfrezi biryani rogan",
  },
  { contribution: { intensity: 3, richness: 4 }, terms: "korma paneer dal daal naan raita lassi" },

  // Middle East and North Africa.
  {
    contribution: { families: ["legumes"], intensity: 3, protein: "legume", richness: 3 },
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
    contribution: { families: ["pork"], intensity: 4, protein: "white_meat", richness: 4 },
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
    contribution: { families: ["spicy"], intensity: 4, richness: 3, spicy: true },
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
  // The words a reader actually types. Each is one distinctive token or a
  // pair, never a longer phrase, because the matcher works on tokens. Where a
  // dish is famous for what was done to it rather than what is in it, the
  // method axes carry it and the protein is left to the ingredients.
  // ---------------------------------------------------------------------

  // Long braises. Weight and softened collagen, which is where tannin belongs.
  {
    contribution: { families: ["stews"], intensity: 5, protein: "red_meat", richness: 5 },
    terms: "bourguignon ossobuco osobuco rabo wellington shepherd goulash gulasch stroganoff",
  },
  // The sour braises: vinegar or wine in the pot changes what the wine must do.
  {
    contribution: {
      acidic: true,
      families: ["stews"],
      intensity: 4,
      protein: "red_meat",
      richness: 4,
    },
    terms: "sauerbraten hachee",
  },

  // Cured pork and charcuterie: salt and age.
  {
    contribution: {
      families: ["cured_meats"],
      intensity: 4,
      protein: "white_meat",
      richness: 4,
      salty: true,
      umami: true,
    },
    terms:
      "jamon prosciutto bresaola speck presunto pancetta guanciale porchetta salami salchichon " +
      "lomo_embuchado embutido embutidos charcuterie charcuteria embotit embotits pernil " +
      "botifarra alheira secallona fuet",
  },
  {
    contribution: {
      families: ["cured_meats"],
      intensity: 4,
      protein: "white_meat",
      richness: 4,
      salty: true,
      smoky: true,
      spicy: true,
    },
    terms: "chorizo chourico sobrasada morcilla",
  },
  {
    contribution: { families: ["pork"], intensity: 4, protein: "white_meat", richness: 4 },
    terms: "leitao bifana",
  },

  // Bean and pulse dishes heavy enough to want a red.
  {
    contribution: {
      families: ["legumes", "stews"],
      intensity: 4,
      protein: "legume",
      richness: 5,
    },
    terms: "fabada cassoulet cocido escudella erwtensoep potaje acorda",
  },

  // Cheese as the dish, not the garnish.
  {
    contribution: { intensity: 4, protein: "cheese", richness: 5 },
    terms: "tartiflette raclette fondue fonduta parmigiana kasespatzle",
  },
  {
    contribution: {
      acidic: true,
      families: ["pizza"],
      intensity: 3,
      protein: "cheese",
      richness: 3,
      salty: true,
      umami: true,
    },
    terms: "margherita pizza",
  },
  {
    contribution: {
      acidic: true,
      families: ["fresh_cheese"],
      intensity: 3,
      protein: "cheese",
      richness: 3,
    },
    terms: "caprese",
  },

  // Fish stews and the cold salt-cod salads.
  {
    contribution: { families: ["white_fish"], intensity: 3, protein: "lean_fish", richness: 3 },
    terms: "bouillabaisse suquet cataplana marmitako cacciucco caldeirada zarzuela",
  },
  {
    contribution: {
      acidic: true,
      families: ["white_fish"],
      intensity: 2,
      protein: "lean_fish",
      richness: 2,
    },
    terms: "esqueixada brandada",
  },

  // Vegetables, and the two Catalan ones that arrive off the coals.
  {
    contribution: {
      acidic: true,
      families: ["vegetables"],
      intensity: 2,
      protein: "vegetable",
      richness: 2,
    },
    terms: "gazpacho salmorejo ratatouille pisto samfaina trinxat minestrone boerenkool nicoise",
  },
  {
    contribution: {
      families: ["vegetables"],
      intensity: 3,
      protein: "vegetable",
      richness: 3,
      smoky: true,
    },
    terms: "escalivada calcots",
  },

  // Rice and pasta. A tomato ragù is sharp and savoury before it is meat.
  {
    contribution: {
      acidic: true,
      families: ["pasta_tomato"],
      intensity: 4,
      protein: "red_meat",
      richness: 4,
      umami: true,
    },
    terms: "bolognese ragu lasagna lasagne canelons cannelloni",
  },
  {
    contribution: {
      acidic: true,
      families: ["pasta_tomato"],
      intensity: 4,
      protein: "white_meat",
      richness: 4,
      umami: true,
    },
    terms: "amatriciana puttanesca",
  },
  {
    contribution: { acidic: true, families: ["pasta_tomato"], intensity: 3, richness: 2 },
    terms: "pomodoro napolitana arrabbiata",
  },
  {
    contribution: { families: ["rice"], intensity: 3, richness: 3 },
    terms: "paella risotto arroz arros riz reis riso rijst arroces",
  },
  {
    contribution: { intensity: 3, richness: 3 },
    terms: "fideua gnocchi polenta",
  },

  // Fried until it is mostly fat.
  {
    contribution: { families: ["fried_tapas"], intensity: 4, richness: 5, salty: true },
    terms:
      "tapas tapeo croquetas croqueta croquete bitterballen kroket arancini fritura " +
      "pescaito bravas bunuelos",
  },
  {
    contribution: { intensity: 4, richness: 5 },
    terms: "schnitzel francesinha pasty chips milanesa empanizado rebozado",
  },
  // Something salty before the meal, with a glass.
  {
    contribution: { families: ["aperitif"], intensity: 3, richness: 2, salty: true },
    terms:
      "aperitivo aperitiu aperitif apero aceitunas aceituna oliven olijven azeitonas almendras " +
      "ametlles amandes mandeln mandorle amandelen amendoas almonds nuts frutos_secos " +
      "fruits_secs noten",
  },

  // Sausage and the sour cabbage that usually comes with it.
  {
    contribution: { families: ["pork"], intensity: 4, protein: "white_meat", richness: 4 },
    terms: "bratwurst bangers eisbein kassler stamppot hutspot rookworst frikandel",
  },
  {
    contribution: {
      acidic: true,
      families: ["pork"],
      intensity: 4,
      protein: "white_meat",
      richness: 4,
    },
    terms: "choucroute sauerkraut chucrut",
  },
  {
    contribution: {
      families: ["spicy"],
      intensity: 4,
      protein: "white_meat",
      richness: 4,
      spicy: true,
    },
    terms: "currywurst",
  },

  // Desserts, by what the sources tell apart: chocolate, fruit, pastry.
  {
    contribution: {
      families: ["chocolate"],
      intensity: 5,
      protein: "none",
      richness: 4,
      sweet: true,
    },
    terms: "chocolate xocolata schokolade cioccolato chocola brownie cacao cocoa",
  },
  {
    contribution: {
      acidic: true,
      families: ["fruit_desserts"],
      intensity: 3,
      protein: "none",
      richness: 2,
      sweet: true,
    },
    terms:
      "fruit fruta fruita frutas fruites frutta obst fruits tatin clafoutis sorbet sorbete " +
      "pavlova crumble macedonia apple_pie tarta_manzana tarte_pommes",
  },
  {
    contribution: {
      families: ["pastries"],
      intensity: 2,
      protein: "none",
      richness: 3,
      sweet: true,
    },
    terms:
      "cake pastry pastel bizcocho hojaldre biscotti cantucci cantuccini galleta galletas " +
      "cookie cookies kuchen gebak koekjes bolo pastelaria croissant strudel stroopwafel " +
      "speculaas profiterol churros",
  },
  {
    contribution: { protein: "none", sweet: true },
    terms:
      "tiramisu trifle toffee catalana brulee panacotta flan natillas " +
      "dessert ice_cream tart postre tarta helado xocolata gelat dolc gateau glace patisserie " +
      "eis nachtisch torta gelato dolce taart ijs toetje sobremesa gelado doce",
  },

  // Flavours that override the protein.
  {
    contribution: { families: ["spicy"], spicy: true },
    terms:
      "spicy curry chili chilli hot picante guindilla harissa wasabi jalapeno picant " +
      "epice piquant scharf piccante pittig apimentado",
  },
  {
    contribution: { acidic: true },
    terms:
      "tomato lemon vinegar ceviche escabeche pickled citrus tomate limon vinagre encurtido " +
      "tomaquet llimona vinagre citron vinaigre zitrone essig pomodoro limone aceto sottaceto " +
      "tomaat citroen azijn limao",
  },
  // Pasta is a family only with the tomato that defines it (see `profileDish`).
  {
    contribution: { intensity: 3, pasta: true, richness: 2 },
    terms: "pasta spaghetti espaguetis macarrones penne tallarines",
  },
];

/** Words between the two halves of a pair, which say nothing about the dish. */
const linkWords = new Set([
  "a",
  "al",
  "and",
  "alla",
  "amb",
  "au",
  "aux",
  "con",
  "d",
  "da",
  "das",
  "de",
  "del",
  "der",
  "des",
  "di",
  "die",
  "do",
  "dos",
  "du",
  "e",
  "el",
  "en",
  "et",
  "het",
  "i",
  "la",
  "le",
  "les",
  "met",
  "mit",
  "of",
  "the",
  "van",
  "with",
  "und",
  "y",
]);

/**
 * The vocabulary split once, at load, instead of on every question.
 *
 * Terms under three characters are dropped here rather than guarded at each
 * comparison. A two-letter word is a preposition in some language on this list,
 * and writing a phrase into a token list once left `a` behind as a term, which
 * matched "à la mode".
 */
const entries = lexicon.map((entry) => {
  const terms = entry.terms.split(" ").filter(Boolean);
  return {
    contribution: entry.contribution,
    pairs: terms.filter((term) => term.includes("_")),
    terms: terms.filter((term) => !term.includes("_") && term.length >= 3),
  };
});

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
 * Five letters alone were not enough. "garnacha" shares five with "garnaal"
 * (Dutch for prawn) and a question about the grape became a shellfish dish;
 * "Catalunya" shares five with "catalana"; "cordelito" was read as lamb. A
 * diminutive differs from its word only after the word ends — "costill|itas",
 * "pechug|uita", "filet|ito" — so the shared opening must also cover the
 * shorter of the two but for, at most, its last letter. That keeps every
 * diminutive and drops the coincidences, which part company sooner.
 */
function matches(term: string, tokens: ReadonlySet<string>): boolean {
  if (tokens.has(term)) return true;
  if (term.length < stemLength) return false;
  for (const token of tokens) {
    if (token.length < stemLength) continue;
    let shared = 0;
    const limit = Math.min(token.length, term.length);
    while (shared < limit && token[shared] === term[shared]) shared += 1;
    if (shared < stemLength) continue;
    if (shared === limit) return true;
    // One letter short of the shorter word: a diminutive swaps a final vowel
    // ("costill|a" → "costill|itas"), never a consonant — "salmo|n" is not
    // "salmo|rejo".
    const shorter = token.length <= term.length ? token : term;
    if (shared === limit - 1 && "aeiou".includes(shorter[limit - 1]!)) return true;
  }
  return false;
}

const neutral: DishProfile = {
  acidic: false,
  earthy: false,
  families: [],
  intensity: 3,
  protein: "none",
  richness: 3,
  salty: false,
  smoky: false,
  spicy: false,
  sweet: false,
  sweetSavory: false,
  sweetWelcome: false,
  terms: [],
  umami: false,
};

/** A word and the singulars it might be the plural of. */
function forms(word: string): string[] {
  const all = [word];
  if (word.length > 4 && word.endsWith("es")) all.push(word.slice(0, -2));
  if (word.length > 3 && word.endsWith("s")) all.push(word.slice(0, -1));
  return all;
}

/**
 * Read a dish into the axes a pairing can be argued from.
 *
 * Every recognised word contributes, and the strongest claim wins on each axis:
 * "salmón salteado" is an oily fish (rich 4) cooked in fat (rich 4), and stays
 * rich 4 rather than averaging down to something neither word said. A protein
 * named later does not overwrite one named earlier, because the first noun in
 * "salmon with lentils" is usually the point of the plate.
 *
 * Pairs are read first, and their words are spent: "pescado azul" is an oily
 * fish and not also a lean one, and "fruits de mer" is not a fruit dessert.
 *
 * Recognises nothing? The profile comes back neutral with no terms, and the
 * caller is expected to notice and ask rather than guess.
 */
export function profileDish(dish: string): DishProfile {
  const words = normalizeWineText(dish).split(" ").filter(Boolean);
  if (words.length === 0) return neutral;

  // Neighbouring words, the little ones between them skipped, in every
  // singular they might stand for: "quesos azules" is "queso_azul" too.
  const content = words.filter((word) => !linkWords.has(word));
  const pairs = new Map<string, readonly [string, string]>();
  for (let index = 0; index + 1 < content.length; index += 1) {
    const left = content[index]!;
    const right = content[index + 1]!;
    for (const first of forms(left)) {
      for (const second of forms(right)) pairs.set(`${first}_${second}`, [left, right]);
    }
  }
  const spent = new Set<string>();
  const pairHits = new Map<(typeof entries)[number], string>();
  for (const entry of entries) {
    const hit = entry.pairs.find((pair) => pairs.has(pair));
    if (hit === undefined) continue;
    pairHits.set(entry, hit);
    for (const word of pairs.get(hit)!) spent.add(word);
  }

  // Singulars as well as what was typed. Readers write "ostras" and "gambas",
  // and a vocabulary that only knows "ostra" would quietly understand nothing
  // and then answer anyway. Crude on purpose: it costs a lookup, not a stemmer.
  const tokens = new Set(words.filter((word) => !spent.has(word)).flatMap(forms));

  let profile = { ...neutral, families: [] as DishFamily[], terms: [] as string[] };
  let proteinDecided = false;
  let pasta = false;
  // The loudest word decides, not the neutral middle: steamed hake is light,
  // and starting from 3 would have kept every plate at least moderate.
  let intensity: number | null = null;
  let richness: number | null = null;

  for (const entry of entries) {
    const hit = pairHits.get(entry) ?? entry.terms.find((term) => matches(term, tokens));
    if (hit === undefined) continue;
    profile.terms.push(hit);

    const contribution = entry.contribution;
    const { acidic, earthy, protein, salty, smoky, spicy, sweet } = contribution;
    if (protein !== undefined && (!proteinDecided || protein === "none")) {
      profile = { ...profile, protein };
      proteinDecided = true;
    }
    if (contribution.intensity !== undefined)
      intensity = Math.max(intensity ?? 0, contribution.intensity);
    if (contribution.richness !== undefined)
      richness = Math.max(richness ?? 0, contribution.richness);
    for (const family of contribution.families ?? []) {
      if (!profile.families.includes(family)) profile.families.push(family);
    }
    if (acidic === true) profile = { ...profile, acidic: true };
    if (earthy === true) profile = { ...profile, earthy: true };
    if (salty === true) profile = { ...profile, salty: true };
    if (smoky === true) profile = { ...profile, smoky: true };
    if (spicy === true) profile = { ...profile, spicy: true };
    if (sweet === true) profile = { ...profile, sweet: true };
    if (contribution.sweetSavory === true) profile = { ...profile, sweetSavory: true };
    if (contribution.sweetWelcome === true) profile = { ...profile, sweetWelcome: true };
    if (contribution.umami === true) profile = { ...profile, umami: true };
    if (contribution.pasta === true) pasta = true;
  }
  if (pasta && profile.acidic && !profile.families.includes("pasta_tomato")) {
    profile.families.push("pasta_tomato");
  }

  return {
    ...profile,
    intensity: intensity ?? neutral.intensity,
    richness: richness ?? neutral.richness,
  };
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
  if (profile.salty) parts.push("salty");
  if (profile.earthy) parts.push("earthy");
  if (profile.sweetSavory) parts.push("sweet-and-savoury");
  if (profile.umami) parts.push("savoury with umami");
  if (profile.sweet) parts.push("sweet");
  return parts.join(", ");
}
