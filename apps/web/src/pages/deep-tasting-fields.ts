import type { WineType } from "@vadevi/contracts";

// Tannin is worth asking about only on a wine that has it: reds, skin-contact
// oranges, and the tannic fortifieds and vermouths. A white, rosé or sparkling
// has none to speak of. An unknown type is asked anyway — better than hiding a
// field the taster wanted.
export function hasTannin(type: WineType | null): boolean {
  return (
    type === null ||
    type === "red" ||
    type === "orange" ||
    type === "fortified" ||
    type === "vermouth"
  );
}

const allColorFamilies = ["white", "rose", "red", "orange", "brown"] as const;

// The colours a given wine can actually show. The families are coarse, so this
// narrows them to the band a type ranges across — a white never turns red, a red
// never sits in the rosé band — with the full set for an unknown or "other" wine.
export function colorFamiliesFor(
  type: WineType | null,
): readonly (typeof allColorFamilies)[number][] {
  switch (type) {
    case "red":
      return ["red", "brown"];
    case "white":
      return ["white", "brown"];
    case "rose":
      return ["rose"];
    case "sparkling":
      return ["white", "rose"];
    case "orange":
      return ["orange", "brown"];
    case "fortified":
    case "vermouth":
      return ["white", "red", "brown"];
    default:
      return allColorFamilies;
  }
}

// The specific hues offered for a wine, richer than the coarse colour family —
// a red ranges purple → ruby → garnet → brick → tawny, a white straw → gold →
// amber → copper. Codes, localized where they are shown. An unknown or "other"
// wine gets a broad set so nothing a taster might see is missing.
export function hueOptionsFor(type: WineType | null): readonly string[] {
  switch (type) {
    case "red":
      return ["purple", "ruby", "garnet", "brick", "tawny"];
    case "white":
      return ["straw", "yellow", "gold", "amber", "copper"];
    case "rose":
      return ["pale_pink", "salmon", "raspberry", "coral", "copper"];
    case "sparkling":
      return ["straw", "yellow", "gold", "pale_pink", "salmon"];
    case "orange":
      return ["gold", "amber", "copper", "orange", "brick"];
    case "fortified":
      return ["gold", "amber", "mahogany", "brick", "brown"];
    case "vermouth":
      return ["straw", "amber", "mahogany", "ruby", "brown"];
    default:
      return [
        "straw",
        "yellow",
        "gold",
        "amber",
        "copper",
        "pale_pink",
        "salmon",
        "purple",
        "ruby",
        "garnet",
        "brick",
        "tawny",
        "mahogany",
        "brown",
      ];
  }
}
