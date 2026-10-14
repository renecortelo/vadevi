import type { AssistantLanguageStatement } from "@vadevi/domain";
import {
  BootstrapResponseSchema,
  LibraryAtlasCoverageResponseSchema,
  LibraryGrapeResponseSchema,
  LibraryRegionResponseSchema,
  LibraryRegionSearchResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { librarySql } from "../../../scripts/kb/library-sql";
import { runDeterministicAssistantTurn } from "../src/repositories/assistant";
import { regionsMentionedIn } from "../src/repositories/library";
import { regionRefOf } from "../src/repositories/region-names";
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
  // Wikidata's code for Portuguese is "pt"; the app asks for "pt-PT".
  names: { en: "Tempranillo", es: "Tempranillo", pt: "Aragonez" },
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
  // The point is the area's, not the wine's own: approximate, and said so.
  pointSource: "area" as const,
  legalUrl: "https://ec.europa.eu/geographical-indications-register/eambrosia-public/details/1",
  longitude: -2.6,
  name: "Rioja",
  names: [
    { locale: "*", name: "Rioja", source: "register" as const },
    { locale: "eu", name: "Errioxa", source: "wikidata" as const },
  ],
  prominence: 40,
  register: {
    categories: [1],
    grapes: [
      { grapeId: "tempranillo", name: "Tempranillo" },
      { grapeId: null, name: "Maturana Tinta" },
    ],
    sourceUrl:
      "https://ec.europa.eu/geographical-indications-register/eambrosia-public-api/api/v1/attachments/1",
  },
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

// Explained by Catalan Wikipedia only, and translated by hand into Italian.
const priorat = {
  ...rioja,
  eambrosiaId: "PDO-ES-A0234",
  grapes: [],
  id: "es-priorat",
  name: "Priorat",
  names: [{ locale: "*", name: "Priorat", source: "register" as const }],
  summaries: {
    ca: {
      text: "El Priorat és una denominació d'origen qualificada.",
      url: "https://ca.wikipedia.org/wiki/DOQ_Priorat",
    },
    it: {
      text: "Il Priorat è una denominazione di origine qualificata.",
      translated: true,
      url: "https://ca.wikipedia.org/wiki/DOQ_Priorat",
    },
  },
};

// Beyond the EU: a South African province, a district in it and a ward in
// the district, each in its own register's terms; a New Zealand name.
const beyond = {
  eambrosiaId: null,
  grapes: [],
  latitude: null,
  legalUrl: null,
  longitude: null,
  prominence: 0,
  registeredOn: null,
  summaries: {},
  wikidataId: null,
};
const westernCape = {
  ...beyond,
  countryCode: "ZA",
  giType: "WO" as const,
  id: "za-western-cape",
  name: "Western Cape",
  names: [{ locale: "*", name: "Western Cape", source: "register" as const }],
  registerLevel: "unit" as const,
};
const stellenbosch = {
  ...westernCape,
  id: "za-stellenbosch",
  name: "Stellenbosch",
  names: [{ locale: "*", name: "Stellenbosch", source: "register" as const }],
  registerLevel: "district" as const,
  within: ["za-western-cape"],
};
const banghoek = {
  ...westernCape,
  id: "za-banghoek",
  name: "Banghoek",
  names: [{ locale: "*", name: "Banghoek", source: "register" as const }],
  registerLevel: "ward" as const,
  within: ["za-stellenbosch", "za-western-cape"],
};
const marlborough = {
  ...beyond,
  countryCode: "NZ",
  giType: "GI" as const,
  id: "nz-marlborough",
  name: "Marlborough",
  names: [{ locale: "*", name: "Marlborough", source: "register" as const }],
  registerRef: "1004",
};

// Chile's decree writes its valleys in Spanish only.
const maipo = {
  ...beyond,
  countryCode: "CL",
  giType: "DO" as const,
  id: "cl-valle-del-maipo",
  name: "Valle del Maipo",
  names: [{ locale: "*", name: "Valle del Maipo", source: "register" as const }],
  registerLevel: "subregion" as const,
};

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  for (const statement of librarySql([grape], "test", undefined, [
    rioja,
    jerez,
    priorat,
    westernCape,
    stellenbosch,
    banghoek,
    marlborough,
    maipo,
  ])) {
    await env.DB.prepare(statement).run();
  }
});

const sub = "firebase-emulator-library-regions";
const token = emulatorIdToken({ email: "atlas@example.test", name: "Reader", sub });
const headers = { Authorization: `Bearer ${token}` };

describe("the wine atlas", () => {
  it("counts each country's names, described, placed and with grapes", async () => {
    await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers });
    const response = await SELF.fetch(
      "https://vadevi.test/api/v1/library/atlas/coverage?locale=en",
      { headers },
    );
    expect(response.status).toBe(200);
    const { data } = LibraryAtlasCoverageResponseSchema.parse(await response.json());
    expect(data.libraryVersion).toBe("test");
    const seeded = [rioja, jerez, priorat, westernCape, stellenbosch, banghoek, marlborough, maipo];
    for (const country of new Set(seeded.map((entry) => entry.countryCode))) {
      const entries = seeded.filter((entry) => entry.countryCode === country);
      const placed = (source: string) =>
        entries.filter(
          (entry) =>
            entry.latitude !== null &&
            ((entry as { pointSource?: string | null }).pointSource ?? "item") === source,
        ).length;
      expect(data.countries.find((row) => row.countryCode === country)).toEqual({
        countryCode: country,
        described: entries.filter((entry) => "en" in entry.summaries).length,
        describedInEveryLanguage: entries.filter(
          (entry) => Object.keys(entry.summaries).length === 8,
        ).length,
        names: entries.length,
        points: {
          area: placed("area"),
          boundary: placed("boundary"),
          item: placed("item"),
          none: entries.filter((entry) => entry.latitude === null).length,
          place: placed("place"),
        },
        withGrapes: entries.filter((entry) =>
          entry.grapes.some((link) => link.grapeId === grape.id),
        ).length,
      });
    }
  });

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
      pointSource: "area",
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
    // What the register's own document says, apart from the encyclopaedia.
    expect(region.register).toEqual({
      categories: [1],
      grapes: [
        { grapeId: "tempranillo", name: "Tempranillo" },
        { grapeId: null, name: "Maturana Tinta" },
      ],
      sourceUrl:
        "https://ec.europa.eu/geographical-indications-register/eambrosia-public-api/api/v1/attachments/1",
    });
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
    // As a wine's region may be written: with its country.
    expect(await search("query=New%20Zealand%20Marlborough&country=NZ")).toEqual([
      "nz-marlborough",
    ]);
    expect(await search("query=Maipo%20Valley&country=CL")).toEqual(["cl-valle-del-maipo"]);
    expect(await search("query=Rioja%20DOCa&country=ES")).toEqual(["es-rioja"]);
    const missing = await SELF.fetch("https://vadevi.test/api/v1/library/regions/es-nowhere", {
      headers,
    });
    expect(missing.status).toBe(404);
  });

  it("shows where a name lies in its register's areas, and what lies directly in it", async () => {
    const entry = async (id: string) =>
      LibraryRegionResponseSchema.parse(
        await (
          await SELF.fetch(`https://vadevi.test/api/v1/library/regions/${id}?locale=en`, {
            headers,
          })
        ).json(),
      ).data;
    const district = await entry("za-stellenbosch");
    expect(district).toMatchObject({ giType: "WO", registerLevel: "district" });
    expect(district.within).toEqual([
      { id: "za-western-cape", level: "unit", name: "Western Cape" },
    ]);
    expect(district.contains).toEqual([{ id: "za-banghoek", level: "ward", name: "Banghoek" }]);
    // The ward is in the province too, but through its district.
    expect((await entry("za-western-cape")).contains.map((held) => held.id)).toEqual([
      "za-stellenbosch",
    ]);
    expect(await entry("nz-marlborough")).toMatchObject({
      contains: [],
      registerLevel: null,
      registerRef: "1004",
      within: [],
    });
  });

  it("links a wine's region written with its country to the name", async () => {
    expect(await regionRefOf(env.DB, "New Zealand Marlborough")).toBe("nz-marlborough");
    expect(await regionRefOf(env.DB, "Stellenbosch, South Africa")).toBe("za-stellenbosch");
    expect(await regionRefOf(env.DB, "Western Cape")).toBe("za-western-cape");
  });

  it("reads a region with its label before or after it, or where it lies after a comma", async () => {
    expect(await regionRefOf(env.DB, "Rioja DOCa")).toBe("es-rioja");
    expect(await regionRefOf(env.DB, "D.O.Ca. Rioja")).toBe("es-rioja");
    expect(await regionRefOf(env.DB, "Wine of Origin Stellenbosch")).toBe("za-stellenbosch");
    expect(await regionRefOf(env.DB, "Stellenbosch WO")).toBe("za-stellenbosch");
    expect(await regionRefOf(env.DB, "Stellenbosch, Western Cape")).toBe("za-stellenbosch");
    expect(await regionRefOf(env.DB, "Marlborough GI")).toBe("nz-marlborough");
    // As export labels write Chile's valleys.
    expect(await regionRefOf(env.DB, "Maipo Valley")).toBe("cl-valle-del-maipo");
    expect(await regionRefOf(env.DB, "D.O. Maipo Valley, Chile")).toBe("cl-valle-del-maipo");
    // A name the register does not hold stays unlinked.
    expect(await regionRefOf(env.DB, "Napa Valley")).toBeNull();
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

describe("the library in every language", () => {
  const region = async (locale: string) =>
    LibraryRegionResponseSchema.parse(
      await (
        await SELF.fetch(`https://vadevi.test/api/v1/library/regions/es-priorat?locale=${locale}`, {
          headers,
        })
      ).json(),
    ).data;

  it("serves a Spanish reader the Catalan summary when there is no Spanish one", async () => {
    await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers });
    expect((await region("es")).summary).toMatchObject({ locale: "ca", translated: false });
  });

  it("says when a summary is a translation", async () => {
    expect((await region("it")).summary).toMatchObject({ locale: "it", translated: true });
  });

  it("names a grape in Portuguese for a pt-PT reader", async () => {
    const response = await SELF.fetch(
      "https://vadevi.test/api/v1/library/grapes/tempranillo?locale=pt-PT",
      { headers },
    );
    expect(LibraryGrapeResponseSchema.parse(await response.json()).data.name).toBe("Aragonez");
  });
});
