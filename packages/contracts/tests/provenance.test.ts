import { describe, expect, it } from "vitest";

import { CreateSourceRequestSchema, CreateWineFactRequestSchema } from "../src";

const sourceId = "01K00000000000000000000000";

describe("provenance contracts", () => {
  it("requires citations for researched facts and validates registered values", () => {
    expect(() =>
      CreateWineFactRequestSchema.parse({
        citations: [],
        evidenceClass: "researched",
        predicate: "production.aging_months",
        value: 12,
      }),
    ).toThrow();
    expect(() =>
      CreateWineFactRequestSchema.parse({
        citations: [{ sourceId, supportStrength: "direct" }],
        evidenceClass: "researched",
        predicate: "production.aging_months",
        value: "twelve",
      }),
    ).toThrow();
    expect(
      CreateWineFactRequestSchema.parse({
        citations: [{ sourceId, supportStrength: "direct" }],
        evidenceClass: "researched",
        predicate: "production.aging_months",
        value: 12,
      }),
    ).toBeDefined();
  });

  it("accepts public HTTPS citation URLs and rejects unsafe literal targets", () => {
    const request = {
      publisher: "Synthetic publisher",
      retrievedAt: "2026-08-13T20:00:00.000Z",
      sourceType: "producer",
      title: "Synthetic source",
    } as const;
    expect(
      CreateSourceRequestSchema.parse({
        ...request,
        canonicalUrl: "https://producer.example.test/technical-sheet",
      }),
    ).toBeDefined();
    for (const canonicalUrl of [
      "http://producer.example.test/page",
      "https://127.0.0.1/page",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/page",
    ]) {
      expect(() => CreateSourceRequestSchema.parse({ ...request, canonicalUrl })).toThrow();
    }
  });
});
