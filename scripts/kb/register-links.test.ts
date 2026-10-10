import { describe, expect, it } from "vitest";

import { linkSummary, upToSentenceEnd } from "./register-links";

// Excerpts of the Official Journal's single document for "Alpi Retiche"
// (OJ C 63, 26.2.2020), as the Publications Office serves them.
const english = `
4. Description of the wine(s)
Alpi Retiche bianco
The analytical parameters not shown in the table below comply with the limits laid down in national and EU legislation.
8. Description of the link(s)
Alpi Retiche. All categories (1, 4, 8, 15 and 16) — (A) Details of the geographical area
Natural factors relevant to the link
The Valtellina represents the territory of the province of Sondrio and is located to the north-east of Lake Como, between 46 and 46,5 degrees north.
A number of specific environmental features help create suitable climatic conditions for winegrowing. The valley, which runs longitudinal to the Alps, is entirely south-facing and is protected, both to the north and to the east, by the Rhaetian Alps mountain range. The proximity of the Lake Como catchment area to the south-west has a significant mitigating effect.
Historical and human factors relevant to the link
The origin of winegrowing in the Valtellina area dates back to the first settlements of the Ligures, followed by the Etruscans, although farming and terracing of the land can only be traced back as far as Roman times.
9. Essential further conditions
`;

const spanish = `
4. Descripción del (de los) vino(s)
Alpi Retiche bianco
Los parámetros analíticos que no figuran en el cuadro siguiente cumplen los límites establecidos en la legislación nacional y de la UE.
8. Descripción del (de los) vínculo(s)
«Alpi Retiche». Todas las categorías (1, 4, 8, 15 y 16) — A) Detalles de la zona geográfica
Factores naturales que contribuyen al vínculo
La Valtelina representa el territorio de la provincia de Sondrio y se encuentra al noreste del lago de Como, entre 46 y 46,5 grados norte.
Una serie de características ambientales específicas contribuyen a crear unas condiciones climáticas adecuadas para la viticultura. El valle, que discurre longitudinalmente a los Alpes, está totalmente orientado al sur.
`;

describe("the link with the geographical area", () => {
  it("takes the opening paragraphs, whole, after the subheadings", () => {
    const summary = linkSummary(english, "en")!;
    expect(summary.startsWith("The Valtellina represents the territory")).toBe(true);
    expect(summary.endsWith("has a significant mitigating effect.")).toBe(true);
    // The human factors are another part.
    expect(summary).not.toContain("Ligures");
  });

  it("finds the section by its own heading, not the wine's description", () => {
    const summary = linkSummary(spanish, "es")!;
    expect(summary.startsWith("La Valtelina representa")).toBe(true);
    expect(summary).not.toContain("parámetros analíticos");
  });

  it("gives nothing where the section is missing or too short to say anything", () => {
    expect(linkSummary("1. Name\nAlpi Retiche\n", "en")).toBeNull();
    expect(linkSummary("8. Description of the link(s)\nShort line.\n", "en")).toBeNull();
  });

  it("reads the heading as the Journal has worded it over the years", () => {
    const body =
      "La zona geográfica se extiende por las laderas del valle, donde el clima templado y los suelos calizos favorecen una maduración lenta y completa de la uva.";
    expect(linkSummary(`8. Descripción de los vínculos\n${body}\n`, "es")).toBe(body);
    const french =
      "L’aire géographique s’étend sur les coteaux de la vallée, où le climat tempéré et les sols calcaires favorisent une maturation lente et complète du raisin.";
    expect(linkSummary(`10. Lien avec l’aire géographique\n${french}\n`, "fr")).toBe(french);
    const dutch =
      "Het afgebakende geografische gebied ligt op de hellingen van het dal, waar het gematigde klimaat en de kalkrijke bodem een trage en volledige rijping bevorderen.";
    expect(linkSummary(`8. Beschrijving van het (de) verband(en)\n${dutch}\n`, "nl")).toBe(dutch);
  });

  it("reads the single document's link, not an amendment that names it first", () => {
    const amendment =
      "The link has been reworded to describe the soils more precisely and to bring the text into line with the product specification as amended by this request.";
    const document =
      "The demarcated area lies on the southern slopes of the valley, where a temperate climate and limestone soils favour a slow and complete ripening of the grapes.";
    const text = `2. Link with the geographical area\n${amendment}\nSINGLE DOCUMENT\n8. Description of the link(s)\n${document}\n`;
    expect(linkSummary(text, "en")).toBe(document);
  });

  it("passes over a sentence that only says which categories the link covers", () => {
    const scope =
      "The historical, cultural, social and economic link, and the link with the geographical environment and origin, apply to the ‘wine’ and ‘wine of overripe grapes’ categories.";
    const land =
      "The area lies on a low plateau open to the sea breezes, whose poor, sandy soils and dry summers keep yields low and give the grapes a long and even ripening.";
    expect(linkSummary(`8. Description of the link(s)\n${scope}\n${land}\n`, "en")).toBe(land);
  });

  it("ends at a sentence's end, not an abbreviation's or inside brackets", () => {
    expect(upToSentenceEnd("Das Klima ist kontinental, d. h. die Winter sind kalt")).toBe("");
    expect(
      upToSentenceEnd(
        "Η περιοχή είναι αμπελόεσσα. Υπάρχουν πολλά ευρήματα (π.χ. αμφορείς) και αναφορές (π.χ.",
      ),
    ).toBe("Η περιοχή είναι αμπελόεσσα.");
  });
});
