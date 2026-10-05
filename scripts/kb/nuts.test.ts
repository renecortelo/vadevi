import { describe, expect, it } from "vitest";

import { nutsRegions } from "./fetch-appellation-areas";
import { insideRegion, type NutsRegion } from "./nuts";

describe("the register's regions", () => {
  it("reads a technical file's NUTS codes with their names", () => {
    const text = [
      "          a. Περιοχή NUTS",
      "             GR121                     Ημαθία",
      "          b. Χάρτης οριοθετημένης περιοχής",
      "             GR999                     Not the area",
    ].join("\n");
    expect(nutsRegions(text, "GR")).toEqual([{ code: "GR121", name: "Ημαθία" }]);
  });

  it("keeps the smallest regions, not the ones they lie in", () => {
    const text = [
      "a. NUTS area",
      "PT184      Baixo Alentejo",
      "PT18       Alentejo",
      "PT1        Continente",
      "b. Map of the demarcated area",
    ].join("\n");
    expect(nutsRegions(text, "PT")).toEqual([{ code: "PT184", name: "Baixo Alentejo" }]);
    expect(
      nutsRegions(
        "a. NUTS-Gebiet\n DEB      RHEINLAND-PFALZ\n DE       DEUTSCHLAND\nb. Karten",
        "DE",
      ),
    ).toEqual([{ code: "DEB", name: "RHEINLAND-PFALZ" }]);
  });

  it("tells a point inside a region from one outside", () => {
    const square: NutsRegion = {
      code: "XX1",
      edition: "2006",
      geometry: {
        coordinates: [
          [
            [22, 40],
            [23, 40],
            [23, 41],
            [22, 41],
            [22, 40],
          ],
        ],
        type: "Polygon",
      },
      label: { latitude: 40.5, longitude: 22.5 },
      name: "Square",
    };
    // Naoussa in Imathia, and the Naousa on Paros.
    expect(insideRegion({ latitude: 40.63, longitude: 22.06 }, square)).toBe(true);
    expect(insideRegion({ latitude: 37.12, longitude: 25.24 }, square)).toBe(false);
  });
});
