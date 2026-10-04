import { describe, expect, it } from "vitest";

import {
  leadIsAboutWine,
  matchKey,
  registerCountries,
  registerNames,
  transliterate,
} from "./appellation-names";
import {
  mentions,
  parseRegion,
  quoteIsVerbatim,
  summaryOf,
  validateExtraction,
} from "./grape-validation";

const article = `Tempranillo is a black grape variety widely grown to make full-bodied red wines in its native Spain. Being low in both acidity and sugar content, it is most commonly blended with Grenache. Tempranillo wines are ruby red in colour, while aromas and flavours can include berries, plum, tobacco, vanilla, leather and herb. The two major regions that grow Tempranillo are Rioja, in north central Spain, and Ribera del Duero.`;

describe("a proposed grape fact", () => {
  it("is kept only with a quote that occurs in the article, elisions allowed", () => {
    expect(quoteIsVerbatim("Being low in both acidity and sugar content", article)).toBe(true);
    expect(
      quoteIsVerbatim("Tempranillo is a black grape variety ... in its native Spain.", article),
    ).toBe(true);
    expect(quoteIsVerbatim("Tempranillo has high acidity and firm tannins.", article)).toBe(false);
    expect(quoteIsVerbatim("", article)).toBe(false);
    // Short fragments alone prove nothing.
    expect(quoteIsVerbatim("Spain ... Rioja", article)).toBe(false);
  });

  it("must be said by its quote", () => {
    expect(mentions("aromas ... can include berries, plum, tobacco", "plum")).toBe(true);
    expect(mentions("aromas ... can include berries, plum", "berry")).toBe(true);
    expect(mentions("aromas ... can include berries, plum", "black cherry")).toBe(false);
    expect(parseRegion("ES: Ribera del Duero")).toEqual({
      country: "ES",
      name: "Ribera del Duero",
    });
    expect(parseRegion("US- California (Napa)")).toEqual({ country: "US", name: "California" });
  });

  it("keeps the facts its article supports and rejects the rest", () => {
    const result = validateExtraction(
      {
        acidity: { quote: "Being low in both acidity and sugar content", value: "low" },
        aromas: {
          quote:
            "aromas and flavours can include berries, plum, tobacco, vanilla, leather and herb.",
          value: ["plum", "tobacco", "black cherry"],
        },
        body: {
          quote: "widely grown to make full-bodied red wines in its native Spain.",
          value: "full-bodied",
        },
        color: { quote: "Tempranillo is a black grape variety widely grown", value: "red" },
        is_wine_grape: true,
        origin: { quote: "red wines in its native Spain.", value: "ES" },
        regions: {
          quote:
            "The two major regions that grow Tempranillo are Rioja, in north central Spain, and Ribera del Duero.",
          value: ["ES: Rioja", "ES: Ribera del Duero", "PT: Douro"],
        },
        tannin: { quote: "Tempranillo has firm tannins and high acidity.", value: "high" },
      },
      article,
      [],
    );
    expect(result.acidity).toBe("low");
    expect(result.body).toBe("high");
    expect(result.color).toBe("red");
    expect(result.origin).toBe("ES");
    expect(result.aromas).toEqual(["plum", "tobacco"]);
    expect(result.regions.map((region) => region.name)).toEqual(["Rioja", "Ribera del Duero"]);
    // An invented tannin claim, and the aroma and region the quotes do not name.
    expect(result.tannin).toBeNull();
    expect(result.rejected.map((entry) => entry.value)).toEqual(
      expect.arrayContaining(["black cherry", "PT: Douro"]),
    );
    expect(result.evidence.every((entry) => quoteIsVerbatim(entry.quote, article))).toBe(true);
  });

  it("does not take a table grape into the library", () => {
    expect(validateExtraction({ is_wine_grape: false }, article, []).isWineGrape).toBe(false);
    expect(validateExtraction({ is_wine_grape: { value: false } }, article, []).isWineGrape).toBe(
      false,
    );
  });

  it("summarises a lead in at most a couple of sentences", () => {
    const long = `${article} ${article} ${article}`;
    expect(summaryOf(long)!.length).toBeLessThanOrEqual(420);
    expect(summaryOf(long)!.startsWith("Tempranillo is a black grape")).toBe(true);
  });
});

describe("short quotes and leads", () => {
  it("widens a two-word quote to its sentence and checks that", async () => {
    const { expandQuote } = await import("./grape-validation");
    const text =
      "Riesling is aromatic. It has high acidity and floral aromas. It is grown in Germany.";
    expect(expandQuote("high acidity", text)).toBe("it has high acidity and floral aromas.");
  });

  it("starts a summary at the start, past Wikipedia's invisible marks", () => {
    expect(
      summaryOf(
        "La riesling es una variedad de uva blanca de Alemania.​ Da lugar a diversas denominaciones.",
      ),
    ).toBe(
      "La riesling es una variedad de uva blanca de Alemania. Da lugar a diversas denominaciones.",
    );
  });
});

describe("sentence boundaries", () => {
  it("does not end a sentence at an abbreviation", () => {
    expect(
      summaryOf(
        "Cuenta con 31.046 hectáreas en la D.O. Ca. Rioja, la mayor de España. Otra frase sigue aquí después.",
      ),
    ).toBe(
      "Cuenta con 31.046 hectáreas en la D.O. Ca. Rioja, la mayor de España. Otra frase sigue aquí después.",
    );
  });
});

describe("styles", () => {
  it("reads a list the model wrote out as a string", () => {
    const text =
      "Albariño is used to make dry white wines with high acidity, and some sparkling wine too.";
    const result = validateExtraction(
      {
        styles: {
          quote: "used to make dry white wines with high acidity, and some sparkling wine too.",
          value: '["still","sparkling"]',
        },
      },
      text,
      [],
    );
    expect(result.styles).toEqual(["still", "sparkling"]);
  });
});

describe("registered wine names", () => {
  it("splits alternatives and multilingual names, and keeps two-word names whole", () => {
    expect(registerNames("Jerez-Xérès-Sherry")).toEqual([
      "Jerez-Xérès-Sherry",
      "Jerez",
      "Xérès",
      "Sherry",
    ]);
    expect(registerNames("Utiel-Requena")).toEqual(["Utiel-Requena"]);
    expect(registerNames("Mura / Murai")).toEqual(["Mura", "Murai"]);
    expect(registerNames("Cava; Cava ")).toEqual(["Cava"]);
    expect(registerCountries("be,nl")).toEqual(["BE", "NL"]);
    expect(registerCountries("el")).toEqual(["GR"]);
  });
});

describe("names across scripts", () => {
  it("matches and spells Greek and Bulgarian names, and never matches an empty key", () => {
    expect(matchKey("Νεμέα")).toBe("νεμεα");
    expect(matchKey("Rioja ")).toBe("rioja");
    expect(transliterate("Νεμέα")).toBe("Nemea");
    expect(transliterate("Άγιο Όρος")).toBe("Agio Oros");
    expect(transliterate("Πελοπόννησος")).toBe("Peloponnisos");
    expect(transliterate("Мелник")).toBe("Melnik");
    expect(transliterate("Côtes du Rhône")).toBe("Cotes du Rhone");
  });

  it("tells a lead about a wine from a lead about the town it is named for", () => {
    expect(leadIsAboutWine("Le Faro est un vin de Sicile.")).toBe(true);
    expect(leadIsAboutWine("Saale-Unstrut is a region for quality wine in Germany.")).toBe(true);
    expect(leadIsAboutWine("Recaș is a town in Timiș County, Romania.")).toBe(false);
  });
});

describe("a grape's colour", () => {
  it("is left unknown when its quote names more than one skin", () => {
    const article =
      "Piquepoul is a variety of wine grape. It exists both in dark-skinned (Piquepoul noir) and light-skinned (Piquepoul blanc) versions.";
    const result = validateExtraction(
      {
        color: {
          quote:
            "It exists both in dark-skinned (Piquepoul noir) and light-skinned (Piquepoul blanc) versions",
          value: "red",
        },
      },
      article,
      [],
    );
    expect(result.color).toBeNull();
    expect(result.rejected.map((entry) => entry.reason)).toContain(
      "quote names more than one skin colour",
    );
  });
});

describe("a grape read in its own language", () => {
  it("accepts levels and aromas stated in Spanish, German and Catalan, in the article's own words", () => {
    const spanish =
      "Los zumos son rojo granate. Tiene mucho color, un fruto que fácilmente deriva en notas cocidas, y una baja acidez. Los vinos de Mencía tienden a mostrar caracteres terrosos y vegetales con matices de bayas.";
    const read = validateExtraction(
      {
        acidity: {
          quote:
            "Tiene mucho color, un fruto que fácilmente deriva en notas cocidas, y una baja acidez",
          value: "low",
        },
        aromas: {
          quote:
            "Los vinos de Mencía tienden a mostrar caracteres terrosos y vegetales con matices de bayas.",
          value: ["earthy", "berry"],
          words: { berry: "bayas", earthy: "terrosos" },
        },
      },
      spanish,
      [],
    );
    expect(read.acidity).toBe("low");
    expect(read.aromas).toEqual(["earthy", "berry"]);

    const german =
      "Der Wein ist von mittlerem Körper und weist einen intensiven Duft nach Waldbeeren auf.";
    expect(
      validateExtraction(
        { body: { quote: "Der Wein ist von mittlerem Körper", value: "medium" } },
        german,
        [],
      ).body,
    ).toBe("medium");

    const catalan = "Dona un vi fresc, discret i amb poc cos, però força elegant.";
    expect(
      validateExtraction(
        { body: { quote: "Dona un vi fresc, discret i amb poc cos", value: "low" } },
        catalan,
        [],
      ).body,
    ).toBe("low");
  });

  it("still refuses an aroma whose own word is not in the quote", () => {
    const read = validateExtraction(
      {
        aromas: {
          quote: "Los vinos de Mencía tienden a mostrar caracteres terrosos y vegetales.",
          value: ["plum"],
          words: { plum: "ciruela" },
        },
      },
      "Los vinos de Mencía tienden a mostrar caracteres terrosos y vegetales.",
      [],
    );
    expect(read.aromas).toEqual([]);
  });

  it("reads a Russian article: its colour, its styles and its places in Cyrillic", () => {
    const russian =
      "Оджалеши — красноягодный сорт винограда, распространённый в Лечхуми (Грузия). Из оджалеши производятся природно-полусладкие вина и сухие вина. При применении соответствующей технологии можно получить высококачественные десертные вина типа портвейн и кагор.";
    const read = validateExtraction(
      {
        color: {
          quote: "Оджалеши — красноягодный сорт винограда, распространённый в Лечхуми",
          value: "red",
        },
        regions: {
          quote: "Оджалеши — красноягодный сорт винограда, распространённый в Лечхуми (Грузия).",
          value: ["GE: Lechkhumi"],
          words: { "GE: Lechkhumi": "Лечхуми" },
        },
        styles: {
          quote:
            "Из оджалеши производятся природно-полусладкие вина и сухие вина. При применении соответствующей технологии можно получить высококачественные десертные вина типа портвейн и кагор.",
          value: ["sweet", "still", "fortified"],
        },
      },
      russian,
      ["GE"],
    );
    expect(read.color).toBe("red");
    expect(read.regions).toEqual([{ country: "GE", name: "Lechkhumi" }]);
    expect(read.styles).toEqual(["sweet", "still", "fortified"]);
  });

  it("reads 'viel Körper', 'riche en acidité', 'molt de cos' and 'geringen Säuregehalt'", () => {
    const level = (field: "acidity" | "body", quote: string, value: string) =>
      validateExtraction({ [field]: { quote, value } }, quote, [])[field];
    expect(level("body", "Die Weine zeigen viel Körper und eine gute Säurestruktur.", "high")).toBe(
      "high",
    );
    expect(
      level(
        "acidity",
        "Le vin de xarello est coloré, puissant, riche en alcool et en acidité.",
        "high",
      ),
    ).toBe("high");
    expect(level("body", "El vi té molt de cos i un color cirera fosc intens.", "high")).toBe(
      "high",
    );
    expect(
      level(
        "acidity",
        "Die Weine verfügen über einen hohen Alkohol-, aber geringen Säuregehalt.",
        "low",
      ),
    ).toBe("low");
  });

  it("does not take the Russian word for grape as a word for wine", () => {
    const russian = "Тавквери — сорт винограда, распространённый в Картли и Кахетии.";
    const read = validateExtraction(
      {
        styles: { quote: "Тавквери — сорт винограда, распространённый в Картли", value: ["still"] },
      },
      russian,
      [],
    );
    expect(read.styles).toEqual([]);
  });

  it("knows a country by the older English name an article may still use", () => {
    const article =
      "Öküzgözü is an indigenous Turkish grape variety. It is one of the most important red wine varieties of Turkey.";
    const read = validateExtraction(
      {
        origin: {
          quote: "It is one of the most important red wine varieties of Turkey.",
          value: "TR",
        },
      },
      article,
      [],
    );
    expect(read.origin).toBe("TR");
  });
});

describe("a summary taken from a lead", () => {
  it("ends at a whole sentence, not at a cut, a list's colon or a reference", () => {
    expect(
      summaryOf(
        "Côtes Catalanes is an IGP wine region in Languedoc-Roussillon. Syrah, Carignan and Grenache are common grapes in the",
      ),
    ).toBe("Côtes Catalanes is an IGP wine region in Languedoc-Roussillon.");
    expect(
      summaryOf(
        "Côtes de Blaye es un vino con denominación de origen de Burdeos. La comarca está delimitada en los cantones siguientes:",
      ),
    ).toBe("Côtes de Blaye es un vino con denominación de origen de Burdeos.");
    expect(
      summaryOf(
        "A casta Colombard é originária da França, onde se usa em aguardentes. Também é cultivada na Califórnia.«Colombard». Vitis International Variety Catalogue.",
      ),
    ).toBe(
      "A casta Colombard é originária da França, onde se usa em aguardentes. Também é cultivada na Califórnia.",
    );
    expect(
      summaryOf(
        'Pauillac is an appellation within Haut-Médoc in Bordeaux. Hugh Johnson has said, "If one had to single out one commune of Bordeaux to head the list, there would be no argument.',
      ),
    ).toBe("Pauillac is an appellation within Haut-Médoc in Bordeaux.");
    expect(
      summaryOf(
        "Un coteaux-de-die est un vin blanc tranquille. L'aire est identique à celle de la clairette de Die, qui sont des vins effervescents,",
      ),
    ).toBe("Un coteaux-de-die est un vin blanc tranquille.");
    expect(
      summaryOf(
        "DOP El Terrerazo is a Spanish geographical indication for Vino de Pago wines. The sole proprietor of this estate is Bodega Mustiguillo Archived 2015-07-03 at the Wayback Machine.",
      ),
    ).toBe(
      "DOP El Terrerazo is a Spanish geographical indication for Vino de Pago wines. The sole proprietor of this estate is Bodega Mustiguillo.",
    );
    expect(
      summaryOf(
        "Alezio ist ein Rotwein aus der Provinz Lecce. Der Wein hat seit 1983 eine „kontrollierte Herkunftsbezeichnung“ (DOC).",
      ),
    ).toBe(
      "Alezio ist ein Rotwein aus der Provinz Lecce. Der Wein hat seit 1983 eine „kontrollierte Herkunftsbezeichnung“ (DOC).",
    );
  });

  it("keeps a sentence that only lacks its full stop", () => {
    expect(
      summaryOf(
        "La verdejo es una uva blanca de España. Los estudios genéticos descartan esa teoría",
      ),
    ).toBe("La verdejo es una uva blanca de España. Los estudios genéticos descartan esa teoría");
  });
});
