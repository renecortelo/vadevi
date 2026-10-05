import { LibraryGrapeResponseSchema, LibrarySearchResponseSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { librarySql, normalizeLibraryText } from "../../../scripts/kb/library-sql";
import { suggestedPairingsFor } from "../src/adapters/grape-pairing";
import { grapesMentionedIn } from "../src/repositories/library";
import { normalizeWineText } from "../src/repositories/wine-memory";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * The wine library, read: a grape found by any of its names, in any of its
 * languages, and its card with the sentence behind each value.
 */
const tempranillo = {
  acidity: "low" as const,
  aromas: ["plum", "tobacco"],
  body: "high" as const,
  color: "red" as const,
  evidence: [
    {
      field: "aromas",
      quote: "aromas and flavours can include berries, plum, tobacco, vanilla",
      value: "plum",
    },
  ],
  id: "tempranillo",
  names: { en: "Tempranillo", es: "Tempranillo", pt: "Aragonez" },
  origin: "ES",
  pairings: [],
  prominence: 31,
  regions: [{ country: "ES", name: "Rioja" }],
  styles: ["blending"],
  summaries: {
    en: {
      text: "Tempranillo is a black grape variety.",
      url: "https://en.wikipedia.org/wiki/Tempranillo",
    },
    es: {
      text: "La uva tempranillo es una variedad de uva tinta.",
      url: "https://es.wikipedia.org/wiki/Tempranillo",
    },
  },
  synonyms: [
    { name: "Ull de Llebre", source: "article" as const },
    { name: "Tinto Fino", source: "article" as const },
  ],
  tannin: null,
  wikidataId: "Q519874",
  wikipediaUrl: "https://en.wikipedia.org/wiki/Tempranillo",
};
const pinotNoir = {
  ...tempranillo,
  acidity: null,
  aromas: ["cherry"],
  evidence: [],
  id: "pinot-noir",
  names: { en: "Pinot Noir" },
  origin: "FR",
  prominence: 50,
  regions: [],
  summaries: {},
  synonyms: [{ name: "Spätburgunder", source: "wikidata" as const }],
  wikidataId: "Q223701",
};

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  const vocabulary = {
    aroma: {
      terms: {
        plum: { en: "plum", es: "ciruela" },
        tobacco: { en: "tobacco", es: "tabaco" },
      },
      variants: {},
    },
    pairing: { terms: {}, variants: {} },
  };
  for (const statement of librarySql([tempranillo, pinotNoir], "test", vocabulary)) {
    await env.DB.prepare(statement).run();
  }
});

const token = emulatorIdToken({
  email: "library@example.test",
  name: "Reader",
  sub: "firebase-emulator-library",
});
const headers = { Authorization: `Bearer ${token}` };

describe("the wine library", () => {
  it("normalises names exactly as the rest of the API does", () => {
    for (const sample of [
      "Ull de Llebre",
      "Spätburgunder",
      "Xarel·lo",
      "  Tinto  FINO ",
      "Nero d'Avola",
    ]) {
      expect(normalizeLibraryText(sample)).toBe(normalizeWineText(sample));
    }
  });

  it("answers a grape's card in the reader's language, with its evidence", async () => {
    await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers });
    const response = await SELF.fetch(
      "https://vadevi.test/api/v1/library/grapes/tempranillo?locale=es",
      { headers },
    );
    expect(response.status).toBe(200);
    const card = LibraryGrapeResponseSchema.parse(await response.json()).data;
    expect(card).toMatchObject({
      acidity: "low",
      color: "red",
      name: "Tempranillo",
      originCountryCode: "ES",
    });
    expect(card.summary).toMatchObject({
      locale: "es",
      license: "CC-BY-SA-4.0",
      translated: false,
    });
    expect(card.evidence[0]).toMatchObject({ field: "aromas", value: "plum" });
    // Aromas in the reader's language, from the curated vocabulary.
    expect(card.aromas).toEqual(["ciruela", "tabaco"]);
    expect(card.synonyms).toEqual(
      expect.arrayContaining(["Ull de Llebre", "Tinto Fino", "Aragonez"]),
    );

    // A language the library has no summary in falls back to English.
    const german = LibraryGrapeResponseSchema.parse(
      await (
        await SELF.fetch("https://vadevi.test/api/v1/library/grapes/tempranillo?locale=de", {
          headers,
        })
      ).json(),
    ).data;
    expect(german.summary?.locale).toBe("en");

    expect(
      (await SELF.fetch("https://vadevi.test/api/v1/library/grapes/no-such-grape", { headers }))
        .status,
    ).toBe(404);
  });

  it("finds a grape by a synonym, in any spelling", async () => {
    const response = await SELF.fetch(
      "https://vadevi.test/api/v1/library/grapes?query=tinto%20fino&locale=en",
      { headers },
    );
    expect(
      LibrarySearchResponseSchema.parse(await response.json()).data.map((grape) => grape.id),
    ).toEqual(["tempranillo"]);
    expect(await grapesMentionedIn(env.DB, "¿A qué huele un ULL DE LLEBRE?")).toEqual([
      "tempranillo",
    ]);
    expect(await grapesMentionedIn(env.DB, "un spatburgunder alemán")).toEqual(["pinot-noir"]);
    expect(await grapesMentionedIn(env.DB, "vinos de la casa")).toEqual([]);
  });

  it("is behind the same door as the rest of the API", async () => {
    expect((await SELF.fetch("https://vadevi.test/api/v1/library/grapes/tempranillo")).status).toBe(
      401,
    );
  });

  it("suggests what a grape goes with from the pairing rules, and says how", async () => {
    // Named by a source in a style the rules have: a red's dishes, red meat first.
    const card = LibraryGrapeResponseSchema.parse(
      await (
        await SELF.fetch("https://vadevi.test/api/v1/library/grapes/tempranillo", { headers })
      ).json(),
    ).data;
    expect(card.suggestedPairings?.basis).toBe("catalogue");
    expect(card.suggestedPairings?.groups[0]?.style).toBe("medium_bodied_red");
    expect(card.suggestedPairings?.groups[0]?.families).toContain("red_meat");
    expect(card.suggestedPairings?.families).not.toContain("chocolate");

    // Named by no source: placed by colour and structure.
    const crisp = suggestedPairingsFor({
      acidity: "high",
      body: "low",
      color: "white",
      id: "unheard-of-white",
      styles: [],
      tannin: null,
    });
    expect(crisp?.basis).toBe("profile");
    expect(crisp?.groups.map((group) => group.style)).toEqual(["light_crisp_white"]);
    expect(crisp?.families).not.toContain("red_meat");

    // Too little known — a colour alone — and it says nothing rather than guess.
    expect(
      suggestedPairingsFor({
        acidity: null,
        body: null,
        color: "red",
        id: "x",
        styles: [],
        tannin: null,
      }),
    ).toBeNull();
  });

  it("keeps each of a grape's styles apart, so a sweet wine's dishes are not a dry one's", () => {
    const riesling = suggestedPairingsFor({
      acidity: "high",
      body: null,
      color: "white",
      id: "riesling",
      sourcePairings: ["white fish", "pork", "chinese cuisine"],
      styles: ["still", "sparkling", "sweet"],
      tannin: null,
    })!;
    const sweet = riesling.groups.find((group) => group.style === "sweet_late_harvest_white")!;
    const dry = riesling.groups.find((group) => group.style === "dry_aromatic_white")!;
    expect(sweet.families).toContain("foie_gras");
    expect(dry.families).not.toContain("chocolate");
    expect(dry.families).not.toContain("foie_gras");
    // What the grape's own source already says is not suggested again.
    expect(riesling.families).not.toContain("asian");
    expect(riesling.families).not.toContain("white_fish");
  });

  it("matches a grape by its id, not by a synonym it shares with another", () => {
    // Welschriesling is called Riesling somewhere; it is not Riesling.
    const italian = suggestedPairingsFor({
      acidity: null,
      body: "low",
      color: "white",
      id: "italian-riesling",
      styles: ["sparkling", "sweet"],
      tannin: null,
    });
    expect(italian?.basis).toBe("profile");
  });

  it("gives a grape named only for its fortified wine a table wine of its colour too", () => {
    // Touriga Francesa is named for Port; its own structure places its red.
    const touriga = suggestedPairingsFor({
      acidity: null,
      body: null,
      color: "red",
      id: "touriga-francesa",
      styles: ["fortified", "blending", "still"],
      tannin: "high",
    })!;
    expect(touriga.groups[0]!.basis).toBe("profile");
    expect(touriga.groups[0]!.style).toMatch(/red/);
    expect(touriga.groups.map((group) => group.style)).toContain("sweet_fortified");
  });
});
