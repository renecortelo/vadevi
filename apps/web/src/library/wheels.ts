import { aromaDescriptors, aromaFamilies, aromaGroups } from "@vadevi/i18n/runtime";
import type { TFunction } from "i18next";

import type { WheelNode } from "./Wheel";

/**
 * What the library's wheels hold: the aroma vocabulary by family and group,
 * and the colours a tasting notes, by the kind of wine that shows them.
 */

/** Each aroma family's colour on the wheel; its groups and aromas are lighter. */
const familyColours = {
  earth: "#a1887f",
  floral: "#ce93d8",
  fruit: "#e57373",
  herbal: "#9ccc65",
  nut: "#e6c79c",
  oak: "#d7b98e",
  savoury: "#b0726a",
  spice: "#e0a458",
  sweet: "#f2c94c",
} as const;

const lighter = (colour: string, share: number) =>
  `color-mix(in srgb, ${colour} ${share}%, #ffffff)`;

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
        .map((group) => ({
          children: aromaDescriptors
            .filter((descriptor) => descriptor.group === group.id)
            .map((descriptor) => {
              const known = aromas.get(descriptor.term);
              return {
                color: lighter(familyColours[family], 55),
                id: aromaNodeId(descriptor.term),
                label: known?.label ?? descriptor.term,
                muted: (known?.grapeCount ?? 0) === 0,
              };
            }),
          color: lighter(familyColours[family], 80),
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

/** Hues dark enough to need a light label. */
const darkHues = new Set(["brick", "brown", "garnet", "mahogany", "purple", "ruby", "tawny"]);

/** A colour's node id on the wheel. */
export const hueNodeId = (hue: string) => `hue:${hue}`;

export function colourWheel(t: TFunction): WheelNode {
  return {
    children: colourKinds.map(({ hues, kind }) => ({
      children: hues.map((hue) => ({
        color: hueColours[hue]!,
        id: hueNodeId(hue),
        ...(darkHues.has(hue) ? { ink: "#fff7f1" } : {}),
        label: t(`tasting.hueOption.${hue}`),
      })),
      color: hueColours[hues[Math.floor(hues.length / 2)]!]!,
      id: `kind:${kind}`,
      ...(kind === "red" || kind === "brown" ? { ink: "#fff7f1" } : {}),
      label: t(`tasting.value.${kind}`),
    })),
    color: "var(--color-surface-raised)",
    id: "colours",
    label: t("library.wheels.colours"),
  };
}
