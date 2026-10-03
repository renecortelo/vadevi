import type { AssistantLanguageStatement, TastingComparisonRequest } from "@vadevi/domain";
import { BootstrapResponseSchema, CreateWineResponseSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { GrapeEntry } from "../../../scripts/kb/grape-validation";
import { librarySql } from "../../../scripts/kb/library-sql";
import { runDeterministicAssistantTurn } from "../src/repositories/assistant";
import { regenerateTastingComparison } from "../src/repositories/research";
import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * "How does my tasting compare with what you know of the grapes of the Mar
 * de Lluna?" was answered about two other wines: "compare" brought every near
 * match along, and the library was read only for grapes the question named,
 * not the wine's own. Now the question is about that wine, and its grapes'
 * typical profile — attributed to the variety, never to the bottle — stands
 * beside the reader's tasting, here and in the comparison on the wine's page
 * when the producer has said nothing.
 */
const grape = (id: string, names: Record<string, string>, synonyms: string[]): GrapeEntry => ({
  acidity: "low",
  aromas: ["strawberry", "pepper"],
  body: "high",
  color: "red",
  evidence: [
    { field: "aromas", quote: `${id} smells of strawberry and pepper`, value: "strawberry" },
  ],
  id,
  names,
  origin: "ES",
  pairings: [],
  prominence: 10,
  regions: [],
  styles: [],
  summaries: {},
  synonyms: synonyms.map((name) => ({ name, source: "article" as const })),
  tannin: "medium",
  wikidataId: `Q${id.length}${id.charCodeAt(0)}`,
  wikipediaUrl: `https://en.wikipedia.org/wiki/${id}`,
});

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const statement of librarySql(
    [
      grape("grenache", { en: "Grenache", es: "Garnacha" }, ["Garnatxa"]),
      grape("tempranillo", { en: "Tempranillo" }, ["Ull de Llebre"]),
    ],
    "test",
  )) {
    await env.DB.prepare(statement).run();
  }
});

const sub = "firebase-emulator-grape-reference";
const token = emulatorIdToken({ email: "reference@example.test", name: "Reader", sub });
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};
const principal = {
  authTime: Math.floor(Date.now() / 1_000),
  displayName: "Reader",
  email: "reference@example.test",
  emailVerified: true,
  firebaseUid: sub,
};

async function wine(spaceId: string, displayName: string, grapes: string[]) {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
    body: JSON.stringify({
      displayName,
      grapes: grapes.map((name) => ({ name })),
      identityStatus: "confirmed",
      nonVintage: false,
      producerName: "Celler de Prova",
      region: "Empordà",
      vintageYear: 2023,
      wineType: "red",
    }),
    headers: { ...headers, "Idempotency-Key": randomOpaqueToken() },
    method: "POST",
  });
  expect(response.status).toBe(201);
  return CreateWineResponseSchema.parse(await response.json()).data.wine;
}

describe("a tasting set against its grapes", () => {
  it("answers about the wine named, with its grapes' typical profile beside the tasting", async () => {
    const me = BootstrapResponseSchema.parse(
      await (await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers })).json(),
    );
    const spaceId = me.data.user.activeSpaceId;
    const lluna = await wine(spaceId, "Mar de Lluna", ["Garnatxa", "Tempranillo"]);
    await wine(spaceId, "Ruixim de Mar", ["Garnatxa"]);
    await wine(spaceId, "Ruixim Rosé", ["Garnatxa"]);
    const note = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/tasting-notes`, {
      body: JSON.stringify({
        descriptorCodes: ["fruit.citrus.lemon"],
        mode: "quick",
        score100: 86,
        state: "submitted",
        tastedAt: "2026-09-01T12:00:00.000Z",
        wineId: lluna.id,
      }),
      headers: { ...headers, "Idempotency-Key": randomOpaqueToken() },
      method: "POST",
    });
    expect(note.status).toBe(201);

    let seen: AssistantLanguageStatement[] = [];
    const response = await runDeterministicAssistantTurn(env.DB, {
      aiProvider: "cloudflare",
      externalResearch: false,
      language: {
        render: async (input) => {
          seen = input.statements;
          return { claims: [], modelVersion: "@cf/example/model" };
        },
      },
      pairing: null,
      principal,
      request: {
        context: { allowedCrossSpaceIds: [], visibleWineId: null },
        locale: "es",
        message: "¿Cómo se compara mi cata contra lo que sabes de las uvas del Mar de Lluna?",
        saveHistory: false,
        threadId: null,
      },
      requestId: randomOpaqueToken(),
      semanticNotes: null,
      spaceId,
    });

    expect(response?.data.results.map((result) => result.wine.displayName)).toEqual([
      "Mar de Lluna",
    ]);
    const profiles = seen.filter((statement) =>
      statement.id.startsWith(`library-wine-${lluna.id}-`),
    );
    expect(profiles.map((statement) => statement.id).sort()).toEqual([
      `library-wine-${lluna.id}-grenache`,
      `library-wine-${lluna.id}-tempranillo`,
    ]);
    expect(profiles[0]?.text).toContain("not a description of this wine");
    expect(profiles.every((statement) => statement.sourceIds.length === 1)).toBe(true);
    expect(response?.data.libraryGrapes.map((entry) => entry.id).sort()).toEqual([
      "grenache",
      "tempranillo",
    ]);
  });

  it("compares the tasting with the grapes on the wine's page when the producer said nothing", async () => {
    const me = BootstrapResponseSchema.parse(
      await (await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers })).json(),
    );
    const spaceId = me.data.user.activeSpaceId;
    const solo = await wine(spaceId, "Garnatxa Sola", ["Garnatxa"]);
    const note = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/tasting-notes`, {
      body: JSON.stringify({
        descriptorCodes: ["fruit.citrus.lemon"],
        mode: "quick",
        score100: 80,
        state: "submitted",
        tastedAt: "2026-09-02T12:00:00.000Z",
        wineId: solo.id,
      }),
      headers: { ...headers, "Idempotency-Key": randomOpaqueToken() },
      method: "POST",
    });
    expect(note.status).toBe(201);

    let asked: TastingComparisonRequest | null = null;
    const outcome = await regenerateTastingComparison(env.DB, {
      locale: "es",
      narrative: {
        compare: async (input) => {
          asked = input;
          return "Tu cata y la garnacha típica coinciden en la fruta.";
        },
        compose: async () => null,
      },
      principal,
      requestId: randomOpaqueToken(),
      spaceId,
      wineId: solo.id,
    });
    expect(outcome).toBe("ok");
    expect(asked!.sources).toEqual([]);
    expect(asked!.grapes?.[0]).toContain("Grenache (recorded as Garnatxa)");
    const fact = await env.DB.prepare(
      `SELECT research_method FROM facts WHERE subject_id = ? AND predicate = 'tasting.comparison'
        AND status <> 'retired'`,
    )
      .bind(solo.id)
      .first<{ research_method: string }>();
    expect(fact?.research_method).toBe("tasting.comparison.grapes.v1");
    const citations = await env.DB.prepare(
      `SELECT source.canonical_url FROM fact_citations citation
        JOIN sources source ON source.id = citation.source_id
        JOIN facts fact ON fact.id = citation.fact_id
        WHERE fact.subject_id = ? AND fact.predicate = 'tasting.comparison'`,
    )
      .bind(solo.id)
      .all<{ canonical_url: string }>();
    expect(citations.results.map((row) => row.canonical_url)).toEqual([
      "https://en.wikipedia.org/wiki/grenache",
    ]);
  });

  it("sets the tasting against both the producer's words and the grapes", async () => {
    const me = BootstrapResponseSchema.parse(
      await (await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers })).json(),
    );
    const spaceId = me.data.user.activeSpaceId;
    const both = await wine(spaceId, "Tempranillo de Finca", ["Tempranillo"]);
    const note = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/tasting-notes`, {
      body: JSON.stringify({
        descriptorCodes: ["fruit.citrus.lemon"],
        mode: "quick",
        score100: 88,
        state: "submitted",
        tastedAt: "2026-09-03T12:00:00.000Z",
        wineId: both.id,
      }),
      headers: { ...headers, "Idempotency-Key": randomOpaqueToken() },
      method: "POST",
    });
    expect(note.status).toBe(201);
    // Research found the producer's page: it speaks of the estate, and of the
    // glass only in passing.
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO sources (id, space_id, canonical_url, title, publisher, source_type,
          license_identifier, retrieved_at, last_checked_at, content_hash, created_by_user_id,
          created_by_provider, created_at, updated_at)
        VALUES ('01J00000000000000000000SRC', ?, 'https://finca.example/vino', 'Finca', 'Finca',
          'producer', NULL, ?, NULL, NULL, NULL, 'test', ?, ?)`,
      ).bind(spaceId, now, now, now),
      env.DB.prepare(
        `INSERT INTO facts (id, space_id, subject_type, subject_id, predicate, value_json,
          evidence_class, confidence_milli, status, observed_by_user_id, verified_by_user_id,
          verified_at, research_method, version, created_at, updated_at, deleted_at, locale)
        VALUES ('01J00000000000000000000FCT', ?, 'wine', ?, 'research.summary', ?, 'researched',
          700, 'proposed', NULL, NULL, NULL, 'test', 1, ?, ?, NULL, 'es')`,
      ).bind(
        spaceId,
        both.id,
        JSON.stringify("Una finca familiar desde 1920. En nariz, cereza madura y regaliz. Perfecto para una copa de tarde."),
        now,
        now,
      ),
      env.DB.prepare(
        `INSERT INTO fact_citations (fact_id, source_id, locator, support_strength, created_at)
        VALUES ('01J00000000000000000000FCT', '01J00000000000000000000SRC', NULL, 'supporting', ?)`,
      ).bind(now),
    ]);

    let asked: TastingComparisonRequest | null = null;
    const outcome = await regenerateTastingComparison(env.DB, {
      locale: "es",
      narrative: {
        compare: async (input) => {
          asked = input;
          return "Encontraste lo que el productor y el tempranillo típico describen.";
        },
        compose: async () => null,
      },
      principal,
      requestId: randomOpaqueToken(),
      spaceId,
      wineId: both.id,
    });
    expect(outcome).toBe("ok");
    // Only the sentence about the glass; the estate and the afternoon go.
    expect(asked!.sources).toEqual(["En nariz, cereza madura y regaliz."]);
    expect(asked!.grapes?.[0]).toContain("Tempranillo, as the variety typically is");
    const cited = await env.DB.prepare(
      `SELECT fact.research_method, source.canonical_url FROM facts fact
        JOIN fact_citations citation ON citation.fact_id = fact.id
        JOIN sources source ON source.id = citation.source_id
        WHERE fact.subject_id = ? AND fact.predicate = 'tasting.comparison'
          AND fact.status <> 'retired'
        ORDER BY source.canonical_url`,
    )
      .bind(both.id)
      .all<{ canonical_url: string; research_method: string }>();
    expect(cited.results.map((row) => row.canonical_url)).toEqual([
      "https://en.wikipedia.org/wiki/tempranillo",
      "https://finca.example/vino",
    ]);
    expect(cited.results[0]?.research_method).toBe("tasting.comparison.mixed.v1");
  });
});
