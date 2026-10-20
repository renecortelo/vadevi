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

describe("an Italian article's production list", () => {
  const article = (lines: string) =>
    `{{Denominazione vino\n|Denominazione = DOC\n}}\nIl '''Lambrusco di Sorbara''' è un vino DOC.\n\n== Produzione ==\n''Provincia, stagione, volume in [[ettolitro|ettolitri]]''\n${lines}\n== Voci correlate ==\n* [[Modena]] (2000/01) 1,0\n`;

  it("gives the latest season's volume, summed over its provinces, with its lines", () => {
    const figures = regionFigures(
      article(
        "* Modena  (1995/96)  63063,0 \n* Modena  (1996/97)  82307,0 \n* Reggio Emilia  (1996/97)  1200,5 ",
      ),
      "it",
    );
    expect(figures?.production).toEqual({
      amount: 83508,
      quote: "Modena (1996/97) 82307,0; Reggio Emilia (1996/97) 1200,5",
      year: "1996/97",
    });
    expect(figures?.planted).toBeNull();
  });

  it("reads nothing from an article that is not a wine's", () => {
    const town = article("* Modena  (1996/97)  82307,0").replace(
      "{{Denominazione vino",
      "{{Comune",
    );
    expect(regionFigures(town, "it")).toBeNull();
  });
});
