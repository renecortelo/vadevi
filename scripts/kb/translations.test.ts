import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { checkTranslation, type Language, numbersIn } from "./translation-check";

/**
 * Every hand-made translation in the library, checked against the original it
 * records: its numbers, its language, its length — and that the original is
 * still the text the library shows, so a lead Wikipedia has since rewritten
 * leaves no translation of the old one behind.
 */
type Translation = {
  from: string;
  /**
   * Sentences or clauses of the original the translations leave out, because the source
   * has them wrong or out of date (the entry's note says why): the checks
   * compare the translations with the rest.
   */
  omits?: string[];
  original: string;
  replaces?: string[];
  sourceUrl: string;
  texts: Record<string, string>;
};

const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(path), "utf8")) as T;
const language = (locale: string) => (locale === "pt-PT" ? "pt" : locale) as Language;

const files: { entities: Record<string, Translation>; name: string }[] = [
  {
    entities: read<{ grapes: Record<string, Translation> }>("data/kb/grape-translations.json")
      .grapes,
    name: "grapes",
  },
  {
    entities: Object.fromEntries(
      Object.entries(
        read<Record<string, Translation | string>>("data/kb/topic-translations.json"),
      ).filter((entry): entry is [string, Translation] => typeof entry[1] !== "string"),
    ),
    name: "topics",
  },
  {
    entities: read<{ regions: Record<string, Translation> }>(
      "data/kb/appellation-translations.json",
    ).regions,
    name: "atlas",
  },
];

describe("translation checks", () => {
  it("knows a number however its language writes it", () => {
    expect(numbersIn("595 hectares (1,470 acres) in 2010")).toEqual(["1470", "2010", "595"]);
    expect(numbersIn("595 hectáreas (1.470 acres) en 2010")).toEqual(["1470", "2010", "595"]);
    expect(numbersIn("el 4,5% de los viñedos")).toEqual(["4.5"]);
    expect(numbersIn("4.5% of the vineyards")).toEqual(["4.5"]);
    expect(numbersIn("In 2002, 21,048,500 litres")).toEqual(["2002", "21048500"]);
    expect(numbersIn("γράφει το1599 για τα km2 και το CO2")).toEqual(["1599"]);
    expect(numbersIn("unos 1 800 ha y 57 000 euros")).toEqual(["1800", "57000"]);
    expect(numbersIn("con decreto dell'01/09/97 del 12/09/1997 n 213")).toEqual(
      numbersIn("por decreto del 1 de septiembre de 1997 del 12 de septiembre de 1997, n.º 213"),
    );
    expect(numbersIn("entre 75 et 80 000 pieds")).toEqual(
      numbersIn("between 75,000 and 80,000 vines"),
    );
    expect(numbersIn("entre 75 000 et 80 000 pieds")).toEqual(["75000", "80000"]);
    expect(numbersIn("in the late eighteenth century")).toEqual(
      numbersIn("a finales del siglo XVIII"),
    );
  });

  it("catches a dropped number and an untranslated text", () => {
    const original = {
      language: "en" as const,
      text: "It covers 595 hectares in the Veneto, almost all of it on the hills around the lake.",
    };
    expect(
      checkTranslation(original, {
        language: "es",
        text: "Ocupa hectáreas en el Véneto, casi todas en las colinas que rodean el lago.",
      }).map((problem) => problem.message),
    ).toContain("numbers missing: 595");
    expect(
      checkTranslation(original, {
        language: "fr",
        text: "It covers 595 hectares in the Veneto, almost all of it on the hills around the lake!",
      }).some((problem) => problem.message.startsWith("reads more like en")),
    ).toBe(true);
  });
});

for (const { entities, name } of files) {
  describe(`${name} translations`, () => {
    it("say what the original says, in their own language", () => {
      const problems: string[] = [];
      for (const [id, entry] of Object.entries(entities)) {
        for (const sentence of entry.omits ?? []) {
          if (!entry.original.includes(sentence))
            problems.push(`${id}: omits a sentence not in the original`);
        }
        for (const [locale, text] of Object.entries(entry.texts)) {
          if (locale === entry.from) continue;
          const original = (entry.omits ?? []).reduce(
            (text, sentence) => text.replace(sentence, " ").replace(/\s+/g, " "),
            entry.original,
          );
          for (const problem of checkTranslation(
            { language: language(entry.from), text: original },
            { language: language(locale), text },
          )) {
            problems.push(`${id} ${locale}: ${problem.message}`);
          }
        }
      }
      expect(problems).toEqual([]);
    });
  });
}

describe("translated originals are the texts the library shows", () => {
  it("for grapes and registered names", () => {
    const grapes =
      read<
        { summaries: Record<string, { text: string; translated?: boolean }>; wikidataId: string }[]
      >("data/kb/grapes.json");
    const regions = read<
      { eambrosiaId: string; summaries: Record<string, { text: string; translated?: boolean }> }[]
    >("data/kb/appellations.json");
    const stale: string[] = [];
    const compare = (
      id: string,
      entry: Translation,
      summaries: Record<string, { text: string; translated?: boolean }> | undefined,
    ) => {
      const shown = summaries?.[entry.from === "pt-PT" ? "pt" : entry.from];
      if (shown !== undefined && shown.translated !== true && shown.text !== entry.original) {
        stale.push(id);
      }
    };
    for (const [id, entry] of Object.entries(files[0]!.entities)) {
      compare(id, entry, grapes.find((grape) => grape.wikidataId === id)?.summaries);
    }
    for (const [id, entry] of Object.entries(files[2]!.entities)) {
      compare(id, entry, regions.find((region) => region.eambrosiaId === id)?.summaries);
    }
    expect(stale).toEqual([]);
  });
});
