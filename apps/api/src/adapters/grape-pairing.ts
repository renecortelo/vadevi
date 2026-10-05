import type { LibraryGrape } from "@vadevi/contracts";

import type { DishProfile } from "./dish-profile";
import { pairingStyleCatalogue, rankStyles, type Style, styleDistance } from "./local-pairing";
import { type DishFamily, dishFamilyOrder, libraryGrapeId } from "./pairing-knowledge";

/**
 * What a grape goes with, argued from the pairing rules rather than read
 * from a source.
 *
 * Wikipedia rarely says what a grape's wine goes with, so the library's own
 * pairings are mostly empty. The application already knows, as a rule set,
 * which style of wine suits which dish; this runs it backwards. A grape is
 * placed in the styles a source names it in — or, where none does, in the one
 * its colour and structure in the library fit best — and each style's dishes
 * are those for which the rules rank it among the best three. The answer is a
 * suggestion and is labelled as one: `basis` says how the style was chosen,
 * and each style keeps its own dishes, because a Riesling for curry and a
 * Riesling for a fruit tart are not the same wine.
 */

/** A plate of each family, on the axes the rules read. */
function plate(families: DishFamily[], shape: Partial<DishProfile>): DishProfile {
  return {
    acidic: false,
    earthy: false,
    families,
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
    ...shape,
  };
}

/**
 * Each family as a typical plate. Written out rather than parsed from a dish
 * name, so a family means what it says whatever the vocabulary learns.
 */
export const familyPlates: Readonly<Record<DishFamily, DishProfile>> = {
  aged_cheese: plate(["aged_cheese"], {
    intensity: 4,
    protein: "cheese",
    richness: 4,
    salty: true,
  }),
  aperitif: plate(["aperitif"], { intensity: 3, richness: 2, salty: true }),
  asian: plate(["asian"], { intensity: 3, richness: 3, salty: true, sweetSavory: true }),
  barbecue: plate(["barbecue"], { intensity: 5, protein: "red_meat", richness: 4, smoky: true }),
  blue_cheese: plate(["blue_cheese"], {
    intensity: 5,
    protein: "cheese",
    richness: 5,
    salty: true,
    sweetWelcome: true,
  }),
  chocolate: plate(["chocolate"], { intensity: 5, richness: 4, sweet: true }),
  cream_sauces: plate(["cream_sauces"], { intensity: 3, protein: "white_meat", richness: 5 }),
  cured_meats: plate(["cured_meats"], {
    intensity: 4,
    protein: "white_meat",
    richness: 4,
    salty: true,
  }),
  eggs: plate(["eggs"], { intensity: 2, richness: 3 }),
  foie_gras: plate(["foie_gras"], { intensity: 4, richness: 5, sweetWelcome: true }),
  fresh_cheese: plate(["fresh_cheese"], {
    acidic: true,
    intensity: 2,
    protein: "cheese",
    richness: 3,
  }),
  fried_tapas: plate(["fried_tapas"], { intensity: 3, richness: 4, salty: true }),
  fruit_desserts: plate(["fruit_desserts"], {
    acidic: true,
    intensity: 3,
    richness: 2,
    sweet: true,
  }),
  game: plate(["game"], { intensity: 5, protein: "red_meat", richness: 4 }),
  lamb: plate(["lamb"], { intensity: 4, protein: "red_meat", richness: 4 }),
  legumes: plate(["legumes"], { intensity: 4, protein: "legume", richness: 4 }),
  mushrooms: plate(["mushrooms"], {
    earthy: true,
    intensity: 3,
    protein: "vegetable",
    richness: 3,
  }),
  oily_fish: plate(["oily_fish"], { intensity: 4, protein: "oily_fish", richness: 4 }),
  oysters: plate(["oysters", "shellfish"], {
    intensity: 2,
    protein: "shellfish",
    richness: 1,
    salty: true,
  }),
  pasta_tomato: plate(["pasta_tomato"], { acidic: true, intensity: 3, richness: 2 }),
  pastries: plate(["pastries"], { intensity: 2, richness: 3, sweet: true }),
  pizza: plate(["pizza"], {
    acidic: true,
    intensity: 3,
    protein: "cheese",
    richness: 3,
    salty: true,
  }),
  pork: plate(["pork"], { intensity: 3, protein: "white_meat", richness: 4 }),
  poultry: plate(["poultry"], { intensity: 3, protein: "white_meat", richness: 3 }),
  red_meat: plate(["red_meat"], { intensity: 4, protein: "red_meat", richness: 4, smoky: true }),
  rice: plate(["rice"], { intensity: 3, richness: 3 }),
  rich_shellfish: plate(["rich_shellfish"], { intensity: 4, protein: "shellfish", richness: 4 }),
  shellfish: plate(["shellfish"], { intensity: 2, protein: "shellfish", richness: 2 }),
  soft_cheese: plate(["soft_cheese"], { intensity: 3, protein: "cheese", richness: 5 }),
  spicy: plate(["spicy"], { intensity: 4, richness: 3, spicy: true }),
  stews: plate(["stews"], { intensity: 5, protein: "red_meat", richness: 5 }),
  sushi: plate(["sushi"], { intensity: 2, protein: "lean_fish", richness: 2, salty: true }),
  vegetables: plate(["vegetables"], {
    acidic: true,
    intensity: 2,
    protein: "vegetable",
    richness: 1,
  }),
  white_fish: plate(["white_fish"], { intensity: 2, protein: "lean_fish", richness: 2 }),
};

/**
 * Which styles count as suiting a family: the best three, but only those
 * that are a real fit. Where few styles fit at all — barbecue, chocolate —
 * the third best can be a poor match, and a podium is not a reason.
 */
const podium = 3;
const nearBest = 4;
const goodEnough = 4;

/** Which families each style suits. Computed once. */
let familiesByStyle: Map<string, DishFamily[]> | null = null;

export function styleFamilies(): Map<string, DishFamily[]> {
  if (familiesByStyle !== null) return familiesByStyle;
  familiesByStyle = new Map();
  for (const family of dishFamilyOrder) {
    const ranked = rankStyles(familyPlates[family]);
    const limit = Math.min(goodEnough, ranked[0]!.gap + nearBest);
    for (const { gap, style } of ranked.slice(0, podium)) {
      if (gap > limit) continue;
      familiesByStyle.set(style.code, [...(familiesByStyle.get(style.code) ?? []), family]);
    }
  }
  return familiesByStyle;
}

const levelNumber = { high: 4.5, low: 2, medium: 3 } as const;

/**
 * The library's words for what a source says a grape goes with, as the
 * families they belong to — so a suggestion never repeats the source.
 */
const sourceFamilies: Readonly<Record<string, DishFamily>> = {
  "buffalo mozzarella": "fresh_cheese",
  "chinese cuisine": "asian",
  feta: "fresh_cheese",
  "foie gras": "foie_gras",
  "fresh cheese": "fresh_cheese",
  game: "game",
  "goat cheese": "fresh_cheese",
  "grilled meats": "red_meat",
  lamb: "lamb",
  lobster: "rich_shellfish",
  pasta: "pasta_tomato",
  pizza: "pizza",
  pork: "pork",
  prosciutto: "cured_meats",
  "red meat": "red_meat",
  salmon: "oily_fish",
  seafood: "shellfish",
  shellfish: "shellfish",
  "spicy dishes": "spicy",
  squid: "shellfish",
  sushi: "sushi",
  "thai cuisine": "spicy",
  vegetables: "vegetables",
  "white fish": "white_fish",
};

export type SuggestedPairings = NonNullable<LibraryGrape["suggestedPairings"]>;

/** The still style a grape's colour and structure fit best, if they say enough. */
function placeByStructure(grape: {
  acidity: LibraryGrape["acidity"];
  body: LibraryGrape["body"];
  color: LibraryGrape["color"];
  tannin: LibraryGrape["tannin"];
}): Style | null {
  // A colour and at least one of the three axes. A colour alone would make
  // every red the same red.
  const known = [grape.acidity, grape.tannin, grape.body].filter((value) => value !== null);
  if (grape.color === null || known.length < 1) return null;
  const wanted = {
    acidity: grape.acidity === null ? 3 : levelNumber[grape.acidity],
    body: grape.body === null ? 3 : levelNumber[grape.body],
    // A grape that can make sweet wine mostly makes dry; its sweet wines are
    // placed by name, where a source names them, never guessed.
    sweetness: 1,
    // Unknown tannin in a red: between light and medium, so neither is assumed.
    tannin: grape.tannin === null ? (grape.color === "red" ? 2.5 : 1) : levelNumber[grape.tannin],
  };
  const kinds = new Set<string>(
    grape.color === "red" ? ["red"] : grape.color === "pink" ? ["rose", "white"] : ["white"],
  );
  return (
    pairingStyleCatalogue
      .filter((style) => style.placeable && kinds.has(style.color))
      .map((style) => ({ gap: styleDistance(style.profile, wanted), style }))
      .sort((left, right) => left.gap - right.gap)[0]?.style ?? null
  );
}

export function suggestedPairingsFor(grape: {
  acidity: LibraryGrape["acidity"];
  body: LibraryGrape["body"];
  color: LibraryGrape["color"];
  /** The library's id ("pinot-noir"), which the catalogue's grapes resolve to. */
  id: string;
  /** What the grape's source says it goes with, in the library's English terms. */
  sourcePairings?: readonly string[];
  styles: readonly string[];
  tannin: LibraryGrape["tannin"];
}): SuggestedPairings | null {
  // By id, not by name: a synonym shared by two grapes ("Riesling" for the
  // Italian one, "Melon" for a Chardonnay) must not carry one into the
  // other's style.
  // A style that needs a kind of wine — sweet, sparkling, fortified, rosé —
  // takes a grape only if the library knows it makes that kind, or knows
  // nothing of what it makes and the style's own source names it.
  const makes = (style: Style) =>
    style.requires === null || grape.styles.length === 0 || grape.styles.includes(style.requires);
  const named = pairingStyleCatalogue.filter(
    (style) => makes(style) && style.grapes.some((name) => libraryGrapeId(name) === grape.id),
  );
  const chosen: Array<{ basis: "catalogue" | "profile"; style: Style }> = named.map((style) => ({
    basis: "catalogue",
    style,
  }));

  // A red grape named only for its rosé or its Port, or a white only for its
  // sweet wine, still makes a table wine of its own colour: placed by its
  // structure, where the library knows it.
  const ownColour = grape.color === "red" ? "red" : "white";
  // The library's list of what a grape makes is often short of "still"; only
  // a grape known for nothing but fortified wine is kept out of table wine.
  const makesTableWine = !(
    grape.styles.length > 0 &&
    grape.styles.every((style) => style === "fortified" || style === "blending")
  );
  if (
    makesTableWine &&
    !named.some((style) => style.color === ownColour && style.requires === null)
  ) {
    const placed = placeByStructure(grape);
    if (placed !== null && !named.includes(placed))
      chosen.unshift({ basis: "profile", style: placed });
  }

  const said = new Set(
    (grape.sourcePairings ?? []).map((food) => sourceFamilies[food]).filter(Boolean),
  );
  const byStyle = styleFamilies();
  // The grape's own kind of wine first: a Syrah's red before its rosé.
  const groups = chosen
    .sort(
      (left, right) =>
        Number(right.style.color === ownColour) - Number(left.style.color === ownColour),
    )
    .map(({ basis, style }) => ({
      basis,
      families: (byStyle.get(style.code) ?? []).filter((family) => !said.has(family)),
      style: style.code,
    }))
    .filter((group) => group.families.length > 0);
  if (groups.length === 0) return null;
  const families = dishFamilyOrder.filter((family) =>
    groups.some((group) => group.families.includes(family)),
  );
  return {
    basis: groups.some((group) => group.basis === "catalogue") ? "catalogue" : "profile",
    families,
    groups,
    styles: groups.map((group) => group.style),
  };
}
