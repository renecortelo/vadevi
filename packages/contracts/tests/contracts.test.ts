import { describe, expect, it } from "vitest";

import { ErrorEnvelopeSchema, HealthResponseSchema } from "../src";

describe("transport contracts", () => {
  it("accepts the stable error envelope", () => {
    expect(
      ErrorEnvelopeSchema.parse({
        error: {
          code: "NOT_FOUND",
          message: "The requested resource was not found.",
          requestId: "01K00000000000000000000000",
        },
      }),
    ).toBeDefined();
  });

  it("rejects unknown response fields", () => {
    expect(() =>
      HealthResponseSchema.parse({
        data: {
          status: "ok",
          service: "vadevi-api",
          version: "0.1.0",
          timestamp: "2026-08-12T10:15:30.000Z",
          secret: "must-not-leak",
        },
      }),
    ).toThrow();
  });
});
