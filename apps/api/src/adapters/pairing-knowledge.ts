/**
 * What the pairing rules stand on: every principle, every grape placed in a
 * style and every classic pairing, each with the sentence that says it.
 *
 * The rules in `local-pairing.ts` are an argument; this is its bibliography.
 * Nothing here is the rules' own invention: a principle is applied only where
 * an open source states it, a grape is listed under a style only where a
 * source names it there, and a dish is a style's classic only where a source
 * pairs them. `pnpm kb:check-pairing-sources` fetches every article and fails
 * if a quote is not in it, word for word — the same test the library's grapes
 * pass. Quotes from a grape's own article are checked against the library
 * (`data/kb/grapes.json`), which already cites it.
 *
 * What the sources do not say, the rules do not do. No open source states that
 * umami hardens tannin, so the rules no longer act on umami; soy-glazed and
 * sweet-sour dishes are held back from tannin by what the sources do say —
 * sweetness and spice both make tannin taste harsher.
 */

/** Wikipedia articles, by language and title. All CC BY-SA 4.0. */
export const pairingSources = {
  accordFr: { language: "fr", title: "Accord mets-vin" },
  amontilladoEs: { language: "es", title: "Amontillado" },
  banyulsEn: { language: "en", title: "Banyuls AOC" },
  banyulsFr: { language: "fr", title: "Banyuls (AOC)" },
  champagneEn: { language: "en", title: "Champagne" },
  finoEs: { language: "es", title: "Fino" },
  gewurztraminerEn: { language: "en", title: "Gewürztraminer" },
  jerezEs: { language: "es", title: "Jerez" },
  madeiraEn: { language: "en", title: "Madeira wine" },
  maridajeEs: { language: "es", title: "Maridaje" },
  moscatoEn: { language: "en", title: "Moscato d'Asti" },
  olorosoEs: { language: "es", title: "Oloroso" },
  pairingEn: { language: "en", title: "Wine and food pairing" },
  pairingUk: { language: "uk", title: "Поєднання вина та їжі" },
  portEn: { language: "en", title: "Port wine" },
  roseEn: { language: "en", title: "Rosé" },
  sauternesEn: { language: "en", title: "Sauternes (wine)" },
  sherryEn: { language: "en", title: "Sherry" },
  tokajiEn: { language: "en", title: "Tokaji" },
  wijnsuggestieNl: { language: "nl", title: "Wijnsuggestie" },
} as const satisfies Record<string, { language: string; title: string }>;

export type PairingSourceId = keyof typeof pairingSources;

export function pairingSourceUrl(id: PairingSourceId): string {
  const { language, title } = pairingSources[id];
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`;
}

/**
 * A sentence and where it is. `grape` instead of `source` means the grape's
 * own article, as the library holds it.
 */
export type Citation = Readonly<
  { grape: string; quote: string } | { quote: string; source: PairingSourceId }
>;

/** The rules the scoring applies, each as its source states it. */
export const pairingPrinciples = {
  acidFat: {
    quote:
      'In dishes that are fatty, oily, rich or salty, acidity in wine can "cut" (or standout and contrast) through the heaviness and be a refreshing change of pace on the palate.',
    source: "pairingEn",
  },
  acidMatch: {
    quote: "A wine that is less tart than the dish it is served with may taste thin and weak.",
    source: "pairingEn",
  },
  alcoholBody: {
    quote:
      "Alcohol is the primary factor in dictating a wine's weight and body. Typically the higher the alcohol level, the more weight the wine has.",
    source: "pairingEn",
  },
  alcoholHeat: {
    quote:
      "Conversely, the alcohol can also magnify the heat of spicy food, making a highly alcoholic wine paired with a spicy dish generate significant heat for the taster.",
    source: "pairingEn",
  },
  char: {
    quote:
      'Various cooking methods, such as grilling and blackening can add a bitter "char" component to the dish that allows it to play well with a tannic wine, while fish oils can make tannic wines taste metallic or off.',
    source: "pairingEn",
  },
  earthy: {
    quote:
      "The first strategy tries to bring wine together with dishes that complement each other such as an earthy, Burgundian Pinot noir with an earthy, mushroom dish.",
    source: "pairingEn",
  },
  hardCheese: {
    quote:
      "In contrast, hard cheeses such as cheddar can soften the tannins in wines and make them taste fuller and fruitier.",
    source: "pairingEn",
  },
  noProtein: {
    quote:
      "In the absence of protein from the food, such as some vegetarian dishes, the tannins react with the proteins on the tongue and sides of the mouth – accentuating the astringency and having a drying effect on the palate.",
    source: "pairingEn",
  },
  protein: {
    quote:
      "When paired with dishes that are high in proteins and fats (such as red meat and hard cheeses), the tannins bind to the proteins and come across as softer.",
    source: "pairingEn",
  },
  saltAlcohol: {
    quote:
      'In food and wine pairing, salt and spicy heat accentuates the alcohol and the perception of "heat" or hotness in the mouth.',
    source: "pairingEn",
  },
  saltSweet: {
    quote:
      "It can accentuate the mild sweetness in some foods and can also contrast with salt such as the European custom of pairing salty Stilton cheese with a sweet Port.",
    source: "pairingEn",
  },
  spiceSweetTannin: {
    quote:
      "Spicy and sweet foods can accentuate the dry, bitterness of tannins and make the wine seem to have off flavors.",
    source: "pairingEn",
  },
  sweeter: {
    quote: "Sweet wines often need to be sweeter than the dish they are served with.",
    source: "pairingEn",
  },
  sweetHeat: {
    quote: "In food pairings, sweetness balances spice and heat.",
    source: "pairingEn",
  },
  sweetSour: {
    quote:
      "Sweetness in a wine can balance tartness in food, especially if the food has some sweetness (such as dishes with sweet and sour sauces).",
    source: "pairingEn",
  },
  versatile: {
    quote:
      'Los cavas pueden utilizarse a lo largo de toda la comida con independencia del plato, debiendo ser preferentemente muy seco (tipo "brut").',
    source: "maridajeEs",
  },
  weight: {
    quote:
      'While there are many books, magazines and websites with detailed guidelines on how to pair food and wine, most food and wine experts believe that the most basic element of food and wine pairing is understanding the balance between the "weight" of the food and the weight (or body) of the wine.',
    source: "pairingEn",
  },
} as const satisfies Record<string, Citation>;

export type PairingPrinciple = keyof typeof pairingPrinciples;

/**
 * Kinds of dish, in the order a grape's card lists them. Each is a family a
 * source speaks of, not a recipe: "lamb", "blue cheese", "chocolate desserts".
 */
export const dishFamilyOrder = [
  "red_meat",
  "lamb",
  "game",
  "stews",
  "barbecue",
  "poultry",
  "pork",
  "cream_sauces",
  "cured_meats",
  "foie_gras",
  "white_fish",
  "oily_fish",
  "shellfish",
  "rich_shellfish",
  "oysters",
  "sushi",
  "rice",
  "pasta_tomato",
  "pizza",
  "legumes",
  "eggs",
  "mushrooms",
  "vegetables",
  "spicy",
  "asian",
  "fried_tapas",
  "aperitif",
  "fresh_cheese",
  "soft_cheese",
  "aged_cheese",
  "blue_cheese",
  "fruit_desserts",
  "pastries",
  "chocolate",
] as const;

export type DishFamily = (typeof dishFamilyOrder)[number];

/** The rules' wine styles, by code. Their shapes are in `local-pairing.ts`. */
export type StyleCode =
  | "crisp_atlantic_white"
  | "dry_aromatic_white"
  | "dry_fortified_saline"
  | "dry_rose"
  | "full_structured_red"
  | "light_crisp_white"
  | "light_red_low_tannin"
  | "medium_bodied_red"
  | "nutty_fortified"
  | "off_dry_aromatic_white"
  | "off_dry_sparkling"
  | "full_bodied_white"
  | "ripe_fruit_forward_red"
  | "sharp_herbaceous_white"
  | "skin_contact_white"
  | "sweet_fortified"
  | "sweet_late_harvest_white"
  | "traditional_method_sparkling"
  | "unoaked_chardonnay";

/**
 * A pairing a source names: these styles with these kinds of dish. Several
 * sources naming the same pair count for more than one (see `local-pairing`).
 */
export type ClassicPairing = Readonly<{
  cite: Citation;
  families: readonly DishFamily[];
  styles: readonly StyleCode[];
}>;

const lightDryWhites = [
  "light_crisp_white",
  "crisp_atlantic_white",
  "sharp_herbaceous_white",
  "unoaked_chardonnay",
] as const satisfies readonly StyleCode[];

export const classicPairings: readonly ClassicPairing[] = [
  // Wine and food pairing (en)
  {
    cite: {
      quote:
        "The red wines of regions such as Bordeaux, Greece, Rioja, Ribera del Duero, Rhone and Provence are considered classic pairings with the lamb dishes found in the local cuisines of those regions.",
      source: "pairingEn",
    },
    families: ["lamb"],
    styles: ["full_structured_red", "medium_bodied_red"],
  },
  {
    cite: {
      quote:
        "Soft, rindless cheeses that have not been aged usually sport a delicate texture and mild, tangy flavor, which go best with dry or even off-dry white wines, along with light-bodied red wines and rosés.",
      source: "pairingEn",
    },
    families: ["fresh_cheese"],
    styles: [
      ...lightDryWhites,
      "dry_aromatic_white",
      "off_dry_aromatic_white",
      "light_red_low_tannin",
      "dry_rose",
    ],
  },
  {
    cite: {
      quote:
        "For example, fresh mozzarella or burrata can pair well with Italian Pinot Grigio, while a fresh goat cheese pair nicely with Riesling from the Finger Lakes or Germany.",
      source: "pairingEn",
    },
    families: ["fresh_cheese"],
    styles: ["light_crisp_white", "dry_aromatic_white"],
  },
  {
    cite: {
      quote:
        "Creamy cheeses with a bloomy rind, like Camembert or Brie, are compatible with a traditional method sparkling wine, like Champagne or Cava.",
      source: "pairingEn",
    },
    families: ["soft_cheese"],
    styles: ["traditional_method_sparkling"],
  },
  {
    cite: {
      quote:
        "And finally, hard cheeses with some age on them, like a nutty Parmesan or Cheddar tend to go with equally nuanced and nutty Sherry or a full-bodied and complex red wine, like a Bordeaux or Barolo.",
      source: "pairingEn",
    },
    families: ["aged_cheese"],
    styles: ["nutty_fortified", "full_structured_red"],
  },
  {
    cite: {
      quote:
        'Another older idea was "to pair strong cheeses with strong wines," for example, asiago, a sharply flavored cheese, with Zinfandel, a dark red wine with fruit tones.',
      source: "pairingEn",
    },
    families: ["aged_cheese"],
    styles: ["ripe_fruit_forward_red"],
  },
  { cite: pairingPrinciples.earthy, families: ["mushrooms"], styles: ["light_red_low_tannin"] },
  {
    cite: {
      quote:
        'The second strategy operates under the truism that "opposites attract" and brings together food and wine that have contrasting traits such as a crisp, acidic Sauvignon blanc and a fish with a creamy lemon sauce.',
      source: "pairingEn",
    },
    families: ["cream_sauces"],
    styles: ["sharp_herbaceous_white"],
  },
  {
    cite: {
      quote:
        "While poached fish is usually light bodied and better served with a light white, if the fish is served with a heavy cream sauce it could be better balanced with a fuller bodied white wine or light red.",
      source: "pairingEn",
    },
    families: ["cream_sauces"],
    styles: ["full_bodied_white", "light_red_low_tannin"],
  },
  { cite: pairingPrinciples.saltSweet, families: ["blue_cheese"], styles: ["sweet_fortified"] },

  // Accord mets-vin (fr)
  {
    cite: {
      quote:
        "cabernet sauvignon : s'accorde bien avec les viandes rouges grillées, comme un steak ou un agneau rôti ;",
      source: "accordFr",
    },
    families: ["red_meat", "lamb"],
    styles: ["full_structured_red"],
  },
  {
    cite: {
      quote:
        "pinot noir : excellent avec des volailles rôties ou des plats à base de champignons ;",
      source: "accordFr",
    },
    families: ["poultry", "mushrooms"],
    styles: ["light_red_low_tannin"],
  },
  {
    cite: {
      quote: "syrah : idéal pour les viandes épicées ou les plats à base de sauce barbecue.",
      source: "accordFr",
    },
    families: ["barbecue"],
    styles: ["full_structured_red"],
  },
  {
    cite: {
      quote:
        "chardonnay : se marie avec des plats riches comme le homard, le crabe, ou un poulet à la crème ;",
      source: "accordFr",
    },
    families: ["rich_shellfish", "cream_sauces"],
    styles: ["full_bodied_white", "unoaked_chardonnay"],
  },
  {
    cite: {
      quote:
        "sauvignon blanc : parfait avec les fruits de mer, les salades et les plats frais à base de légumes ;",
      source: "accordFr",
    },
    families: ["shellfish", "vegetables"],
    styles: ["sharp_herbaceous_white"],
  },
  {
    cite: {
      quote:
        "riesling : accompagne bien les plats épicés de la cuisine asiatique, comme un curry thaïlandais.",
      source: "accordFr",
    },
    families: ["spicy", "asian"],
    styles: ["dry_aromatic_white", "off_dry_aromatic_white"],
  },
  {
    cite: {
      quote:
        "Ils s’accordent particulièrement bien avec des fromages affinés (comme le comté, le gruyère ou le roquefort), des plats épicés (curry, tajines, cuisine indienne), des viandes blanches en sauce, ainsi que des produits de charcuterie.",
      source: "accordFr",
    },
    families: ["aged_cheese", "blue_cheese", "spicy", "cream_sauces", "cured_meats"],
    styles: ["skin_contact_white"],
  },
  {
    cite: {
      quote:
        "Ils se marient avec des viandes blanches, des salades, ou des plats de poisson grillé.",
      source: "accordFr",
    },
    families: ["poultry", "pork", "vegetables", "white_fish", "oily_fish"],
    styles: ["dry_rose"],
  },
  {
    cite: {
      quote:
        "sauternes : idéal avec des fromages bleus ou des desserts à base de fruits, comme une tarte aux pommes ou une crème brûlée.",
      source: "accordFr",
    },
    families: ["blue_cheese", "fruit_desserts"],
    styles: ["sweet_late_harvest_white"],
  },
  {
    cite: {
      quote:
        "Les vins effervescents, comme le champagne ou les crémants, accompagnent aussi bien l’apéritif que les plats.",
      source: "accordFr",
    },
    families: ["aperitif"],
    styles: ["traditional_method_sparkling"],
  },
  {
    cite: {
      quote:
        "Le champagne brut se marie avec les fruits de mer et les poissons, tandis que les champagnes rosés ou demi-secs peuvent accompagner des plats épicés ou des desserts aux fruits.",
      source: "accordFr",
    },
    families: ["shellfish", "white_fish", "oily_fish"],
    styles: ["traditional_method_sparkling"],
  },
  {
    cite: {
      quote:
        "Le champagne brut se marie avec les fruits de mer et les poissons, tandis que les champagnes rosés ou demi-secs peuvent accompagner des plats épicés ou des desserts aux fruits.",
      source: "accordFr",
    },
    families: ["spicy", "fruit_desserts"],
    styles: ["off_dry_sparkling"],
  },
  {
    cite: {
      quote: "Les crémants conviennent aux entrées, aux viandes blanches ou aux fromages frais.",
      source: "accordFr",
    },
    families: ["poultry", "pork", "fresh_cheese"],
    styles: ["traditional_method_sparkling"],
  },
  {
    cite: {
      quote:
        "le sucré : les plats sucrés, comme les desserts, se marient bien avec des vins doux ou liquoreux (par exemple, un sauternes pour un foie gras ou un vin de dessert pour un gâteau au chocolat) ;",
      source: "accordFr",
    },
    families: ["foie_gras"],
    styles: ["sweet_late_harvest_white"],
  },
  {
    cite: {
      quote:
        "le sucré : les plats sucrés, comme les desserts, se marient bien avec des vins doux ou liquoreux (par exemple, un sauternes pour un foie gras ou un vin de dessert pour un gâteau au chocolat) ;",
      source: "accordFr",
    },
    families: ["chocolate"],
    styles: ["sweet_fortified", "sweet_late_harvest_white"],
  },
  {
    cite: {
      quote:
        "le vin rouge de Bourgogne se marie traditionnellement avec les viandes blanches ou les plats à base de champignons, ce qui reflète les traditions culinaires de cette région.",
      source: "accordFr",
    },
    families: ["poultry", "pork", "mushrooms"],
    styles: ["light_red_low_tannin", "medium_bodied_red"],
  },
  {
    cite: {
      quote:
        "le vin de Provence, qu'il soit blanc ou rosé, est associé à la cuisine méditerranéenne, incluant les poissons grillés et les plats à base d'herbes et d'ail.",
      source: "accordFr",
    },
    families: ["white_fish", "oily_fish"],
    styles: ["dry_rose"],
  },
  {
    cite: {
      quote: "le sancerre avec le crottin de Chavignol, tous deux produits dans le Sancerrois.",
      source: "accordFr",
    },
    families: ["fresh_cheese"],
    styles: ["sharp_herbaceous_white"],
  },
  {
    cite: {
      quote:
        "l'acidité : l'acidité du vin joue un rôle clé dans l'accord mets-vin. Les vins acides, comme le sauvignon blanc ou le pinot noir, peuvent bien se marier avec des plats acides (comme les salades, les tomates ou les agrumes) car l'acidité du vin équilibre celle du plat ;",
      source: "accordFr",
    },
    families: ["vegetables", "pasta_tomato"],
    styles: ["sharp_herbaceous_white", "light_red_low_tannin"],
  },

  // Maridaje (es)
  {
    cite: { quote: "Los vinos generosos acompañan bien un aperitivo.", source: "maridajeEs" },
    families: ["aperitif"],
    styles: ["dry_fortified_saline", "nutty_fortified"],
  },
  {
    cite: {
      quote:
        "Los vinos tintos ligeros (jóvenes) acompañan muy bien al cordero asado, a la carne de ternera, a la de ave, las pastas, las verduras, la paella, los embutidos, los huevos fritos, el jamón y las sopas con base de carne.",
      source: "maridajeEs",
    },
    families: [
      "lamb",
      "red_meat",
      "poultry",
      "pasta_tomato",
      "vegetables",
      "rice",
      "cured_meats",
      "eggs",
    ],
    styles: ["light_red_low_tannin"],
  },
  {
    cite: {
      quote:
        "Los vinos tintos de cuerpo (crianza, reserva, gran reserva) van muy bien con los guisos y los estofados, el buey, los platos a base de caza, las legumbres, y los quesos fuertes y fermentados.",
      source: "maridajeEs",
    },
    families: ["stews", "red_meat", "game", "legumes", "aged_cheese"],
    styles: ["full_structured_red", "medium_bodied_red"],
  },
  {
    cite: {
      quote:
        "Los vinos blancos secos ligeros son complemento perfecto de las ostras, la langosta a la plancha, los langostinos, las gambas, los cangrejos de río y los mariscos en general.",
      source: "maridajeEs",
    },
    families: ["oysters", "rich_shellfish", "shellfish"],
    styles: lightDryWhites,
  },
  {
    cite: {
      quote:
        "Los vinos blancos secos son los acompañantes ideales de los calamares, los pescados cocidos en general, los fritos o asados, el centollo, la langosta cocida con mayonesa, el jamón, las chuletas de cordero, los caracoles, las sopas con base de pescado y los huevos.",
      source: "maridajeEs",
    },
    // The lamb chops are left out: the family is lamb as a roast, which the
    // same article gives to red wine.
    families: ["shellfish", "white_fish", "fried_tapas", "rich_shellfish", "cured_meats", "eggs"],
    styles: [...lightDryWhites, "dry_aromatic_white"],
  },
  {
    cite: {
      quote:
        'Los vinos dulces son excelentes para acompañar los postres con chocolate, los hojaldres y los bizcochos (el foie-gras puede acompañarse por un vino blanco dulce tipo "sauternes").',
      source: "maridajeEs",
    },
    families: ["chocolate", "pastries"],
    styles: ["sweet_fortified", "sweet_late_harvest_white"],
  },
  {
    cite: {
      quote:
        'Los vinos dulces son excelentes para acompañar los postres con chocolate, los hojaldres y los bizcochos (el foie-gras puede acompañarse por un vino blanco dulce tipo "sauternes").',
      source: "maridajeEs",
    },
    families: ["foie_gras"],
    styles: ["sweet_late_harvest_white"],
  },

  // Sherry (es)
  {
    cite: {
      quote: "Es ideal como aperitivo y para acompañar jamón, mariscos y otras tapas.",
      source: "finoEs",
    },
    families: ["aperitif", "cured_meats", "shellfish", "fried_tapas"],
    styles: ["dry_fortified_saline"],
  },
  {
    cite: {
      quote:
        "El amontillado hace maridaje con los quesos curados, sopas, consomés, el pescado azul y las carnes blancas.",
      source: "jerezEs",
    },
    families: ["aged_cheese", "oily_fish", "poultry"],
    styles: ["nutty_fortified"],
  },
  {
    cite: {
      quote:
        "También se puede tomar con quesos fuertes: quesos curados y quesos azules o con un puro habano en la sobremesa.",
      source: "amontilladoEs",
    },
    families: ["aged_cheese", "blue_cheese"],
    styles: ["nutty_fortified"],
  },
  {
    cite: {
      quote:
        "Es un vino para tomar como aperitivo, abre el apetito y sirve para acompañar cualquier tentempié, aunque los entendidos gustan de tomarlo acompañando platos como la caza, setas, y carnes de cazuela.",
      source: "olorosoEs",
    },
    families: ["aperitif", "game", "mushrooms", "stews"],
    styles: ["nutty_fortified"],
  },
  {
    cite: {
      quote: "El Pedro Ximénez, acompaña a los dulces y a los quesos azules.",
      source: "jerezEs",
    },
    families: ["pastries", "blue_cheese"],
    styles: ["sweet_fortified"],
  },

  // Wijnsuggestie (nl)
  {
    cite: {
      quote: "Paté van ganzenlever of Roquefort met een wijn uit de Sauternais of soortgelijke",
      source: "wijnsuggestieNl",
    },
    families: ["foie_gras", "blue_cheese"],
    styles: ["sweet_late_harvest_white"],
  },
  {
    cite: { quote: "Geitenkaas met Sancerre of soortgelijke", source: "wijnsuggestieNl" },
    families: ["fresh_cheese"],
    styles: ["sharp_herbaceous_white"],
  },
  {
    cite: { quote: "Oude belegen kaas of Stilton met gelagerde port", source: "wijnsuggestieNl" },
    families: ["aged_cheese", "blue_cheese"],
    styles: ["sweet_fortified"],
  },
  {
    cite: {
      quote: "Gekruid eten (bijvoorbeeld uit de Aziatische keuken) met Gewürztraminer-wijn",
      source: "wijnsuggestieNl",
    },
    families: ["spicy", "asian"],
    styles: ["dry_aromatic_white", "off_dry_aromatic_white"],
  },
  {
    cite: { quote: "Oesters met Champagne", source: "wijnsuggestieNl" },
    families: ["oysters"],
    styles: ["traditional_method_sparkling"],
  },
  {
    cite: { quote: "Zalm met chardonnay", source: "wijnsuggestieNl" },
    families: ["oily_fish"],
    styles: ["unoaked_chardonnay", "full_bodied_white"],
  },
  {
    cite: { quote: "Salade niçoise met Provençaalse roséwijn", source: "wijnsuggestieNl" },
    families: ["vegetables"],
    styles: ["dry_rose"],
  },

  // Поєднання вина та їжі (uk)
  {
    cite: { quote: "до вершкових соусів пасує насичене вино, як шардоне;", source: "pairingUk" },
    families: ["cream_sauces"],
    styles: ["full_bodied_white"],
  },
  {
    cite: {
      quote: "до соусів песто, чи на основі томатів пасуватимуть легкі, білі сухі вина.",
      source: "pairingUk",
    },
    families: ["pasta_tomato"],
    styles: ["light_crisp_white", "crisp_atlantic_white", "sharp_herbaceous_white"],
  },

  // The wines' own articles
  {
    cite: {
      quote:
        "Port is commonly served after meals as a dessert wine in English-speaking countries, often with cheese, nuts, or chocolate; white and tawny ports are often served as an apéritif.",
      source: "portEn",
    },
    families: ["chocolate", "aged_cheese", "blue_cheese"],
    styles: ["sweet_fortified"],
  },
  {
    cite: {
      quote:
        "Port is commonly served after meals as a dessert wine in English-speaking countries, often with cheese, nuts, or chocolate; white and tawny ports are often served as an apéritif.",
      source: "portEn",
    },
    families: ["aperitif"],
    styles: ["nutty_fortified"],
  },
  {
    cite: {
      quote:
        "Madeira is produced in a variety of styles ranging from dry wines, which can be consumed on their own, as an apéritif, to sweet wines usually consumed with dessert.",
      source: "madeiraEn",
    },
    families: ["aperitif"],
    styles: ["nutty_fortified"],
  },
  {
    cite: {
      quote:
        "Les VDN banyuls sont d'abord des vins de dessert qui se marient bien avec le chocolat ou les fromages bleus.",
      source: "banyulsFr",
    },
    families: ["chocolate", "blue_cheese"],
    styles: ["sweet_fortified"],
  },
  {
    cite: { quote: "Foie gras is a classic match.", source: "sauternesEn" },
    families: ["foie_gras"],
    styles: ["sweet_late_harvest_white"],
  },
  {
    cite: {
      quote:
        "They are ideal accompaniments for Asian cuisine (such as Thai or Indian), spicy dishes, white fresh cheeses, or dishes with bittersweet flavors.",
      source: "gewurztraminerEn",
    },
    families: ["asian", "spicy", "fresh_cheese"],
    styles: ["dry_aromatic_white", "off_dry_aromatic_white"],
  },
  {
    cite: {
      quote:
        "The rosés of Provence are often known for their food and wine pairing matches with the local Mediterranean cuisine of the region, particularly the garlicky aioli sauces and tangy bouillabaisse stews that are the hallmark of Provençal cuisine.",
      source: "roseEn",
    },
    families: ["white_fish"],
    styles: ["dry_rose"],
  },
  {
    cite: {
      quote: "The wine is sweet and low in alcohol, and is considered a dessert wine.",
      source: "moscatoEn",
    },
    families: ["fruit_desserts", "pastries"],
    styles: ["off_dry_sparkling"],
  },
  // A grape's own article, where it speaks of the style rather than the grape.
  {
    cite: {
      grape: "dolcetto",
      quote:
        "Overall, Dolcetto is considered a light easy drinking red wine that pairs well with pastas and pizza dishes",
    },
    families: ["pasta_tomato", "pizza"],
    styles: ["light_red_low_tannin"],
  },
];

/**
 * Why each grape is listed under its style: a sentence naming it there, in a
 * source about the style or in the grape's own article.
 */
export const styleGrapeCitations: Readonly<
  Record<StyleCode, ReadonlyArray<Readonly<{ cite: Citation; grapes: readonly string[] }>>>
> = {
  crisp_atlantic_white: [
    {
      cite: {
        quote:
          "Oaked Sauvignon blanc, Alsatian wines, Albarino, White Bordeaux (Semillon), White Burgundy, Rhone whites (Viognier, Roussanne, Marsanne), Tămâioasă Românească and New World Chardonnay",
        source: "pairingEn",
      },
      grapes: ["Albariño"],
    },
  ],
  dry_aromatic_white: [
    {
      cite: {
        grape: "riesling",
        quote: "It is used to make dry, semi-sweet, sweet, and sparkling white wines",
      },
      grapes: ["Riesling"],
    },
    {
      cite: {
        quote:
          "Styles of Gewurztraminer d'Alsace range from the very dry Trimbach house style to the very sweet.",
        source: "gewurztraminerEn",
      },
      grapes: ["Gewürztraminer"],
    },
  ],
  dry_fortified_saline: [
    {
      cite: {
        quote:
          "Sherry is a drink produced in a variety of styles made primarily from the Palomino grape, ranging from light versions similar to white table wines, such as Manzanilla and fino, to darker and heavier versions that have been allowed to oxidise as they age in barrel, such as Amontillado and oloroso.",
        source: "sherryEn",
      },
      grapes: ["Palomino"],
    },
  ],
  dry_rose: [
    {
      cite: {
        quote:
          "While the AOC produces mostly red wines, at least 33% of its yearly production is made up of rosé wines with Grenache, Cinsault, Syrah and Carignan playing supporting roles to Mourvedre.",
        source: "roseEn",
      },
      grapes: ["Mourvèdre", "Grenache", "Cinsault", "Syrah", "Carignan"],
    },
  ],
  full_structured_red: [
    {
      cite: {
        quote: "Syrah, Brunello di Montalcino, Cabernet Sauvignon, Port, Barbaresco and Barolo",
        source: "pairingEn",
      },
      grapes: ["Cabernet Sauvignon", "Syrah"],
    },
    {
      cite: {
        grape: "nebbiolo",
        quote:
          "where it makes the Denominazione di Origine Controllata e Garantita (DOCG) wines of Barolo, Barbaresco",
      },
      grapes: ["Nebbiolo"],
    },
    {
      cite: { grape: "sangiovese", quote: "Brunello di Montalcino" },
      grapes: ["Sangiovese"],
    },
  ],
  light_crisp_white: [
    {
      cite: {
        quote:
          "Pinot gris, Pinot blanc, Riesling, Sauvignon blanc, Chablis, Champagne and sparkling wines, Gruner Veltliner, Vinho Verde, Muscadet",
        source: "pairingEn",
      },
      grapes: ["Pinot Gris", "Pinot Blanc", "Grüner Veltliner"],
    },
    {
      cite: {
        grape: "melon-de-bourgogne",
        quote: "used solely in the production of the light dry white wine Muscadet",
      },
      grapes: ["Melon de Bourgogne"],
    },
    {
      cite: { grape: "loureira", quote: "a sub-region of Vinho Verde" },
      grapes: ["Loureira"],
    },
    {
      cite: {
        grape: "arinto",
        quote: "planted primarily in the Bucelas, Tejo and Vinho Verde regions",
      },
      grapes: ["Arinto"],
    },
  ],
  light_red_low_tannin: [
    {
      cite: { quote: "Beaujolais, Dolcetto, some Pinot noir", source: "pairingEn" },
      grapes: ["Pinot Noir", "Dolcetto"],
    },
  ],
  medium_bodied_red: [
    {
      cite: {
        quote:
          "Chianti, Barbera, Burgundy, Chinon, Rioja, Cabernet franc, Merlot, Malbec, Zinfandel, some Pinot noir",
        source: "pairingEn",
      },
      grapes: ["Barbera", "Cabernet Franc", "Merlot", "Malbec", "Zinfandel", "Pinot Noir"],
    },
    {
      cite: { grape: "sangiovese", quote: "Chianti Classico, Chianti" },
      grapes: ["Sangiovese"],
    },
    {
      cite: {
        grape: "tempranillo",
        quote: "The two major regions that grow Tempranillo are Rioja",
      },
      grapes: ["Tempranillo"],
    },
  ],
  nutty_fortified: [
    {
      cite: {
        quote:
          "Sherry is a drink produced in a variety of styles made primarily from the Palomino grape, ranging from light versions similar to white table wines, such as Manzanilla and fino, to darker and heavier versions that have been allowed to oxidise as they age in barrel, such as Amontillado and oloroso.",
        source: "sherryEn",
      },
      grapes: ["Palomino"],
    },
    {
      cite: {
        quote:
          "The four major white grape varieties used for Madeira production are (from sweetest to driest) Malvasia, Bual, Verdelho, and Sercial.",
        source: "madeiraEn",
      },
      grapes: ["Sercial", "Verdelho", "Boal"],
    },
  ],
  off_dry_aromatic_white: [
    {
      cite: {
        grape: "riesling",
        quote: "It is used to make dry, semi-sweet, sweet, and sparkling white wines",
      },
      grapes: ["Riesling"],
    },
    {
      cite: {
        quote:
          "The variety has high natural sugar and the wines are white and usually off-dry, with a flamboyant bouquet of lychees.",
        source: "gewurztraminerEn",
      },
      grapes: ["Gewürztraminer"],
    },
  ],
  off_dry_sparkling: [
    {
      cite: {
        quote:
          "Piedmont winemakers traditionally make this low alcohol wine with Muscat à Petits Grains, also known as Moscato bianco.",
        source: "moscatoEn",
      },
      grapes: ["Muscat Blanc à Petits Grains"],
    },
  ],
  full_bodied_white: [
    {
      cite: {
        quote:
          "Oaked Sauvignon blanc, Alsatian wines, Albarino, White Bordeaux (Semillon), White Burgundy, Rhone whites (Viognier, Roussanne, Marsanne), Tămâioasă Românească and New World Chardonnay",
        source: "pairingEn",
      },
      grapes: ["Chardonnay", "Sémillon", "Viognier", "Roussanne", "Marsanne"],
    },
  ],
  ripe_fruit_forward_red: [
    {
      cite: {
        quote:
          'Another older idea was "to pair strong cheeses with strong wines," for example, asiago, a sharply flavored cheese, with Zinfandel, a dark red wine with fruit tones.',
        source: "pairingEn",
      },
      grapes: ["Zinfandel"],
    },
  ],
  sharp_herbaceous_white: [
    {
      cite: {
        quote:
          "Pinot gris, Pinot blanc, Riesling, Sauvignon blanc, Chablis, Champagne and sparkling wines, Gruner Veltliner, Vinho Verde, Muscadet",
        source: "pairingEn",
      },
      grapes: ["Sauvignon Blanc"],
    },
  ],
  skin_contact_white: [
    {
      cite: {
        grape: "rkatsiteli",
        quote:
          "Кахетинские виноделы традиционно использовали ркацители для выработки в кувшинах (квеври) янтарных (оранжевых) вин",
      },
      grapes: ["Rkatsiteli"],
    },
    {
      cite: {
        grape: "kisi",
        quote: "используемый для производства янтарных (оранжевых) и белых вин в Грузии",
      },
      grapes: ["Kisi"],
    },
  ],
  sweet_fortified: [
    {
      cite: {
        quote:
          "Over a hundred varieties of grapes (castas) are sanctioned for port production, although only five (Tinta Barroca, Tinto Cão, Tinta Roriz (Tempranillo), Touriga Francesa, and Touriga Nacional) are widely cultivated and used.",
        source: "portEn",
      },
      grapes: ["Touriga Nacional", "Touriga Francesa", "Tinta Barroca", "Tinto Cão", "Tinta Roriz"],
    },
    {
      cite: {
        quote:
          "Permitted grape varieties are Grenache noir (at least 50%, 75% for the Grand Cru), Grenache gris, Grenache blanc and Carignan, and also (but rarely used) Macabeu, Muscat and Malvoisie.",
        source: "banyulsEn",
      },
      grapes: ["Grenache"],
    },
    {
      cite: {
        quote:
          "Sweet dessert wines are also made from Pedro Ximénez or Moscatel grapes, and are sometimes blended with Palomino-based sherries.",
        source: "sherryEn",
      },
      grapes: ["Pedro Ximénez"],
    },
  ],
  sweet_late_harvest_white: [
    {
      cite: {
        quote:
          "Sauternes wine is made from Sémillon, sauvignon blanc, and muscadelle grapes that have been affected by Botrytis cinerea, also known as noble rot.",
        source: "sauternesEn",
      },
      grapes: ["Sémillon", "Sauvignon Blanc", "Muscadelle"],
    },
    {
      cite: {
        quote:
          "Furmint accounts for 60% of the area and is by far the most important grape in the production of Aszú wines. Hárslevelű accounts for a further 30%.",
        source: "tokajiEn",
      },
      grapes: ["Furmint", "Hárslevelű"],
    },
    {
      cite: {
        grape: "riesling",
        quote: "It is used to make dry, semi-sweet, sweet, and sparkling white wines",
      },
      grapes: ["Riesling"],
    },
    {
      cite: {
        quote:
          "The variety's high natural sugar means that it is popular for making dessert wine, both vendange tardive and the noble rot-affected Sélection de Grains Nobles.",
        source: "gewurztraminerEn",
      },
      grapes: ["Gewürztraminer"],
    },
  ],
  traditional_method_sparkling: [
    {
      cite: {
        quote:
          "The grapes Pinot noir, Pinot meunier, and Chardonnay are used to produce almost all champagne, but small amounts of Pinot blanc, Pinot gris (called Fromenteau in Champagne), Arbane, Chardonnay rosé, and Petit Meslier are vinified as well.",
        source: "champagneEn",
      },
      grapes: ["Chardonnay", "Pinot Noir", "Pinot Meunier"],
    },
    {
      cite: {
        grape: "parellada",
        quote: "it is one of the three traditional varieties used to make the sparkling wine Cava",
      },
      grapes: ["Parellada"],
    },
    {
      cite: {
        grape: "xarel-lo",
        quote:
          "historically the grape was only produced as part of regional blend in Penedès and Cava",
      },
      grapes: ["Xarel·lo"],
    },
    {
      cite: { grape: "macabeo", quote: "the Cava producing areas south of Barcelona" },
      grapes: ["Macabeo"],
    },
  ],
  unoaked_chardonnay: [
    {
      cite: {
        grape: "chardonnay",
        quote: "from the lean, crispy mineral wines of Chablis",
      },
      grapes: ["Chardonnay"],
    },
  ],
};

/**
 * The library's id for a grape named in a citation: its English name as a
 * slug, except where the source calls it by another of its names.
 */
const grapeAliases: Readonly<Record<string, string>> = {
  Cinsault: "cinsaut",
  "Tinta Roriz": "tempranillo",
  "Tinto Cão": "tinta-cao",
};

export function libraryGrapeId(name: string): string {
  return (
    grapeAliases[name] ??
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}
