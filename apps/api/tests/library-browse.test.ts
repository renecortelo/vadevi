import {
  LibraryGrapeResponseSchema,
  LibraryRegionSearchResponseSchema,
  LibrarySearchResponseSchema,
  LibraryTopicResponseSchema,
  LibraryTopicsResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { RegionEntry, TopicEntry } from "../../../scripts/kb/appellation-names";
import type { GrapeEntry } from "../../../scripts/kb/grape-validation";
import { librarySql } from "../../../scripts/kb/library-sql";
import { topicsMentionedIn } from "../src/repositories/library";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * The library browsed without Vicenç: every grape as a gallery, a country's
 * registered names, and the styles and methods explained — in the reader's
 * language, or in another when theirs has nothing.
 */
const grape = (id: string, names: Record<string, string>, color: "red" | "white"): GrapeEntry => ({
  acidity: null,
  aromas: [],
  body: null,
  color,
  evidence: [],
  id,
  names,
  origin: "ES",
  pairings: [],
  prominence: 5,
  regions: [],
  styles: [],
  summaries: {},
  synonyms: [],
  tannin: null,
  wikidataId: `Q${id.length}${id.charCodeAt(1)}`,
  wikipediaUrl: `https://en.wikipedia.org/wiki/${id}`,
});
const region = (id: string, name: string, giType: "PDO" | "PGI"): RegionEntry => ({
  countryCode: "ES",
  eambrosiaId: `EUGI-${id}`,
  giType,
  grapes: [],
  id,
  latitude: null,
  legalUrl: null,
  longitude: null,
  name,
  names: [{ locale: "*", name, source: "register" }],
  prominence: 1,
  registeredOn: null,
  summaries: {},
  wikidataId: null,
});
const topics: TopicEntry[] = [
  {
    aliases: [
      { locale: "es", name: "maloláctica" },
      { locale: "*", name: "MLF" },
    ],
    category: "method",
    id: "malolactic-fermentation",
    names: { en: "Malolactic fermentation", es: "Fermentación maloláctica" },
    prominence: 20,
    summaries: {
      en: {
        text: "Malolactic fermentation turns malic acid into lactic acid.",
        url: "https://en.wikipedia.org/wiki/Malolactic_fermentation",
      },
      es: {
        text: "La fermentación maloláctica transforma el ácido málico.",
        url: "https://es.wikipedia.org/wiki/Fermentaci%C3%B3n_malol%C3%A1ctica",
      },
    },
    wikidataId: "Q654005",
  },
  {
    aliases: [{ locale: "*", name: "pet nat" }],
    category: "kind",
    id: "pet-nat",
    names: { de: "Pét Nat" },
    prominence: 1,
    summaries: {
      de: {
        text: "Als Pét Nat wird ein Perlwein bezeichnet.",
        url: "https://de.wikipedia.org/wiki/P%C3%A9t_Nat",
      },
    },
    wikidataId: "Q112178239",
  },
];

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  const statements = librarySql(
    [
      grape("tempranillo", { en: "Tempranillo", es: "Tempranillo" }, "red"),
      grape("albarino", { en: "Albariño" }, "white"),
    ],
    "test",
    undefined,
    [region("es-rioja", "Rioja", "PDO"), region("es-castilla", "Castilla", "PGI")],
    {
      images: {
        tempranillo: {
          author: "A. Photographer",
          license: "CC BY-SA 4.0",
          licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
          path: "library/grapes/tempranillo.jpg",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Tempranillo.jpg",
        },
      },
      topics,
    },
  );
  for (const statement of statements) await env.DB.prepare(statement).run();
});

const token = emulatorIdToken({
  email: "browse@example.test",
  name: "Reader",
  sub: "firebase-emulator-library-browse",
});
const headers = { Authorization: `Bearer ${token}` };
const get = async (path: string) => {
  await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers });
  return SELF.fetch(`https://vadevi.test/api/v1/library/${path}`, { headers });
};

describe("browsing the wine library", () => {
  it("lists every grape alphabetically, with its photograph where it has one", async () => {
    const list = LibrarySearchResponseSchema.parse(
      await (await get("grapes?locale=es")).json(),
    ).data;
    expect(list.map((entry) => entry.name)).toEqual(["Albariño", "Tempranillo"]);
    expect(list.find((entry) => entry.id === "tempranillo")).toMatchObject({
      imagePath: "library/grapes/tempranillo.jpg",
      originCountryCode: "ES",
    });
    const card = LibraryGrapeResponseSchema.parse(
      await (await get("grapes/tempranillo?locale=es")).json(),
    ).data;
    expect(card.image).toMatchObject({ author: "A. Photographer", license: "CC BY-SA 4.0" });
  });

  it("lists a country's registered names, and nothing without a name or a country", async () => {
    const spain = LibraryRegionSearchResponseSchema.parse(
      await (await get("regions?country=ES")).json(),
    ).data;
    expect(spain.map((entry) => entry.name)).toEqual(["Castilla", "Rioja"]);
    const nothing = LibraryRegionSearchResponseSchema.parse(
      await (await get("regions")).json(),
    ).data;
    expect(nothing).toEqual([]);
  });

  it("explains styles and methods in the reader's language, or in the one there is", async () => {
    const list = LibraryTopicsResponseSchema.parse(
      await (await get("topics?locale=es")).json(),
    ).data;
    const malolactic = list.find((topic) => topic.id === "malolactic-fermentation");
    expect(malolactic).toMatchObject({ category: "method", name: "Fermentación maloláctica" });
    expect(malolactic?.summary?.locale).toBe("es");
    expect(malolactic?.otherNames).toEqual(expect.arrayContaining(["maloláctica", "MLF"]));
    const petNat = LibraryTopicResponseSchema.parse(
      await (await get("topics/pet-nat?locale=es")).json(),
    ).data;
    expect(petNat.summary?.locale).toBe("de");
    expect((await get("topics/nothing-here")).status).toBe(404);
  });

  it("finds a style or method by the word a reader uses", async () => {
    expect(await topicsMentionedIn(env.DB, "¿Qué hace la maloláctica en un blanco?")).toEqual([
      "malolactic-fermentation",
    ]);
    expect(await topicsMentionedIn(env.DB, "¿tienes algún pet nat?")).toEqual(["pet-nat"]);
  });
});
