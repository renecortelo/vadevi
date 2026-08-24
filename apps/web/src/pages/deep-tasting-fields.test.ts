import { describe, expect, it } from "vitest";

import { colorFamiliesFor, hasTannin } from "./deep-tasting-fields";

describe("tasting fields by wine type", () => {
  it("asks about tannin only where there is tannin to speak of", () => {
    expect(hasTannin("red")).toBe(true);
    expect(hasTannin("orange")).toBe(true);
    expect(hasTannin("vermouth")).toBe(true);
    expect(hasTannin("white")).toBe(false);
    expect(hasTannin("rose")).toBe(false);
    expect(hasTannin("sparkling")).toBe(false);
    // Unknown type is asked anyway — hiding a wanted field is worse.
    expect(hasTannin(null)).toBe(true);
  });

  it("offers the colours a wine can actually show", () => {
    expect(colorFamiliesFor("red")).toEqual(["red", "brown"]);
    expect(colorFamiliesFor("white")).toEqual(["white", "brown"]);
    expect(colorFamiliesFor("sparkling")).toEqual(["white", "rose"]);
    // A white is never offered the red band, a red never the rosé band.
    expect(colorFamiliesFor("white")).not.toContain("red");
    expect(colorFamiliesFor("red")).not.toContain("rose");
    // An unknown or "other" wine keeps the full set.
    expect(colorFamiliesFor(null)).toHaveLength(5);
    expect(colorFamiliesFor("other")).toHaveLength(5);
  });
});
