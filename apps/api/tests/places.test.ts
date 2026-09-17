import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const ownerToken = emulatorIdToken({
  email: "places-owner@example.test",
  name: "Places Owner",
  sub: "firebase-emulator-user-places-owner",
});

async function activeSpaceId() {
  const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  const body = (await response.json()) as { data: { user: { activeSpaceId: string } } };
  return body.data.user.activeSpaceId;
}

describe("venue lookup", () => {
  it("is off by default and says so rather than reaching a provider", async () => {
    const spaceId = await activeSpaceId();
    for (const [path, body] of [
      ["search", { locale: "es", query: "Can Pau Barcelona" }],
      ["reverse", { latitude: 41.385, locale: "es", longitude: 2.173 }],
    ] as const) {
      const response = await SELF.fetch(
        `https://vadevi.test/api/v1/spaces/${spaceId}/places/${path}`,
        {
          body: JSON.stringify(body),
          headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" },
          method: "POST",
        },
      );
      expect(response.status).toBe(503);
      const envelope = (await response.json()) as { error: { code: string } };
      expect(envelope.error.code).toBe("FEATURE_UNAVAILABLE");
    }
  });

  it("refuses an unauthenticated lookup before any provider is considered", async () => {
    const response = await SELF.fetch(
      "https://vadevi.test/api/v1/spaces/01J0000000000000000000000A/places/search",
      {
        body: JSON.stringify({ locale: "es", query: "Can Pau" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    expect(response.status).toBe(401);
  });

  it("reports the deployment's venue-lookup state in the bootstrap features", async () => {
    const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const body = (await response.json()) as {
      data: { features: { venuePlaceSearch: boolean } };
    };
    expect(body.data.features.venuePlaceSearch).toBe(false);
  });
});
