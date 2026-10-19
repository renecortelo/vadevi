import { describe, expect, it } from "vitest";

import { readFigure, regionFigures } from "./region-figures";

/** Infobox values in the forms the articles write them (19 October 2026). */
describe("reading an infobox figure", () => {
  it("reads English templates and words", () => {
    expect(readFigure("{{convert|375|ha}}", "ha", "en")).toEqual({ amount: 375, year: null });
    expect(readFigure("539 ha (2010)", "ha", "en")).toEqual({ amount: 539, year: "2010" });
    expect(readFigure("5,608 hectolitres", "hl", "en")?.amount).toBe(5608);
    expect(readFigure("{{convert|47216|acre|0}}", "ha", "en")?.amount).toBe(19108);
  });

  it("reads French and Spanish numbers, and their years", () => {
    expect(readFigure("16,3 hectares (en 2023)", "ha", "fr")).toEqual({
      amount: 16.3,
      year: "2023",
    });
    expect(readFigure("{{unité|1414 [[hectare]]s}} (en 2023)", "ha", "fr")?.amount).toBe(1414);
    expect(readFigure("114 ha, dont 34 en {{1er|cru}} (en 2022)", "ha", "fr")?.amount).toBe(114);
    expect(readFigure("{{esd|651 373 hl}} (2010)", "hl", "es")).toEqual({
      amount: 651373,
      year: "2010",
    });
  });

  it("refuses what is not one figure in the unit asked", () => {
    expect(readFigure("96", "ha", "en")).toBeNull();
    expect(readFigure("3,200 – 3,250 ha", "ha", "en")).toBeNull();
    expect(readFigure("{{esd|108 428}} (2010)", "hl", "es")).toBeNull();
    expect(readFigure("1,1 mill hl (2008)", "hl", "es")).toBeNull();
  });
});

describe("a region's infobox", () => {
  it("reads only a wine region's infobox", () => {
    const wine =
      "{{Infobox wine region\n| name = Test\n| planted = {{convert|7200|ha|acres|0}}<ref>x</ref>\n| wine produced = 9350 hL\n}}";
    expect(regionFigures(wine, "en")).toEqual({
      planted: { amount: 7200, quote: "planted = {{convert|7200|ha|acres|0}}", year: null },
      production: { amount: 9350, quote: "wine produced = 9350 hL", year: null },
    });
    const town = "{{Infobox settlement\n| area_total_km2 = 12\n}}";
    expect(regionFigures(town, "en")).toBeNull();
  });
});
