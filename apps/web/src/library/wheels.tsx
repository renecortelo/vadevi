import { aromaDescriptors, aromaFamilies, aromaGroups } from "@vadevi/i18n/runtime";
import type { TFunction } from "i18next";

import { AromaIcon } from "./AromaIcon";
import type { WheelNode } from "./Wheel";

/**
 * What the library's wheels hold: the aroma vocabulary by family and group,
 * and the colours a tasting notes, by the kind of wine that shows them.
 */

/**
 * Each aroma family's colour on the wheel, from the wine palette, quiet
 * rather than bright; its groups and aromas are shades of it, each its own.
 */
export const familyColours = {
  earth: "#8f7663",
  floral: "#a27aa6",
  fruit: "#b85a5a",
  herbal: "#7f9a62",
  nut: "#c3a983",
  oak: "#b39572",
  savoury: "#85544f",
  spice: "#c2874e",
  sweet: "#cfa64d",
} as const;

/** The nth shade of a colour: a little lighter for each step, then again. */
const shade = (colour: string, step: number) =>
  `color-mix(in srgb, ${colour} ${100 - (step % 5) * 13}%, #ffffff)`;

/** An aroma's node id on the wheel. */
export const aromaNodeId = (term: string) => `aroma:${term}`;

/**
 * The aroma vocabulary as a wheel: each aroma by its name (`name`), and faint
 * where `faint` says so — in the library, an aroma no grape carries yet.
 */
export function aromaWheel(
  t: TFunction,
  name: (term: string) => string,
  faint: (term: string) => boolean = () => false,
): WheelNode {
  return {
    children: aromaFamilies.map((family) => ({
      children: aromaGroups
        .filter((group) => group.family === family)
        .map((group, groupIndex) => ({
          children: aromaDescriptors
            .filter((descriptor) => descriptor.group === group.id)
            .map((descriptor, index) => ({
              color: shade(familyColours[family], index),
              icon: <AromaIcon descriptor={descriptor} />,
              id: aromaNodeId(descriptor.term),
              label: name(descriptor.term),
              muted: faint(descriptor.term),
            })),
          color: shade(familyColours[family], groupIndex),
          id: `group:${group.id}`,
          label: t(`library.aromaGroup.${group.id}`),
        })),
      color: familyColours[family],
      id: `family:${family}`,
      label: t(`library.aromaFamily.${family}`),
    })),
    color: "var(--color-surface-raised)",
    id: "aromas",
    label: t("library.wheels.aromas"),
  };
}

/**
 * The dishes, by the six groups a meal is chosen by, each family of the
 * pairing rules (`library.dish.*`) in one; drawn in a quiet colour each.
 */
export const pairingGroups = [
  {
    colour: "#9b4a45",
    families: [
      "red_meat",
      "lamb",
      "game",
      "stews",
      "barbecue",
      "poultry",
      "pork",
      "cured_meats",
      "foie_gras",
    ],
    group: "meat",
  },
  {
    colour: "#5f8aa0",
    families: ["white_fish", "oily_fish", "shellfish", "rich_shellfish", "oysters", "sushi"],
    group: "fish",
  },
  {
    colour: "#b9974f",
    families: [
      "rice",
      "pasta_tomato",
      "pizza",
      "legumes",
      "eggs",
      "mushrooms",
      "vegetables",
      "cream_sauces",
    ],
    group: "dishes",
  },
  { colour: "#c47248", families: ["spicy", "asian", "fried_tapas", "aperitif"], group: "spicy" },
  {
    colour: "#cbb26a",
    families: ["fresh_cheese", "soft_cheese", "aged_cheese", "blue_cheese"],
    group: "cheese",
  },
  { colour: "#8c6283", families: ["fruit_desserts", "pastries", "chocolate"], group: "desserts" },
] as const;

/** A dish family's node id on the wheel. */
export const dishNodeId = (family: string) => `dish:${family}`;

/** The pairing wheel: each family as large as the grapes that go with it. */
export function pairingWheel(t: TFunction, grapeCount: (family: string) => number): WheelNode {
  return {
    children: pairingGroups.map(({ colour, families, group }) => ({
      children: families.map((family, index) => ({
        color: shade(colour, index),
        id: dishNodeId(family),
        label: t(`library.dish.${family}`),
        muted: grapeCount(family) === 0,
        weight: Math.max(1, grapeCount(family)),
      })),
      color: colour,
      id: `meal:${group}`,
      label: t(`library.wheels.pairingGroup.${group}`),
    })),
    color: "var(--color-surface-raised)",
    id: "pairings",
    label: t("library.wheels.pairings"),
  };
}

/**
 * The colours of wine, by the kind that shows them, each drawn in its own
 * tint: the hues a tasting's appearance notes (`tasting.hueOption`).
 */
export const colourKinds = [
  { hues: ["straw", "yellow", "gold", "amber"], kind: "white" },
  { hues: ["pale_pink", "salmon", "coral", "raspberry"], kind: "rose" },
  { hues: ["copper", "orange"], kind: "orange" },
  { hues: ["purple", "ruby", "garnet", "brick", "tawny"], kind: "red" },
  { hues: ["mahogany", "brown"], kind: "brown" },
] as const;

export const hueColours: Record<string, string> = {
  amber: "#c98a2e",
  brick: "#9c4a2f",
  brown: "#5b3a24",
  copper: "#c8794f",
  coral: "#ef7f6a",
  garnet: "#7a1f2b",
  gold: "#e0b13f",
  mahogany: "#6b2d1f",
  orange: "#e59a4a",
  pale_pink: "#f5c9c4",
  purple: "#5c1f4e",
  raspberry: "#d9576f",
  ruby: "#9b1b30",
  salmon: "#f0a58a",
  straw: "#f3e7a6",
  tawny: "#a0612f",
  yellow: "#f1d66b",
};

/** A colour's node id on the wheel. */
export const hueNodeId = (hue: string) => `hue:${hue}`;

export function colourWheel(t: TFunction): WheelNode {
  return {
    children: colourKinds.map(({ hues, kind }) => ({
      children: hues.map((hue) => ({
        color: hueColours[hue]!,
        id: hueNodeId(hue),
        label: t(`tasting.hueOption.${hue}`),
      })),
      color: hueColours[hues[Math.floor(hues.length / 2)]!]!,
      id: `kind:${kind}`,
      label: t(`tasting.value.${kind}`),
    })),
    color: "var(--color-surface-raised)",
    id: "colours",
    label: t("library.wheels.colours"),
  };
}
