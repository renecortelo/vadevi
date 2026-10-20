import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { hueLabels } from "../apps/api/src/repositories/hue-labels";

/** The API finds a wine by its colour under every name the interface gives it. */
describe("hue labels", () => {
  it("are the catalogues' own names for each colour, in all eight languages", () => {
    const locales = ["en", "es", "ca", "fr", "de", "it", "nl", "pt-PT"];
    const expected: Record<string, string[]> = {};
    for (const locale of locales) {
      const catalogue = JSON.parse(
        readFileSync(resolve(`packages/i18n/src/locales/${locale}/common.json`), "utf8"),
      ) as { tasting: { hueOption: Record<string, string> } };
      for (const [code, label] of Object.entries(catalogue.tasting.hueOption)) {
        expected[code] ??= [];
        if (!expected[code].includes(label)) expected[code].push(label);
      }
    }
    expect(hueLabels).toEqual(expected);
  });
});
