import type { LibraryGrape } from "@vadevi/contracts";

import { normalizeWineText } from "../repositories/wine-memory";
import { profileDish } from "./dish-profile";
import {
  pairingStyleCatalogue,
  pairingStylesFor,
  type Style,
  styleDistance,
} from "./local-pairing";

/**
 * What a grape goes with, argued from the pairing rules rather than read
 * from a source.
 *
 * Wikipedia rarely says what a grape's wine goes with, so the library's own
 * pairings are mostly empty. The application already knows, as a rule set,
 * which style of wine suits which dish; this runs it backwards. A grape is
 * placed in a style — by name where the catalogue lists it, otherwise by the
 * colour and structure the library has for it — and the style's dishes are
 * those for which the rules rank it among the best three. The answer is a
 * suggestion and is labelled as one: `basis` says how the style was chosen.
 */

/** Dish families, each with a representative dish the rules can read. */
export const dishFamilies = [
  ["red_meat", "grilled beef steak"],
  ["game", "venison stew"],
  ["lamb", "lamb"],
  ["poultry", "roast chicken"],
  ["pork", "pork loin"],
  ["white_fish", "white fish"],
  ["oily_fish", "grilled salmon"],
  ["shellfish", "shellfish oysters"],
  ["rice", "paella"],
  ["pasta_tomato", "pasta with tomato sauce"],
  ["pizza", "pizza"],
  ["cured_meats", "cured ham jamon"],
  ["fresh_cheese", "soft goat cheese"],
  ["aged_cheese", "aged manchego cheese"],
  ["blue_cheese", "blue cheese"],
  ["mushrooms", "mushroom risotto"],
  ["spicy", "spicy thai curry"],
  ["vegetables", "green salad vegetables"],
  ["sushi", "sushi"],
  ["fried_tapas", "fried tapas croquetas"],
  ["chocolate", "chocolate cake"],
  ["fruit_desserts", "fruit tart"],
] as const;

export type DishFamily = (typeof dishFamilies)[number][0];

/** Which families each style ranks among the best three for. Computed once. */
let familiesByStyle: Map<string, DishFamily[]> | null = null;

function styleFamilies(): Map<string, DishFamily[]> {
  if (familiesByStyle !== null) return familiesByStyle;
  familiesByStyle = new Map();
  for (const [family, dish] of dishFamilies) {
    for (const style of pairingStylesFor(profileDish(dish), "en").slice(0, 3)) {
      familiesByStyle.set(style.name, [...(familiesByStyle.get(style.name) ?? []), family]);
    }
  }
  return familiesByStyle;
}

const levelNumber = { high: 4.5, low: 2, medium: 3 } as const;

export function styleCode(style: Pick<Style, "name">): string {
  return normalizeWineText(style.name).replaceAll(" ", "_");
}

export type SuggestedPairings = NonNullable<LibraryGrape["suggestedPairings"]>;

export function suggestedPairingsFor(grape: {
  acidity: LibraryGrape["acidity"];
  body: LibraryGrape["body"];
  color: LibraryGrape["color"];
  names: readonly string[];
  styles: readonly string[];
  tannin: LibraryGrape["tannin"];
}): SuggestedPairings | null {
  const names = new Set(grape.names.map((name) => normalizeWineText(name)));
  let chosen = pairingStyleCatalogue.filter((style) =>
    style.grapes.some((name) => names.has(normalizeWineText(name))),
  );
  let basis: SuggestedPairings["basis"] = "catalogue";

  if (chosen.length === 0) {
    // Placed by structure, and only on some of it: a colour and at least one
    // of the three axes. A colour alone would make every red the same red.
    const known = [grape.acidity, grape.tannin, grape.body].filter((value) => value !== null);
    if (grape.color === null || known.length < 1) return null;
    const sweet = grape.styles.includes("sweet") || grape.styles.includes("fortified");
    const wanted = {
      acidity: grape.acidity === null ? 3 : levelNumber[grape.acidity],
      body: grape.body === null ? 3 : levelNumber[grape.body],
      sweetness: sweet ? 5 : 1,
      tannin: grape.tannin === null ? (grape.color === "red" ? 3 : 1) : levelNumber[grape.tannin],
    };
    // The catalogue's "colours" are kinds of wine: a white grape may make
    // still white, and sparkling or fortified wine where the library says it
    // does; a red grape, red or fortified; a grey one, rosé or white.
    const kinds = new Set<string>(
      grape.color === "red" ? ["red"] : grape.color === "pink" ? ["rose", "white"] : ["white"],
    );
    if (grape.styles.includes("sparkling") && grape.color !== "red") kinds.add("sparkling");
    if (grape.styles.includes("fortified")) kinds.add("fortified");
    if (grape.styles.includes("rose")) kinds.add("rose");
    const candidates = pairingStyleCatalogue.filter((style) => kinds.has(style.color));
    const best = candidates
      .map((style) => ({ gap: styleDistance(style.profile, wanted), style }))
      .sort((left, right) => left.gap - right.gap)[0];
    if (best === undefined) return null;
    chosen = [best.style];
    basis = "profile";
  }

  const byStyle = styleFamilies();
  const families = [...new Set(chosen.flatMap((style) => byStyle.get(style.name) ?? []))];
  if (families.length === 0) return null;
  return { basis, families, styles: chosen.map(styleCode) };
}
