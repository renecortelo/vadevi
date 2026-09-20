import { describe, expect, it } from "vitest";

import {
  CurrencyCodeSchema,
  fromMinorUnits,
  supportedCurrencies,
  toMinorUnits,
} from "../src/cellar";

/**
 * Money is a closed list of currencies, each with a known minor unit. The
 * old schema took any three capital letters and divided every one of them
 * by a hundred — right for the euro, wrong by a hundred for the yen.
 */
describe("currencies", () => {
  it("is the maintainer's closed list, and nothing else", () => {
    expect([...supportedCurrencies]).toEqual(["EUR", "USD", "GBP", "CHF", "MXN"]);
    for (const code of supportedCurrencies)
      expect(CurrencyCodeSchema.safeParse(code).success).toBe(true);
    for (const code of ["JPY", "KWD", "eur", "XXX", "BTC"]) {
      expect(CurrencyCodeSchema.safeParse(code).success).toBe(false);
    }
  });

  it("round-trips an amount through minor units for every currency on the list", () => {
    for (const code of supportedCurrencies) {
      expect(toMinorUnits(12.5, code)).toBe(1250);
      expect(toMinorUnits(0.1 + 0.2, code)).toBe(30);
      expect(fromMinorUnits(toMinorUnits(19.99, code), code)).toBe(19.99);
      expect(fromMinorUnits(0, code)).toBe(0);
    }
  });
});
