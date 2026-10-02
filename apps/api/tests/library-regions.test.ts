import type { AssistantLanguageStatement } from "@vadevi/domain";
import {
  BootstrapResponseSchema,
  LibraryGrapeResponseSchema,
  LibraryRegionResponseSchema,
  LibraryRegionSearchResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { librarySql } from "../../../scripts/kb/library-sql";
import { runDeterministicAssistantTurn } from "../src/repositories/assistant";
import { regionsMentionedIn } from "../src/repositories/library";
import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * The atlas: a registered wine name found by any of the names it goes by,
 * its entry with what the EU register and Wikipedia say, the grapes linked to
 * it by their own articles, and Vicenç citing the register when asked.
 */
const grape = {
  acidity: "low" as const,
  aromas: ["plum"],
  body: "high" as const,
  color: "red" as const,
  evidence: [{ field: "regions", quote: "It is the main grape of Rioja wine", value: "Rioja" }],
  id: "tempranillo",
  names: { en: "Tempranillo", es: "Tempranillo" },
  origin: "ES",
  pairings: [],
  prominence: 31,
  regions: [{ country: "ES", name: "Rioja" }],
  styles: [],
  summaries: {},
  synonyms: [],
  tannin: null,
  wikidataId: "Q519874",
  wikipediaUrl: "https://en.wikipedia.org/wiki/Tempranillo",
};
const rioja = {
  countryCode: "ES",
  eambrosiaId: "PDO-ES-A0117",
  giType: "PDO" as const,
  grapes: [
    {
      grapeId: "tempranillo",
      quote: "It is the main grape of Rioja wine",
      sourceUrl: "https://en.wikipedia.org/wiki/Tempranillo",
    },
  ],
  id: "es-rioja",
  latitude: 42.4,
  legalUrl: "https://ec.europa.eu/geographical-indications-register/eambrosia-public/details/1",
  longitude: -2.6,
  name: "Rioja",
  names: [
    { locale: "*", name: "Rioja", source: "register" as const },
    { locale: "eu", name: "Errioxa", source: "wikidata" as const },
  ],
  prominence: 40,
  registeredOn: "1973-07-29",
  summaries: {
    en: {
      text: "Rioja is a wine region in Spain.",
      url: "https://en.wikipedia.org/wiki/Rioja_(wine)",
    },
    es: {
      text: "Rioja es una denominación de origen.",
      url: "https://es.wikipedia.org/wiki/Rioja_(vino)",
    },
  },
  wikidataId: "Q1121543",
};
const jerez = {
  ...rioja,
  eambrosiaId: "PDO-ES-A1482",
  grapes: [],
  id: "es-jerez-xeres-sherry",
  latitude: null,
  longitude: null,
  name: "Jerez-Xérès-Sherry",
  names: [
    { locale: "*", name: "Jerez-Xérès-Sherry", source: "register" as const },
    { locale: "*", name: "Sherry", source: "register" as const },
  ],
  prominence: 30,
  summaries: {},
  wikidataId: null,
};

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const statement of librarySql([grape], "test", undefined, [rioja, jerez])) {
    await env.DB.prepare(statement).run();
  }
});

const sub = "firebase-emulator-library-regions";
const token = emulatorIdToken({ email: "atlas@example.test", name: "Reader", sub });
const headers = { Authorization: `Bearer ${token}` };

describe("the wine atlas", () => {
  it("answers a registered name's entry, its summary in the reader's language and its grapes", async () => {
    await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers });
    const response = await SELF.fetch(
      "https://vadevi.test/api/v1/library/regions/es-rioja?locale=es",
      { headers },
    );
    expect(response.status).toBe(200);
    const region = LibraryRegionResponseSchema.parse(await response.json()).data;
    expect(region).toMatchObject({
      countryCode: "ES",
      giType: "PDO",
      latitude: 42.4,
      name: "Rioja",
      registeredOn: "1973-07-29",
    });
    expect(region.summary).toMatchObject({ locale: "es", license: "CC-BY-SA-4.0" });
    expect(region.grapes).toEqual([
      {
        id: "tempranillo",
        name: "Tempranillo",
        quote: "It is the main grape of Rioja wine",
        sourceUrl: "https://en.wikipedia.org/wiki/Tempranillo",
      },
    ]);
    expect(region.otherNames).toContain("Errioxa");
  });

  it("finds a name by any of the names it goes by, and only in the country asked", async () => {
    const search = async (path: string) =>
      LibraryRegionSearchResponseSchema.parse(
        await (
          await SELF.fetch(`https://vadevi.test/api/v1/library/regions?${path}`, { headers })
        ).json(),
      ).data.map((entry) => entry.id);
    expect(await search("query=sherry")).toEqual(["es-jerez-xeres-sherry"]);
    expect(await search("query=Rioja&country=ES")).toEqual(["es-rioja"]);
    expect(await search("query=Rioja&country=FR")).toEqual([]);
    const missing = await SELF.fetch("https://vadevi.test/api/v1/library/regions/es-nowhere", {
      headers,
    });
    expect(missing.status).toBe(404);
  });

  it("links a grape card's region to its atlas entry", async () => {
    const card = LibraryGrapeResponseSchema.parse(
      await (
        await SELF.fetch("https://vadevi.test/api/v1/library/grapes/tempranillo?locale=en", {
          headers,
        })
      ).json(),
    ).data;
    expect(card.regions).toContainEqual({ countryCode: "ES", name: "Rioja", regionId: "es-rioja" });
  });

  it("finds a registered name in a sentence by whole words only", async () => {
    expect(await regionsMentionedIn(env.DB, "¿Qué tal un vino de Rioja?")).toEqual(["es-rioja"]);
    expect(await regionsMentionedIn(env.DB, "A glass of sherry")).toEqual([
      "es-jerez-xeres-sherry",
    ]);
    expect(await regionsMentionedIn(env.DB, "Riojana")).toEqual([]);
  });

  it("lets Vicenç answer from the register and the summary, each cited", async () => {
    const me = BootstrapResponseSchema.parse(
      await (await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers })).json(),
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
        email: "atlas@example.test",
        emailVerified: true,
        firebaseUid: sub,
      },
      request: {
        context: { allowedCrossSpaceIds: [], visibleWineId: null },
        locale: "es",
        message: "¿Qué me cuentas de la denominación Rioja?",
        saveHistory: false,
        threadId: null,
      },
      requestId: randomOpaqueToken(),
      semanticNotes: null,
      spaceId: me.data.user.activeSpaceId,
    });

    const atlas = seen.filter((statement) => statement.id.startsWith("library-region-es-rioja-"));
    expect(atlas.map((statement) => statement.text).join(" ")).toContain(
      "protected designation of origin",
    );
    expect(atlas.every((statement) => statement.evidenceClass === "researched")).toBe(true);
    expect(atlas.every((statement) => statement.sourceIds.length > 0)).toBe(true);
    expect(response?.data.libraryRegions).toEqual([{ id: "es-rioja", name: "Rioja" }]);
    expect(response?.data.citations.map((source) => source.canonicalUrl)).toEqual(
      expect.arrayContaining([rioja.legalUrl, "https://es.wikipedia.org/wiki/Rioja_(vino)"]),
    );
  });
});
