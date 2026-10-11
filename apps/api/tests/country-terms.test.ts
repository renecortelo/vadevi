import { describe, expect, it } from "vitest";

import { resolveCountryCodes, withoutCountryName } from "../src/repositories/country-terms";

describe("country name resolution", () => {
  it("resolves accented and localized country names to ISO codes", () => {
    expect(resolveCountryCodes("Have I tried anything from México?")).toEqual(["MX"]);
    expect(resolveCountryCodes("algo de Francia")).toEqual(["FR"]);
    expect(resolveCountryCodes("etwas aus Deutschland")).toEqual(["DE"]);
  });

  it("resolves multi-word names that survive a per-term split", () => {
    expect(resolveCountryCodes("wines from estados unidos")).toEqual(["US"]);
    expect(resolveCountryCodes("something from South Africa")).toEqual(["ZA"]);
  });

  it("does not match a country name buried inside another word", () => {
    // "chilena" must not resolve to CL (Chile); the words differ once split.
    expect(resolveCountryCodes("una uva chilena")).toEqual([]);
    expect(resolveCountryCodes("mineral and fresh")).toEqual([]);
  });

  it("returns nothing for an empty or place-free question", () => {
    expect(resolveCountryCodes("")).toEqual([]);
    expect(resolveCountryCodes("which did I score highest?")).toEqual([]);
  });
});

describe("a region without its country", () => {
  it("drops the country a label writes before or after the region", () => {
    expect(withoutCountryName("new zealand marlborough")).toBe("marlborough");
    expect(withoutCountryName("marlborough new zealand")).toBe("marlborough");
    expect(withoutCountryName("stellenbosch south africa")).toBe("stellenbosch");
  });

  it("keeps a region that names no country, or only one", () => {
    expect(withoutCountryName("western cape")).toBe("western cape");
    expect(withoutCountryName("new zealand")).toBe("new zealand");
    expect(withoutCountryName("chilena")).toBe("chilena");
  });
});
