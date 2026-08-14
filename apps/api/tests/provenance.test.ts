import {
  BootstrapResponseSchema,
  CreateWineResponseSchema,
  ErrorEnvelopeSchema,
  type Fact,
  FactResponseSchema,
  SourceResponseSchema,
  WineFactsResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const ownerToken = emulatorIdToken({
  email: "provenance-owner@example.test",
  name: "Provenance Owner",
  sub: "firebase-emulator-user-phase-4-owner",
});
const outsiderToken = emulatorIdToken({
  email: "provenance-outsider@example.test",
  name: "Provenance Outsider",
  sub: "firebase-emulator-user-phase-4-outsider",
});

function headers(token: string, idempotencyKey?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(idempotencyKey === undefined ? {} : { "Idempotency-Key": idempotencyKey }),
  };
}

async function bootstrap(token: string) {
  const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  return BootstrapResponseSchema.parse(await response.json());
}

async function createWine(spaceId: string) {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
    body: JSON.stringify({
      displayName: "Evidence Wine",
      identityStatus: "confirmed",
      nonVintage: false,
      producerName: "Evidence Producer",
      vintageYear: 2023,
      wineType: "red",
    }),
    headers: headers(ownerToken, randomOpaqueToken()),
    method: "POST",
  });
  expect(response.status).toBe(201);
  return CreateWineResponseSchema.parse(await response.json()).data.wine;
}

async function createSource(spaceId: string, title: string, path: string) {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/sources`, {
    body: JSON.stringify({
      canonicalUrl: `https://producer.example.test/${path}`,
      publisher: "Synthetic Producer",
      retrievedAt: "2026-08-13T20:00:00.000Z",
      sourceType: "producer",
      title,
    }),
    headers: headers(ownerToken, randomOpaqueToken()),
    method: "POST",
  });
  expect(response.status).toBe(201);
  return SourceResponseSchema.parse(await response.json()).data;
}

async function createFact(
  spaceId: string,
  wineId: string,
  sourceId: string,
  value: number,
  key = randomOpaqueToken(),
) {
  const response = await SELF.fetch(
    `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wineId}/facts`,
    {
      body: JSON.stringify({
        citations: [{ locator: "Technical sheet", sourceId, supportStrength: "direct" }],
        confidenceMilli: 900,
        evidenceClass: "researched",
        predicate: "production.aging_months",
        value,
      }),
      headers: headers(ownerToken, key),
      method: "POST",
    },
  );
  return { body: await response.json(), response };
}

describe("Provenance foundation", () => {
  it("stores cited facts, preserves conflicts, and changes the preferred claim explicitly", async () => {
    const owner = await bootstrap(ownerToken);
    await bootstrap(outsiderToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId);
    const firstSource = await createSource(spaceId, "First technical sheet", "first");
    const secondSource = await createSource(spaceId, "Second technical sheet", "second");

    const idempotencyKey = randomOpaqueToken();
    const firstCreated = await createFact(spaceId, wine.id, firstSource.id, 12, idempotencyKey);
    expect(firstCreated.response.status).toBe(201);
    const first = FactResponseSchema.parse(firstCreated.body).data;
    expect(first).toMatchObject({
      citations: [
        expect.objectContaining({
          locator: "Technical sheet",
          source: expect.objectContaining({ id: firstSource.id }),
          supportStrength: "direct",
        }),
      ],
      evidenceClass: "researched",
      status: "proposed",
      value: 12,
    });

    const replay = await createFact(spaceId, wine.id, firstSource.id, 12, idempotencyKey);
    expect(replay.response.status).toBe(201);
    expect(replay.response.headers.get("Idempotency-Replayed")).toBe("true");
    expect(FactResponseSchema.parse(replay.body).data.id).toBe(first.id);

    const secondCreated = await createFact(spaceId, wine.id, secondSource.id, 18);
    expect(secondCreated.response.status).toBe(201);
    const second = FactResponseSchema.parse(secondCreated.body).data;

    const listResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}/facts`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    const listed = WineFactsResponseSchema.parse(await listResponse.json());
    expect(listed.data.facts).toHaveLength(2);
    expect(listed.data.conflicts).toEqual([
      {
        acceptedFactId: null,
        factIds: [first.id, second.id],
        predicate: "production.aging_months",
      },
    ]);

    const acceptFirstResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/facts/${first.id}/accept`,
      {
        body: JSON.stringify({ version: first.version }),
        headers: headers(ownerToken),
        method: "POST",
      },
    );
    const acceptedFirst = FactResponseSchema.parse(await acceptFirstResponse.json()).data;
    expect(acceptedFirst.status).toBe("accepted");
    expect(acceptedFirst.verifiedByUserId).toBe(owner.data.user.id);

    const acceptSecondResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/facts/${second.id}/accept`,
      {
        body: JSON.stringify({ version: second.version }),
        headers: headers(ownerToken),
        method: "POST",
      },
    );
    expect(acceptSecondResponse.status).toBe(200);
    const finalResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}/facts`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    const final = WineFactsResponseSchema.parse(await finalResponse.json());
    expect(final.data.facts.find((fact: Fact) => fact.id === first.id)?.status).toBe("disputed");
    expect(final.data.facts.find((fact: Fact) => fact.id === second.id)?.status).toBe("accepted");
    expect(final.data.conflicts[0]?.acceptedFactId).toBe(second.id);

    const staleAccept = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/facts/${second.id}/accept`,
      {
        body: JSON.stringify({ version: second.version }),
        headers: headers(ownerToken),
        method: "POST",
      },
    );
    const staleBody = ErrorEnvelopeSchema.parse(await staleAccept.json());
    expect(staleAccept.status).toBe(409);
    expect(staleBody.error.details?.current).toMatchObject({ status: "accepted" });

    const outsiderFacts = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}/facts`,
      { headers: { Authorization: `Bearer ${outsiderToken}` } },
    );
    expect(outsiderFacts.status).toBe(404);
    const outsiderSource = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/sources/${firstSource.id}`,
      { headers: { Authorization: `Bearer ${outsiderToken}` } },
    );
    expect(outsiderSource.status).toBe(404);
  }, 30_000);

  it("rejects uncited research, unregistered values, and unsafe source URLs", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId);
    const uncited = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}/facts`,
      {
        body: JSON.stringify({
          citations: [],
          evidenceClass: "researched",
          predicate: "production.aging_months",
          value: 12,
        }),
        headers: headers(ownerToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    expect(uncited.status).toBe(400);

    const invalidValue = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}/facts`,
      {
        body: JSON.stringify({
          citations: [],
          evidenceClass: "observed",
          predicate: "production.aging_months",
          value: "twelve",
        }),
        headers: headers(ownerToken, randomOpaqueToken()),
        method: "POST",
      },
    );
    expect(invalidValue.status).toBe(400);

    for (const canonicalUrl of [
      "http://producer.example.test/page",
      "https://127.0.0.1/page",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/page",
      "https://synthetic-credential@producer.example.test/page",
    ]) {
      const unsafeSource = await SELF.fetch(
        `https://vadevi.test/api/v1/spaces/${spaceId}/sources`,
        {
          body: JSON.stringify({
            canonicalUrl,
            publisher: "Unsafe",
            retrievedAt: "2026-08-13T20:00:00.000Z",
            sourceType: "other_web",
            title: "Unsafe source",
          }),
          headers: headers(ownerToken, randomOpaqueToken()),
          method: "POST",
        },
      );
      expect(unsafeSource.status, canonicalUrl).toBe(400);
    }
  }, 30_000);
});
