import {
  ErrorEnvelopeSchema,
  HealthResponseSchema,
  RuntimeConfigResponseSchema,
} from "@vadevi/contracts";
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

  it("serves only public browser runtime configuration", async () => {
    const response = await createApi().request(
      "/runtime-config",
      {},
      {
        AI_PROVIDER: "none",
        APP_ENV: "local",
        FIREBASE_AUTH_DOMAIN: "localhost",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
        FIREBASE_PROJECT_ID: "demo-vadevi",
        FIREBASE_WEB_API_KEY: "local-emulator-placeholder",
      },
    );
    const body = RuntimeConfigResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: {
        appEnvironment: "local",
        features: {
          assistant: false,
          externalResearch: false,
          priceLookup: false,
          voiceInput: false,
        },
        firebase: {
          apiKey: "local-emulator-placeholder",
          authDomain: "localhost",
          emulatorHost: "127.0.0.1:9099",
          projectId: "demo-vadevi",
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
