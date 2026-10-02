import type { AssistantLanguageStatement } from "@vadevi/domain";
import { BootstrapResponseSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { librarySql } from "../../../scripts/kb/library-sql";
import { runDeterministicAssistantTurn } from "../src/repositories/assistant";
import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * Vicenç and the wine library: a question that names a grape gets that
 * grape's card as evidence — the sourced values as researched and cited, the
 * pairing rules' suggestion as inferred — and the answer links the card.
 */
const grape = {
  acidity: "low" as const,
  aromas: ["plum", "tobacco"],
  body: "high" as const,
  color: "red" as const,
  evidence: [{ field: "aromas", quote: "aromas can include plum, tobacco", value: "plum" }],
  id: "tempranillo",
  names: { en: "Tempranillo", es: "Tempranillo" },
  origin: "ES",
  pairings: [],
  prominence: 31,
  regions: [{ country: "ES", name: "Rioja" }],
  styles: [],
  summaries: {
    en: {
      text: "Tempranillo is a black grape variety.",
      url: "https://en.wikipedia.org/wiki/Tempranillo",
    },
  },
  synonyms: [{ name: "Ull de Llebre", source: "article" as const }],
  tannin: null,
  wikidataId: "Q519874",
  wikipediaUrl: "https://en.wikipedia.org/wiki/Tempranillo",
};

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const statement of librarySql([grape], "test")) await env.DB.prepare(statement).run();
});

const sub = "firebase-emulator-user-library-assistant";
const token = emulatorIdToken({ email: "library-assistant@example.test", name: "Reader", sub });

describe("Vicenç with the wine library", () => {
  it("answers about a grape named by a synonym from its card, cited", async () => {
    const me = BootstrapResponseSchema.parse(
      await (
        await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).json(),
    );
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
      principal: {
        authTime: Math.floor(Date.now() / 1_000),
        displayName: "Reader",
        email: "library-assistant@example.test",
        emailVerified: true,
        firebaseUid: sub,
      },
      request: {
        context: { allowedCrossSpaceIds: [], visibleWineId: null },
        locale: "es",
        message: "¿A qué huele un Ull de Llebre?",
        saveHistory: false,
        threadId: null,
      },
      requestId: randomOpaqueToken(),
      semanticNotes: null,
      spaceId: me.data.user.activeSpaceId,
    });

    const library = seen.filter((statement) => statement.id.startsWith("library-tempranillo-"));
    expect(library.map((statement) => statement.text).join(" ")).toContain("plum, tobacco");
    // Every sourced statement cites the card's source; the suggestion cites none.
    const researched = library.filter((statement) => statement.evidenceClass === "researched");
    expect(researched.length).toBeGreaterThan(0);
    expect(researched.every((statement) => statement.sourceIds.length === 1)).toBe(true);
    const suggestion = library.find((statement) => statement.id.endsWith("-suggested"));
    expect(suggestion?.evidenceClass).toBe("inferred");
    expect(suggestion?.text).toContain("red meat");

    expect(response?.data.libraryGrapes).toEqual([{ id: "tempranillo", name: "Tempranillo" }]);
    expect(response?.data.citations.map((source) => source.canonicalUrl)).toContain(
      "https://en.wikipedia.org/wiki/Tempranillo",
    );
    expect(response?.data.citations[0]?.id).toBe(researched[0]?.sourceIds[0]);
  });
});
