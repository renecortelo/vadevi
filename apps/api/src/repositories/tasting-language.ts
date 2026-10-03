import { normalizeWineText } from "./wine-memory";

/**
 * The sentences of a wine's research that are about the glass.
 *
 * Research brings what the producer's pages say, and most of it is about the
 * estate — its varieties, its brands, its history — or about when to drink
 * the wine ("perfect for an afternoon glass"), none of which a tasting can be
 * set against. Handed to the model whole, the comparison set the reader's
 * tasting against a recommendation for the afternoon. Only sentences in the
 * language of tasting are kept — nose, palate, colour, structure, the aromas
 * and flavours themselves — and those naming a dish the pairing rules know;
 * if none is left, the comparison stands on the grapes alone.
 *
 * Word beginnings, accents set aside, in the eight languages. Plain colour
 * words that name the type ("red", "tinto", "blanc") are not among them: a
 * red wine being red says nothing about how it tastes.
 */
/** Unambiguous on their own: a sentence with one of these is about the glass. */
const strongStems = [
  "aroma",
  "nariz",
  "nose",
  "olfat",
  "naso",
  "neus",
  "nase",
  "geur",
  "bouquet",
  "buque",
  "boca",
  "paladar",
  "palate",
  "bouche",
  "palato",
  "gaumen",
  "sabor",
  "flavo",
  "taste",
  "tasting",
  "gusto",
  "gout",
  "sapor",
  "smaak",
  "geschmack",
  "degust",
  "catad",
  "proef",
  "verkost",
  "acidez",
  "acidit",
  "acidity",
  "acide",
  "zuur",
  "saure",
  "tanin",
  "tannin",
  "cuerpo",
  "bodied",
  "corpul",
  "corpo",
  "korper",
  "estructur",
  "structur",
  "retrogust",
  "persisten",
  "finish",
  "astring",
  "perlage",
  "burbuj",
  "bubble",
];
/** Too short or too common to stand alone, so only as whole words. */
const strongWords = new Set(["nez", "mond", "cata", "catas", "body", "corps", "final", "finale"]);
/**
 * Descriptors — fruit, sweetness, oak, colour as described — which a sentence
 * about the estate may also use ("blanco, rosado, tinto y dulce" names types;
 * "textura arenosa" is the soil's), so two are needed. Plain colour words that name a type are not among them.
 */
const descriptorStems = [
  "color",
  "colour",
  "couleur",
  "colore",
  "kleur",
  "farbe",
  "rubi",
  "ruby",
  "granat",
  "garnet",
  "purpur",
  "violac",
  "dorad",
  "golden",
  "pajiz",
  "ambar",
  "amber",
  "brillant",
  "limpi",
  "equilibr",
  "balance",
  "sedos",
  "silk",
  "redond",
  "round",
  "fresc",
  "fresh",
  "frisch",
  "mineral",
  "salin",
  "dulc",
  "sweet",
  "doux",
  "dolce",
  "zoet",
  "suss",
  "seco",
  "dry",
  "secco",
  "droog",
  "trocken",
  "untuos",
  "elegan",
  "potent",
  "suave",
  "smooth",
  "amarg",
  "bitter",
  "intens",
  "textur",
  "ripe",
  "madur",
  "maturo",
  "rijp",
  "reif",
  "fruta",
  "fruit",
  "frutt",
  "frucht",
  "vrucht",
  "fruto",
  "nota",
  "note",
  "matiz",
  "especi",
  "spice",
  "spici",
  "epice",
  "spezi",
  "kruid",
  "madera",
  "roble",
  "oak",
  "wood",
  "fusta",
  "bois",
  "legno",
  "hout",
  "holz",
  "barrica",
  "barrique",
  "vainill",
  "vanill",
  "floral",
  "fleur",
  "fiore",
  "bloem",
  "blume",
  "tostad",
  "toast",
  "ahumad",
  "smok",
  "regaliz",
  "licorice",
  "reglis",
  "cuero",
  "leather",
  "cuir",
  "terros",
  "earth",
  "pimient",
  "pepper",
  "poivre",
  "pepe",
  "peper",
  "pfeffer",
  "cerez",
  "cherr",
  "cerise",
  "cilieg",
  "kers",
  "kirsch",
  "ciruel",
  "plum",
  "prune",
  "blackberr",
  "fresa",
  "strawberr",
  "fraise",
  "frambues",
  "raspberr",
  "framboise",
  "citric",
  "citrus",
  "agrum",
  "manzan",
  "apple",
  "pomme",
  "melocot",
  "peach",
  "albaric",
  "apricot",
  "miel",
  "honey",
  "miele",
  "honing",
  "honig",
  "hierb",
  "herb",
  "balsam",
  "menta",
  "mint",
  "chocolat",
  "cacao",
  "cafe",
  "coffee",
  "caramel",
  "tabac",
  "tobacco",
  "cedr",
  "cedar",
  "levadur",
  "yeast",
  "brioche",
  "espuma",
  "confit",
  "compot",
  "mermelad",
];
const descriptorWords = new Set([
  "flor",
  "flores",
  "mora",
  "moras",
  "jam",
  "jammy",
  "sec",
  "mur",
  "mure",
]);

/**
 * A pairing: a phrase that pairs ("marida con", "ideal con", "pairs with")
 * and a food. Both, because "perfecto para acompañar una copa de tarde"
 * pairs with an afternoon, which is not a dish.
 */
const pairingPhrases = [
  "marida",
  "maridaje",
  "acompan",
  "ideal con",
  "ideal para",
  "perfecto con",
  "va bien con",
  "pairs",
  "pairing",
  "goes with",
  "serve with",
  "match",
  "accord",
  "accompagn",
  "abbina",
  "accompagna",
  "past bij",
  "passt zu",
  "harmoniz",
  "combina",
  "acompanya",
];
const foods = [
  "carne",
  "carn",
  "pescado",
  "peix",
  "queso",
  "formatge",
  "arroz",
  "arros",
  "paella",
  "pasta",
  "marisco",
  "ave",
  "pollo",
  "pollastre",
  "cordero",
  "xai",
  "caza",
  "verdura",
  "postre",
  "chocolate",
  "xocolata",
  "embutido",
  "jamon",
  "tapas",
  "sushi",
  "setas",
  "bolets",
  "meat",
  "fish",
  "cheese",
  "rice",
  "seafood",
  "shellfish",
  "poultry",
  "chicken",
  "lamb",
  "game",
  "dessert",
  "pork",
  "beef",
  "viande",
  "poisson",
  "fromage",
  "volaille",
  "agneau",
  "gibier",
  "pesce",
  "formaggio",
  "riso",
  "pollame",
  "agnello",
  "selvaggina",
  "vlees",
  "vis",
  "kaas",
  "gevogelte",
  "lam",
  "wild",
  "fleisch",
  "fisch",
  "kase",
  "geflugel",
  "peixe",
  "queijo",
  "arroz",
  "marisco",
  "cordeiro",
  "porc",
  "cerdo",
  "cochinillo",
  "ternera",
  "buey",
  "atun",
  "salmon",
  "bacalao",
  "pulpo",
  "ostras",
  "oysters",
];

const fold = (stems: string[]) => stems.map((stem) => normalizeWineText(stem));
const strong = fold(strongStems);
const foodWords = fold(foods);
const descriptors = fold(descriptorStems);

/** Whether a sentence speaks the language of tasting or names a dish. */
export function aboutTheGlass(sentence: string): boolean {
  const words = normalizeWineText(sentence)
    .split(" ")
    .filter((word) => word.length >= 3);
  if (words.some((word) => strongWords.has(word) || strong.some((stem) => word.startsWith(stem)))) {
    return true;
  }
  const described = new Set(
    words.filter(
      (word) => descriptorWords.has(word) || descriptors.some((stem) => word.startsWith(stem)),
    ),
  );
  if (described.size >= 2) return true;
  const padded = ` ${normalizeWineText(sentence)} `;
  return (
    pairingPhrases.some((phrase) => padded.includes(normalizeWineText(phrase))) &&
    words.some((word) =>
      foodWords.some((food) => word === food || word === `${food}s` || word === `${food}es`),
    )
  );
}

/** The tasting sentences of each text, the rest dropped. */
export function tastingSentences(texts: readonly string[]): string[] {
  const kept: string[] = [];
  for (const text of texts) {
    for (const sentence of text.split(/(?<=[.!?;])\s+|\s+·\s+|\n+/)) {
      const trimmed = sentence.trim();
      if (trimmed.length >= 12 && aboutTheGlass(trimmed) && !kept.includes(trimmed)) {
        kept.push(trimmed);
      }
    }
  }
  return kept;
}
