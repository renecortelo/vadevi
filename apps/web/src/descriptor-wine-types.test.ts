import { WineTypeSchema } from "@vadevi/contracts";
import { descriptorsForWineType, tastingDescriptors } from "@vadevi/i18n/runtime";
import { describe, expect, it } from "vitest";

describe("tasting descriptors by wine type", () => {
  it("names only wine types the schema allows", () => {
    // The ontology package deliberately does not depend on contracts, so the two
    // lists could drift apart silently. This is what stops that.
    const allowed = new Set<string>(WineTypeSchema.options);
    for (const descriptor of tastingDescriptors) {
      for (const type of (descriptor as { wineTypes?: readonly string[] }).wineTypes ?? []) {
        expect(allowed.has(type), `unknown wine type "${type}" on ${descriptor.code}`).toBe(true);
      }
    }
  });

  it("offers a sparkling wine its own words and not a red's", () => {
    const sparkling = descriptorsForWineType("nose", "sparkling").map((one) => one.code);
    const red = descriptorsForWineType("nose", "red").map((one) => one.code);
    expect(sparkling).toContain("production.autolysis.brioche");
    expect(sparkling).not.toContain("earth.forest_floor");
    expect(red).toContain("earth.forest_floor");
    expect(red).not.toContain("production.autolysis.brioche");
  });

  it("gives a vermouth its botanicals and a white its citrus", () => {
    expect(descriptorsForWineType("nose", "vermouth_red").map((one) => one.code)).toContain(
      "botanical.wormwood",
    );
    expect(descriptorsForWineType("nose", "white").map((one) => one.code)).toContain(
      "fruit.citrus.grapefruit",
    );
  });

  it("offers everything when the wine's type was never recorded", () => {
    const unknown = descriptorsForWineType("nose", null);
    const red = descriptorsForWineType("nose", "red");
    expect(unknown.length).toBeGreaterThan(red.length);
  });

  it("keeps the words that suit any wine available to every type", () => {
    // A descriptor with no wineTypes belongs everywhere.
    for (const type of ["red", "white", "sparkling"] as const) {
      expect(descriptorsForWineType("palate", type).map((one) => one.code)).toContain(
        "palate.juicy",
      );
    }
  });
});
