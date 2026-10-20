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
const familyColours = {
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

export function aromaWheel(
  t: TFunction,
  aromas: ReadonlyMap<string, { grapeCount: number; label: string }>,
): WheelNode {
  return {
    children: aromaFamilies.map((family) => ({
      children: aromaGroups
        .filter((group) => group.family === family)
        .map((group, groupIndex) => ({
          children: aromaDescriptors
            .filter((descriptor) => descriptor.group === group.id)
            .map((descriptor, index) => {
              const known = aromas.get(descriptor.term);
              return {
                color: shade(familyColours[family], index),
                icon: <AromaIcon descriptor={descriptor} />,
                id: aromaNodeId(descriptor.term),
                label: known?.label ?? descriptor.term,
                muted: (known?.grapeCount ?? 0) === 0,
              };
            }),
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
