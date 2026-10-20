import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { aromaNames } from "../../packages/i18n/src/ontology/aroma-names";
import {
  aromaDescriptors,
  aromaFamilies,
  aromaGroups,
} from "../../packages/i18n/src/ontology/aromas";

/**
 * The aroma vocabulary gives each of the library's aroma terms its place —
 * family and group — for the grape cards' drawings and the aroma wheel. A
 * term added to `data/kb/terms.json` without a place would show without a
 * drawing and be missing from the wheel.
 */
const terms = (
  JSON.parse(readFileSync(resolve("data/kb/terms.json"), "utf8")) as {
    aroma: { terms: Record<string, unknown> };
  }
).aroma.terms;

describe("the aroma vocabulary", () => {
  it("names each aroma in the app as the library's terms do", () => {
    expect(aromaNames).toEqual(terms);
  });

  it("places every aroma term of the library, and only those", () => {
    const placed = aromaDescriptors.map((descriptor) => descriptor.term).sort();
    expect(placed).toEqual(Object.keys(terms).sort());
  });

  it("names each family and group in every language", () => {
    for (const locale of ["ca", "de", "en", "es", "fr", "it", "nl", "pt-PT"]) {
      const library = (
        JSON.parse(
          readFileSync(resolve(`packages/i18n/src/locales/${locale}/common.json`), "utf8"),
        ) as {
          library: { aromaFamily: Record<string, string>; aromaGroup: Record<string, string> };
        }
      ).library;
      expect(Object.keys(library.aromaFamily).sort(), locale).toEqual([...aromaFamilies].sort());
      expect(Object.keys(library.aromaGroup).sort(), locale).toEqual(
        aromaGroups.map((group) => group.id).sort(),
      );
    }
  });

  it("gives each aroma one code and a group of a known family", () => {
    const codes = aromaDescriptors.map((descriptor) => descriptor.code);
    expect(new Set(codes).size).toBe(codes.length);
    const groups = new Set(aromaGroups.map((group) => group.id));
    for (const descriptor of aromaDescriptors) {
      expect(groups.has(descriptor.group), descriptor.code).toBe(true);
      expect(aromaFamilies).toContain(descriptor.family);
    }
  });
});
