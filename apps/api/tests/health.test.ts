import { ErrorEnvelopeSchema, HealthResponseSchema } from "@vadevi/contracts";
import { describe, expect, it } from "vitest";

import { createApi } from "../src/app";

describe("runtime routes", () => {
  it("serves the public health contract with a request ID", async () => {
    const response = await createApi().request("/health", {}, { APP_VERSION: "0.1.0" });

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(HealthResponseSchema.parse(await response.json()).data.status).toBe("ok");
  });

  it("returns a safe envelope without enumerating unknown resources", async () => {
    const response = await createApi().request("/api/v1/spaces/not-real");
    const body = ErrorEnvelopeSchema.parse(await response.json());

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.requestId).toBe(response.headers.get("X-Request-Id"));
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("replaces an unsafe caller-supplied request ID", async () => {
    const response = await createApi().request("/health", {
      headers: { "X-Request-Id": "private-data-in-a-log" },
    });

    expect(response.headers.get("X-Request-Id")).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
