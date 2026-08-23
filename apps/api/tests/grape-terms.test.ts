import { describe, expect, it } from "vitest";

import {
  isKnownGrapeSynonym,
  resolveGrapeGroup,
  resolveGrapeNamesFromMessage,
} from "../src/repositories/grape-terms";

describe("grape synonym resolution", () => {
  it("expands a synonym to its whole group", () => {
    expect(resolveGrapeGroup("Tinto Fino")).toContain("tempranillo");
    expect(resolveGrapeGroup("shiraz")).toContain("syrah");
    expect(resolveGrapeGroup("primitivo")).toContain("zinfandel");
  });

  it("returns just the term for an unlisted grape", () => {
    expect(resolveGrapeGroup("uva inventada")).toEqual(["uva inventada"]);
    expect(resolveGrapeGroup("x")).toEqual([]);
  });

  it("knows which terms carry synonyms", () => {
    expect(isKnownGrapeSynonym("ull de llebre")).toBe(true);
    // Listed, but with no synonym of its own.
    expect(isKnownGrapeSynonym("merlot")).toBe(false);
    expect(isKnownGrapeSynonym("bobal")).toBe(false);
  });

  it("covers the widened variety list", () => {
    // Newly listed synonym groups, across the regions the reader's wines come from.
    expect(resolveGrapeGroup("moscato")).toContain("moscatel");
    expect(resolveGrapeGroup("periquita")).toContain("castelao");
    expect(resolveGrapeGroup("kekfrankos")).toContain("blaufrankisch");
    expect(resolveGrapeGroup("melon de bourgogne")).toContain("muscadet");
    expect(resolveGrapeGroup("durif")).toContain("petite sirah");
    // A single-name variety still resolves to itself, so it stays searchable.
    expect(resolveGrapeGroup("parellada")).toEqual(["parellada"]);
    expect(resolveGrapeNamesFromMessage("¿algo de Pedro Ximénez?")).toContain("pedro ximenez");
  });

  it("resolves a multi-word grape named anywhere in a question", () => {
    const names = resolveGrapeNamesFromMessage("¿tengo algo de Tinto Fino?");
    expect(names).toContain("tempranillo");
    expect(names).toContain("tinto fino");
    expect(resolveGrapeNamesFromMessage("what Shiraz do I have?")).toContain("syrah");
    expect(resolveGrapeNamesFromMessage("which did I score highest?")).toEqual([]);
  });
});
