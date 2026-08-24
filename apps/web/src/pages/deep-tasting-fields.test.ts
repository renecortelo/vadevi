import { describe, expect, it } from "vitest";

import { colorFamiliesFor, hasTannin, hueOptionsFor } from "./deep-tasting-fields";

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

  it("offers five specific hues each for red and white, from purple to copper", () => {
    expect(hueOptionsFor("red")).toEqual(["purple", "ruby", "garnet", "brick", "tawny"]);
    expect(hueOptionsFor("white")).toEqual(["straw", "yellow", "gold", "amber", "copper"]);
    // Ruby is a red hue, never offered for a white.
    expect(hueOptionsFor("white")).not.toContain("ruby");
    expect(hueOptionsFor("red")).not.toContain("straw");
    // An unknown wine keeps a broad set so nothing is missing.
    expect(hueOptionsFor(null).length).toBeGreaterThan(10);
  });
});
