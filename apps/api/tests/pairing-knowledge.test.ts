import { describe, expect, it } from "vitest";

import grapes from "../../../data/kb/grapes.json";
import { familyPlates, styleFamilies } from "../src/adapters/grape-pairing";
import { pairingStyleCatalogue, reasonPrinciples } from "../src/adapters/local-pairing";
import {
  classicPairings,
  dishFamilyOrder,
  libraryGrapeId,
  pairingPrinciples,
  pairingSourceUrl,
  styleGrapeCitations,
} from "../src/adapters/pairing-knowledge";

/**
 * The pairing rules' bibliography holds together: every reason cites a
 * principle, every classic and every listed grape points at something real.
 * Whether each quote is in its article, word for word, is checked against the
 * articles themselves by `pnpm kb:check-pairing-sources`.
 */
describe("the pairing rules' sources", () => {
  const codes = new Set(pairingStyleCatalogue.map((style) => style.code));

  it("cites a principle, with its sentence, for every reason the rules give", () => {
    for (const [reason, principle] of Object.entries(reasonPrinciples)) {
      expect(pairingPrinciples[principle].quote.length, reason).toBeGreaterThan(20);
    }
  });

  it("pairs only styles the rules have with families the rules know", () => {
    for (const classic of classicPairings) {
      for (const style of classic.styles) expect(codes.has(style), style).toBe(true);
      for (const family of classic.families) {
        expect(dishFamilyOrder, family).toContain(family);
      }
    }
  });

  it("names, for every style, grapes the library has", () => {
    const ids = new Set((grapes as Array<{ id: string }>).map((grape) => grape.id));
    for (const [style, entries] of Object.entries(styleGrapeCitations)) {
      for (const entry of entries) {
        for (const name of entry.grapes) {
          expect(ids.has(libraryGrapeId(name)), `${style}: ${name}`).toBe(true);
        }
        if ("grape" in entry.cite) expect(ids.has(entry.cite.grape)).toBe(true);
      }
    }
  });

  it("cites a grape's own article only with a sentence the library holds", () => {
    const blob = new Map(
      (grapes as Array<{ id: string }>).map((grape) => [grape.id, JSON.stringify(grape)]),
    );
    const cites = [
      ...classicPairings.map((classic) => classic.cite),
      ...Object.values(styleGrapeCitations).flatMap((entries) =>
        entries.map((entry) => entry.cite),
      ),
    ];
    for (const cite of cites) {
      if (!("grape" in cite)) continue;
      expect(blob.get(cite.grape), cite.quote).toContain(cite.quote);
    }
  });

  it("links each source to its article", () => {
    expect(pairingSourceUrl("pairingEn")).toBe(
      "https://en.wikipedia.org/wiki/Wine_and_food_pairing",
    );
  });

  it("finds a place for every family and every style", () => {
    for (const family of dishFamilyOrder) expect(familyPlates[family], family).toBeDefined();
    const placed = styleFamilies();
    for (const style of pairingStyleCatalogue) {
      expect(placed.get(style.code)?.length ?? 0, style.code).toBeGreaterThan(0);
    }
  });
});
