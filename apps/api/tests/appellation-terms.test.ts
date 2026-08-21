import { describe, expect, it } from "vitest";

import {
  appellationsForCountry,
  resolveAppellationCountries,
} from "../src/repositories/appellation-terms";

describe("appellation resolution", () => {
  it("resolves an appellation or region name to its country", () => {
    expect(resolveAppellationCountries("algo de Rioja")).toEqual(["ES"]);
    expect(resolveAppellationCountries("something from Napa Valley")).toEqual(["US"]);
    expect(resolveAppellationCountries("un vino de Parras")).toEqual(["MX"]);
    expect(resolveAppellationCountries("Barolo o Chianti")).toEqual(["IT"]);
  });

  it("returns nothing when no known appellation is named", () => {
    expect(resolveAppellationCountries("which did I score highest?")).toEqual([]);
    expect(resolveAppellationCountries("")).toEqual([]);
  });

  it("lists a country's known appellations, bounded", () => {
    const mexican = appellationsForCountry("MX");
    expect(mexican).toContain("parras");
    expect(mexican.length).toBeLessThanOrEqual(6);
    expect(appellationsForCountry("ZZ")).toEqual([]);
  });
});
