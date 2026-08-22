import {
  BootstrapResponseSchema,
  CreateWineResponseSchema,
  type Fact,
  type ResearchCandidate,
  ResearchJobResponseSchema,
  WineFactsResponseSchema,
} from "@vadevi/contracts";
import type { ResearchPorts } from "@vadevi/domain";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createResearchJob, researchCandidates } from "../src/repositories/research";
import { randomOpaqueToken } from "../src/security/opaque-token";
import type { FirebasePrincipal } from "../src/types";
import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const ownerUid = "firebase-emulator-user-phase-4-research-owner";
const ownerToken = emulatorIdToken({
  email: "research-owner@example.test",
  name: "Research Owner",
  sub: ownerUid,
});
const outsiderToken = emulatorIdToken({
  email: "research-outsider@example.test",
  name: "Research Outsider",
  sub: "firebase-emulator-user-phase-4-research-outsider",
});
const principal: FirebasePrincipal = {
  authTime: Math.floor(Date.now() / 1_000),
  displayName: "Research Owner",
  email: "research-owner@example.test",
  firebaseUid: ownerUid,
};

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
      barcode: "8410000000099",
      displayName: "Research Wine",
      identityStatus: "confirmed",
      nonVintage: false,
      producerName: "Synthetic Research Estate",
      vintageYear: 2022,
      wineType: "red",
    }),
    headers: headers(ownerToken, randomOpaqueToken()),
    method: "POST",
  });
  expect(response.status).toBe(201);
  return CreateWineResponseSchema.parse(await response.json()).data.wine;
}

describe("bounded wine research jobs", () => {
  it("degrades explicitly with providers disabled and protects the job from outsiders", async () => {
    const owner = await bootstrap(ownerToken);
    await bootstrap(outsiderToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId);
    const key = randomOpaqueToken();
    const request = () =>
      SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}/research-jobs`, {
        body: JSON.stringify({ locale: "en", topics: ["identity", "producer"] }),
        headers: headers(ownerToken, key),
        method: "POST",
      });

    const firstResponse = await request();
    const first = ResearchJobResponseSchema.parse(await firstResponse.json());
    expect(firstResponse.status).toBe(201);
    expect(first.data).toMatchObject({
      attempts: [],
      factIds: [],
      providerMode: "none",
      sourceIds: [],
      status: "degraded",
      warnings: expect.arrayContaining(["provider_disabled", "no_results"]),
    });

    const replay = await request();
    expect(replay.status).toBe(201);
    expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
    expect(ResearchJobResponseSchema.parse(await replay.json()).data.id).toBe(first.data.id);

    const ownerRead = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/research-jobs/${first.data.id}`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    expect(ownerRead.status).toBe(200);
    const outsiderRead = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/research-jobs/${first.data.id}`,
      { headers: { Authorization: `Bearer ${outsiderToken}` } },
    );
    expect(outsiderRead.status).toBe(404);
  });

  it("persists enabled-provider output only as cited proposed facts and replays safely", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId);
    const retrievedAt = "2026-08-14T07:00:00.000Z";
    const source = {
      canonicalUrl: "https://www.wikidata.org/wiki/Q999",
      licenseIdentifier: "CC0-1.0",
      publisher: "Wikidata",
      retrievedAt,
      sourceType: "open_dataset" as const,
      title: "Synthetic Research Estate",
    };
    const ports: ResearchPorts = {
      knowledge: {
        research: async () => ({
          cached: false,
          data: [
            {
              confidenceMilli: 750,
              predicate: "producer.name",
              researchMethod: "wikidata.entity.v1",
              source,
              value: "Synthetic Research Estate",
            },
            {
              confidenceMilli: 600,
              predicate: "producer.history",
              researchMethod: "wikidata.entity.v1",
              source,
              value: "A fictional estate used to verify provenance behavior.",
            },
          ],
          status: "success",
        }),
        searchEntities: async () => ({ cached: false, data: [], status: "success" }),
      },
      product: {
        lookupBarcode: async ({ barcode }) => ({
          cached: false,
          data: {
            barcode,
            brands: ["Synthetic Research Estate"],
            categories: ["en:wines"],
            countryTags: ["en:spain"],
            name: "Research Wine",
            provider: "open_food_facts",
            source: {
              canonicalUrl: `https://world.openfoodfacts.org/product/${barcode}`,
              licenseIdentifier: "ODbL-1.0",
              publisher: "Open Food Facts",
              retrievedAt,
              sourceType: "open_dataset",
              title: "Research Wine",
            },
            warnings: ["coverage_and_accuracy_uncertain"],
          },
          status: "success",
        }),
      },
      providerMode: "open_data",
    };
    const idempotencyKey = randomOpaqueToken();
    const options = {
      idempotencyKey,
      ports,
      principal,
      request: {
        locale: "en" as const,
        maxSources: 4,
        topics: ["identity", "producer"] as const,
        wikidataEntityIds: { producer: "Q999" },
      },
      requestId: randomOpaqueToken(),
      spaceId,
      wineId: wine.id,
    };

    const first = await createResearchJob(env.DB, options);
    expect(first.kind).toBe("success");
    if (first.kind !== "success") throw new Error("Expected a completed research job.");
    expect(first).toMatchObject({ replayed: false, response: { data: { status: "completed" } } });
    expect(first.response.data.factIds).toHaveLength(3);
    expect(first.response.data.sourceIds).toHaveLength(2);

    const factsResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}/facts`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    const facts = WineFactsResponseSchema.parse(await factsResponse.json()).data.facts;
    expect(facts).toHaveLength(3);
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          citations: [expect.objectContaining({ supportStrength: "direct" })],
          evidenceClass: "researched",
          status: "proposed",
          verifiedAt: null,
          verifiedByUserId: null,
        }),
      ]),
    );
    expect(facts.every((fact: Fact) => fact.citations[0]?.source.createdByProvider !== null)).toBe(
      true,
    );

    const replay = await createResearchJob(env.DB, {
      ...options,
      ports: { knowledge: null, product: null, providerMode: "none" },
      requestId: randomOpaqueToken(),
    });
    expect(replay).toMatchObject({
      kind: "success",
      replayed: true,
      response: { data: { id: first.response.data.id, status: "completed" } },
    });
    const counts = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM facts WHERE subject_id = ?) AS facts,
        (SELECT COUNT(*) FROM fact_citations citation
          JOIN facts fact ON fact.id = citation.fact_id WHERE fact.subject_id = ?) AS citations,
        (SELECT COUNT(*) FROM audit_events WHERE target_id = ? AND action = 'research.completed') AS audits`,
    )
      .bind(wine.id, wine.id, first.response.data.id)
      .first<{ audits: number; citations: number; facts: number }>();
    expect(counts).toEqual({ audits: 1, citations: 3, facts: 3 });
  });

  it("resolves the producer to a Wikidata entity by name when no id is supplied", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId);
    const retrievedAt = "2026-08-14T07:00:00.000Z";
    const source = {
      canonicalUrl: "https://www.wikidata.org/wiki/Q999",
      licenseIdentifier: "CC0-1.0",
      publisher: "Wikidata",
      retrievedAt,
      sourceType: "open_dataset" as const,
      title: "Synthetic Research Estate",
    };
    const searchTerms: string[] = [];
    const researchedIds: string[] = [];
    const ports: ResearchPorts = {
      knowledge: {
        research: async ({ entityId }) => {
          researchedIds.push(entityId);
          return {
            cached: false,
            data: [
              {
                confidenceMilli: 750,
                predicate: "producer.name",
                researchMethod: "wikidata.entity.v1",
                source,
                value: "Synthetic Research Estate",
              },
            ],
            status: "success",
          };
        },
        searchEntities: async ({ term }) => {
          searchTerms.push(term);
          return {
            cached: false,
            data: [
              {
                description: "a fictional estate",
                id: "Q4242",
                label: "Synthetic Research Estate",
              },
            ],
            status: "success",
          };
        },
      },
      product: null,
      providerMode: "open_data",
    };
    const first = await createResearchJob(env.DB, {
      idempotencyKey: randomOpaqueToken(),
      ports,
      principal,
      request: {
        locale: "en" as const,
        maxSources: 4,
        topics: ["producer"] as const,
        wikidataEntityIds: {},
      },
      requestId: randomOpaqueToken(),
      spaceId,
      wineId: wine.id,
    });
    expect(first.kind).toBe("success");
    if (first.kind !== "success") throw new Error("Expected a completed research job.");
    expect(searchTerms).toContain("Synthetic Research Estate");
    expect(researchedIds).toEqual(["Q4242"]);
    expect(first.response.data.factIds).toHaveLength(1);
    expect(first.response.data.warnings).not.toContain("missing_wikidata_entity");
  });

  it("leaves the producer unresolved when no candidate name is close enough", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId);
    const researchedIds: string[] = [];
    const ports: ResearchPorts = {
      knowledge: {
        research: async ({ entityId }) => {
          researchedIds.push(entityId);
          return { cached: false, data: [], status: "success" };
        },
        searchEntities: async () => ({
          cached: false,
          data: [
            {
              description: "an unrelated thing",
              id: "Q1",
              label: "Something Completely Different",
            },
          ],
          status: "success",
        }),
      },
      product: null,
      providerMode: "open_data",
    };
    const first = await createResearchJob(env.DB, {
      idempotencyKey: randomOpaqueToken(),
      ports,
      principal,
      request: {
        locale: "en" as const,
        maxSources: 4,
        topics: ["producer"] as const,
        wikidataEntityIds: {},
      },
      requestId: randomOpaqueToken(),
      spaceId,
      wineId: wine.id,
    });
    expect(first.kind).toBe("success");
    if (first.kind !== "success") throw new Error("Expected a completed research job.");
    expect(researchedIds).toEqual([]);
    expect(first.response.data.factIds).toHaveLength(0);
    expect(first.response.data.warnings).toContain("missing_wikidata_entity");
  });

  it("offers producer candidates to disambiguate, ranking the wine sense first", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const wine = await createWine(spaceId);
    const ports: ResearchPorts = {
      knowledge: {
        research: async () => ({ cached: false, data: [], status: "success" }),
        searchEntities: async ({ subjectType, term }) => ({
          cached: false,
          data:
            subjectType === "producer"
              ? [
                  { description: "genus of arachnids", id: "Q1", label: term },
                  { description: "Spanish wine region", id: "Q2", label: term },
                ]
              : [],
          status: "success",
        }),
      },
      product: null,
      providerMode: "open_data",
    };
    const result = await researchCandidates(env.DB, {
      locale: "en",
      ports,
      principal,
      spaceId,
      wineId: wine.id,
    });
    expect(result).not.toBeNull();
    expect(result?.data.producer?.term).toBe("Synthetic Research Estate");
    // The arachnid genus is still offered, just below the wine region.
    expect(
      result?.data.producer?.candidates.map((candidate: ResearchCandidate) => candidate.id),
    ).toEqual(["Q2", "Q1"]);
    // createWine records no region, so there is nothing to disambiguate there.
    expect(result?.data.region).toBeNull();
  });

  it("returns null candidates for a wine the caller cannot see", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const ports: ResearchPorts = {
      knowledge: {
        research: async () => ({ cached: false, data: [], status: "success" }),
        searchEntities: async () => ({ cached: false, data: [], status: "success" }),
      },
      product: null,
      providerMode: "open_data",
    };
    const result = await researchCandidates(env.DB, {
      locale: "en",
      ports,
      principal,
      spaceId,
      wineId: "01JZZZZZZZZZZZZZZZZZZZZZZZZ",
    });
    expect(result).toBeNull();
  });

  it("adds the region's country and category from eAmbrosia, cited, without a network call", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const created = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
      body: JSON.stringify({
        displayName: "Rioja Reserva",
        identityStatus: "confirmed",
        nonVintage: false,
        producerName: "Bodega Ejemplo",
        region: "Rioja",
        vintageYear: 2019,
        wineType: "red",
      }),
      headers: headers(ownerToken, randomOpaqueToken()),
      method: "POST",
    });
    expect(created.status).toBe(201);
    const wine = CreateWineResponseSchema.parse(await created.json()).data.wine;
    // Knowledge port returns nothing, so any place fact can only come from the
    // offline eAmbrosia register — no network involved.
    const ports: ResearchPorts = {
      knowledge: {
        research: async () => ({ cached: false, data: [], status: "success" }),
        searchEntities: async () => ({ cached: false, data: [], status: "success" }),
      },
      product: null,
      providerMode: "open_data",
    };
    const first = await createResearchJob(env.DB, {
      idempotencyKey: randomOpaqueToken(),
      ports,
      principal,
      request: {
        locale: "en" as const,
        maxSources: 4,
        topics: ["region"] as const,
        wikidataEntityIds: {},
      },
      requestId: randomOpaqueToken(),
      spaceId,
      wineId: wine.id,
    });
    expect(first.kind).toBe("success");
    if (first.kind !== "success") throw new Error("Expected a completed research job.");
    const factsResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}/facts`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    const facts = WineFactsResponseSchema.parse(await factsResponse.json()).data.facts;
    const country = facts.find((fact: Fact) => fact.predicate === "region.country");
    expect(country?.value).toBe("Spain");
    expect(country?.citations[0]?.source.publisher).toBe("eAmbrosia (European Commission)");
    expect(facts.some((fact: Fact) => fact.predicate === "region.classification")).toBe(true);
  });

  it("resolves the wine's grapes by name and researches them for highlights", async () => {
    const owner = await bootstrap(ownerToken);
    const spaceId = owner.data.user.activeSpaceId!;
    const created = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
      body: JSON.stringify({
        displayName: "Varietal Red",
        grapes: [{ name: "Tempranillo", percentage: 100 }],
        identityStatus: "confirmed",
        nonVintage: false,
        producerName: "Bodega Ejemplo",
        vintageYear: 2019,
        wineType: "red",
      }),
      headers: headers(ownerToken, randomOpaqueToken()),
      method: "POST",
    });
    expect(created.status).toBe(201);
    const wine = CreateWineResponseSchema.parse(await created.json()).data.wine;

    const searchedGrapes: string[] = [];
    const ports: ResearchPorts = {
      knowledge: {
        research: async ({ subjectType }) =>
          subjectType === "grape"
            ? {
                cached: false,
                data: [
                  {
                    confidenceMilli: 800,
                    predicate: "curiosity.highlight",
                    researchMethod: "wikidata.highlight.v1",
                    source: {
                      canonicalUrl: "https://www.wikidata.org/wiki/Q1122",
                      licenseIdentifier: "CC0-1.0",
                      publisher: "Wikidata",
                      retrievedAt: "2026-08-14T07:00:00.000Z",
                      sourceType: "open_dataset",
                      title: "Tempranillo",
                    },
                    value: "color: tinta",
                  },
                ],
                status: "success",
              }
            : { cached: false, data: [], status: "success" },
        searchEntities: async ({ subjectType, term }) => {
          if (subjectType === "grape") {
            searchedGrapes.push(term);
            return {
              cached: false,
              data: [{ description: "a grape variety", id: "Q1122", label: "Tempranillo" }],
              status: "success",
            };
          }
          return { cached: false, data: [], status: "success" };
        },
      },
      product: null,
      providerMode: "open_data",
    };
    const first = await createResearchJob(env.DB, {
      idempotencyKey: randomOpaqueToken(),
      ports,
      principal,
      request: {
        locale: "en" as const,
        maxSources: 4,
        topics: ["grapes"] as const,
        wikidataEntityIds: {},
      },
      requestId: randomOpaqueToken(),
      spaceId,
      wineId: wine.id,
    });
    expect(first.kind).toBe("success");
    if (first.kind !== "success") throw new Error("Expected a completed research job.");
    expect(searchedGrapes).toEqual(["Tempranillo"]);

    const factsResponse = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${wine.id}/facts`,
      { headers: { Authorization: `Bearer ${ownerToken}` } },
    );
    const facts = WineFactsResponseSchema.parse(await factsResponse.json()).data.facts;
    const highlight = facts.find((fact: Fact) => fact.predicate === "curiosity.highlight");
    expect(highlight?.value).toBe("color: tinta");
  });
});
