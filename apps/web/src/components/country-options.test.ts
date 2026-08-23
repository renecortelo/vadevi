import { describe, expect, it } from "vitest";

import { countryName, countryOptions, countryOptionsFor } from "./country-options";

describe("country options", () => {
  it("names countries in the reader's language and sorts for it", () => {
    const spanish = countryOptions("es");
    expect(spanish.find((option) => option.code === "ES")?.name).toBe("España");
    expect(spanish.find((option) => option.code === "FR")?.name).toBe("Francia");
    const english = countryOptions("en");
    expect(english.find((option) => option.code === "ES")?.name).toBe("Spain");
    // Sorted by the localized name, not by code.
    const names = spanish.map((option) => option.name);
    expect([...names].sort((a, b) => a.localeCompare(b, "es"))).toEqual(names);
  });

  it("keeps a stored country the list does not offer", () => {
    // "JM" is not a wine country in the list, but a record could still hold it.
    expect(countryOptions("en").some((option) => option.code === "JM")).toBe(false);
    const withStored = countryOptionsFor("en", "jm");
    expect(withStored.some((option) => option.code === "JM")).toBe(true);
    // An empty or already-listed value adds nothing.
    expect(countryOptionsFor("en", "")).toHaveLength(countryOptions("en").length);
    expect(countryOptionsFor("en", "ES")).toHaveLength(countryOptions("en").length);
  });

  it("shows a stored code by name, and leaves an unusable one alone", () => {
    expect(countryName("MX", "es")).toBe("México");
    expect(countryName("", "es")).toBe("");
    expect(countryName("SPAIN", "es")).toBe("SPAIN");
  });
});
