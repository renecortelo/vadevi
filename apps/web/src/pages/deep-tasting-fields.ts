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
