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
    expect(resolveGrapeGroup("bobal")).toEqual(["bobal"]);
    expect(resolveGrapeGroup("x")).toEqual([]);
  });

  it("knows which terms carry synonyms", () => {
    expect(isKnownGrapeSynonym("ull de llebre")).toBe(true);
    expect(isKnownGrapeSynonym("merlot")).toBe(false);
    expect(isKnownGrapeSynonym("bobal")).toBe(false);
  });

  it("resolves a multi-word grape named anywhere in a question", () => {
    const names = resolveGrapeNamesFromMessage("¿tengo algo de Tinto Fino?");
    expect(names).toContain("tempranillo");
    expect(names).toContain("tinto fino");
    expect(resolveGrapeNamesFromMessage("what Shiraz do I have?")).toContain("syrah");
    expect(resolveGrapeNamesFromMessage("which did I score highest?")).toEqual([]);
  });
});
