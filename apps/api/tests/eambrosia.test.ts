import { describe, expect, it } from "vitest";

import { resolveAppellationFacts } from "../src/repositories/eambrosia";

const now = "2026-08-22T10:00:00.000Z";

describe("eAmbrosia appellation facts", () => {
  it("resolves a region to its country and protection category, cited to eAmbrosia", () => {
    const facts = resolveAppellationFacts("Rioja", now);
    expect(facts).toEqual([
      {
        confidenceMilli: 950,
        predicate: "region.country",
        researchMethod: "eambrosia.register.v1",
        source: expect.objectContaining({
          licenseIdentifier: "CC-BY-4.0",
          publisher: "eAmbrosia (European Commission)",
          sourceType: "open_dataset",
        }),
        value: "Spain",
      },
      {
        confidenceMilli: 950,
        predicate: "region.classification",
        researchMethod: "eambrosia.register.v1",
        source: expect.objectContaining({ publisher: "eAmbrosia (European Commission)" }),
        value: "Protected Designation of Origin (PDO)",
      },
    ]);
    expect(facts[0]?.source.canonicalUrl.startsWith("https://ec.europa.eu/")).toBe(true);
  });

  it("matches a multi-word appellation inside the region text", () => {
    const facts = resolveAppellationFacts("Ribera del Duero", now);
    expect(facts[0]?.value).toBe("Spain");
    expect(resolveAppellationFacts("Barolo DOCG", now)[0]?.value).toBe("Italy");
  });

  it("yields nothing for a region that names no listed appellation", () => {
    expect(resolveAppellationFacts("Parras Valley", now)).toEqual([]);
    expect(resolveAppellationFacts(null, now)).toEqual([]);
    expect(resolveAppellationFacts("", now)).toEqual([]);
  });
});
