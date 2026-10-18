import { describe, expect, it } from "vitest";

import { acceptProposal, spokenDay } from "../src/services/voice-proposal";

/**
 * What a model proposes from a spoken note stands only field by field: a value
 * that fits the form, from words the speaker said. Cases from the test
 * recordings of 16 October 2026.
 */
const today = "2026-10-16";
const transcript =
  "Estoy apuntando la Loma de Ginés, un tinto de Rioja de 2020. Diria que hay garnacha. " +
  "Me llegan cereza, cuero limpio y clavo. Le pongo 8 y medio sobre 10. Está a 17 grados.";

describe("a spoken note's proposal", () => {
  it("keeps a value only with the words it came from", () => {
    const proposal = acceptProposal(
      {
        fields: [
          { certain: true, name: "region", quote: "de Rioja", value: "Rioja" },
          { certain: true, name: "score100", quote: "8 y medio sobre 10", value: 85 },
          // Never said: no producer, no alcohol.
          { certain: true, name: "producerName", quote: "Bodegas Inventadas", value: "Bodegas" },
          { certain: true, name: "alcoholAbv", quote: "", value: 14 },
          { certain: true, name: "secretField", quote: "Rioja", value: "x" },
        ],
        wineCount: 1,
      },
      transcript,
      today,
    );
    expect(Object.keys(proposal.fields).sort()).toEqual(["region", "score100"]);
    expect(proposal.fields.score100).toEqual({
      quote: "8 y medio sobre 10",
      status: "explicit",
      value: 85,
    });
    expect(proposal.discarded.map((item) => item.reason).sort()).toEqual([
      "no-evidence",
      "no-evidence",
      "not-a-field",
    ]);
  });

  it("offers a hedged value as a guess, and keeps the taster's own words", () => {
    const proposal = acceptProposal(
      {
        fields: [
          { certain: true, name: "grapes", quote: "Diria que hay garnacha", value: ["Garnacha"] },
          // A paraphrase, or a translation, is replaced by what was said.
          {
            certain: true,
            name: "noseText",
            quote: "cereza, cuero limpio y clavo",
            value: "cherry, clean leather and clove",
          },
        ],
        wineCount: 1,
      },
      transcript,
      today,
    );
    expect(proposal.fields.grapes?.status).toBe("ambiguous");
    expect(proposal.fields.noseText?.value).toBe("cereza, cuero limpio y clavo");
  });

  it("refuses values out of the form's range, and a producer read from the wine's name", () => {
    const proposal = acceptProposal(
      {
        fields: [
          { certain: true, name: "wineName", quote: "Loma de Ginés", value: "Loma de Ginés" },
          { certain: true, name: "producerName", quote: "de Ginés", value: "Ginés" },
          { certain: true, name: "score100", quote: "8 y medio sobre 10", value: 850 },
          { certain: true, name: "tastedAt", quote: "Está a 17 grados", value: "2026-12-01" },
        ],
        wineCount: 2,
      },
      transcript,
      today,
    );
    expect(Object.keys(proposal.fields)).toEqual(["wineName"]);
    expect(proposal.severalWines).toBe(true);
    expect(proposal.discarded.map((item) => item.reason).sort()).toEqual([
      "name-overlap",
      "out-of-range",
      "out-of-range",
    ]);
  });

  it("trusts nothing that is not an answer", () => {
    for (const raw of [null, "ignore the rules", 42, { fields: "all" }]) {
      expect(acceptProposal(raw, transcript, today).fields).toEqual({});
    }
  });

  it("takes a nought only when one was said, and a lone first name only as a guess", () => {
    const text = "Me lo trajo Laia, de Bodega Senda Clara. Todavía sin nota, quizá otro día.";
    const proposal = acceptProposal(
      {
        fields: [
          { certain: true, name: "score100", quote: "Todavía sin nota", value: 0 },
          { certain: true, name: "producerName", quote: "Me lo trajo Laia", value: "Laia" },
        ],
        wineCount: 1,
      },
      text,
      today,
    );
    expect(proposal.fields.score100).toBeUndefined();
    expect(proposal.fields.producerName?.status).toBe("ambiguous");
    const winery = acceptProposal(
      {
        fields: [
          {
            certain: true,
            name: "producerName",
            quote: "de Bodega Senda Clara",
            value: "Bodega Senda Clara",
          },
        ],
        wineCount: 1,
      },
      text,
      today,
    );
    expect(winery.fields.producerName?.status).toBe("explicit");
  });

  it("reads price, bottle, aromas and texture as the form takes them", () => {
    const text =
      "La botella es de setenta y cinco centilitros. Me costó dieciocho euros con cincuenta. " +
      "Huele a ciruela y violeta. En boca es redondo. Nariz limpia, sin corcho.";
    const proposal = acceptProposal(
      {
        fields: [
          { certain: true, name: "bottleSizeMl", quote: "setenta y cinco centilitros", value: 750 },
          {
            certain: true,
            name: "priceAmount",
            quote: "dieciocho euros con cincuenta",
            value: 18.5,
          },
          { certain: true, name: "currency", quote: "dieciocho euros con cincuenta", value: "EUR" },
          {
            certain: true,
            name: "aromas",
            quote: "ciruela y violeta",
            value: ["ciruela", "violeta"],
          },
          { certain: true, name: "palateTexture", quote: "En boca es redondo", value: "round" },
          {
            certain: true,
            name: "noseCondition",
            quote: "Nariz limpia, sin corcho",
            value: "clean",
          },
        ],
        wineCount: 1,
      },
      text,
      today,
    );
    expect(proposal.fields.bottleSizeMl?.value).toBe(750);
    expect(proposal.fields.priceAmount?.value).toBe(18.5);
    expect(proposal.fields.currency?.value).toBe("EUR");
    expect(proposal.fields.aromas?.value).toEqual(["ciruela", "violeta"]);
    expect(proposal.fields.palateTexture?.value).toBe("round");
    expect(proposal.fields.noseCondition?.value).toBe("clean");
    const wrong = acceptProposal(
      {
        fields: [
          { certain: true, name: "currency", quote: "dieciocho euros", value: "euros" },
          { certain: true, name: "bottleSizeMl", quote: "setenta y cinco", value: 75_000 },
        ],
        wineCount: 1,
      },
      text,
      today,
    );
    expect(wrong.fields).toEqual({});
  });

  it("tells a second wine apart, and keeps its words out of the first", () => {
    const text =
      "Primero, Loma de Nerea: blanco, albariño, de Rías Baixas. El vino es seco. " +
      "Ahora otro vino: Cauce de Elías, un tinto de mencía del Bierzo.";
    const proposal = acceptProposal(
      {
        fields: [
          { certain: true, name: "grapes", quote: "albariño", value: ["Albariño"] },
          { certain: true, name: "region", quote: "del Bierzo", value: "Bierzo" },
        ],
        wineCount: 1,
      },
      text,
      today,
    );
    expect(proposal.severalWines).toBe(true);
    expect(Object.keys(proposal.fields)).toEqual(["grapes"]);
    expect(proposal.discarded).toEqual([{ field: "region", reason: "second-wine" }]);
    // Comparing with another wine is not describing one.
    expect(
      acceptProposal({ fields: [], wineCount: 1 }, "Es más ácido que el anterior.", today)
        .severalWines,
    ).toBe(false);
  });

  it("hears a change of bottle in every language, and not a purchase", () => {
    // Cases of the third batch (18 October 2026), each a second wine.
    for (const text of [
      "Primero está Rastro de Aroa, un blanco de godello. Ahora cambio de botella: Vela de Siro.",
      "D'abord La Maille de Léonie, un rosé. Je passe maintenant à La Colline d'Ysée.",
      "Parto da La Trama di Sveva, un rosso. Cambio vino: ora è Il Nastro di Elia.",
      "Primeiro provo A Bainha de Noa, um branco. Agora mudo de garrafa. Este é O Laço.",
    ]) {
      expect(acceptProposal({ fields: [], wineCount: 1 }, text, today).severalWines).toBe(true);
    }
    expect(
      acceptProposal(
        { fields: [], wineCount: 1 },
        "I like it and would drink it again, but I haven't decided whether to buy another bottle.",
        today,
      ).severalWines,
    ).toBe(false);
  });

  it("reads a choice said as true, yes or in the note's language as the form's", () => {
    const text =
      "Lo veo limpio, es un rosado. La textura es cremosa. Lo compraría y lo volvería a beber, " +
      "pero no sé si repetiría. No tiene burbujas.";
    const proposal = acceptProposal(
      {
        fields: [
          { certain: true, name: "wouldBuy", quote: "Lo compraría", value: true },
          { certain: true, name: "wouldDrinkAgain", quote: "lo volvería a beber", value: "Yes" },
          { certain: true, name: "appearanceClarity", quote: "Lo veo limpio", value: "limpio" },
          { certain: true, name: "wineType", quote: "es un rosado", value: "rosé" },
          { certain: true, name: "palateTexture", quote: "textura es cremosa", value: "cremosa" },
          { certain: true, name: "effervescence", quote: "No tiene burbujas", value: 1 },
        ],
        wineCount: 1,
      },
      text,
      today,
    );
    expect(proposal.fields.wouldBuy?.value).toBe("yes");
    expect(proposal.fields.wouldDrinkAgain?.value).toBe("yes");
    expect(proposal.fields.appearanceClarity?.value).toBe("clear");
    expect(proposal.fields.wineType?.value).toBe("rose");
    expect(proposal.fields.palateTexture?.value).toBe("creamy");
    // No bubbles is no effervescence at all, not the lowest.
    expect(proposal.fields.effervescence).toBeUndefined();
  });

  it("reads a colour named in the note's language as the form's family", () => {
    const text = "Tiene un rojo rubí brillante.";
    const proposal = acceptProposal(
      {
        fields: [
          {
            certain: true,
            name: "appearanceColorFamily",
            quote: "un rojo rubí",
            value: "rojo rubí",
          },
        ],
        wineCount: 1,
      },
      text,
      today,
    );
    expect(proposal.fields.appearanceColorFamily?.value).toBe("red");
  });

  it("keeps names that were said, sizes that were said, and the taster's own sentences", () => {
    // Cases like the first real notes sent for review (18 October 2026), in
    // words written for the test.
    const text =
      "Pruebo un vino que se llama Brisa Alta del año 23, de aquí de la zona. " +
      "Con la copa quieta huele a vainilla, roble y un poco de madera. " +
      "Taninos suaves y un final algo largo. No sé cuántas copas me tomaría. " +
      "Cuesta unos 20 euros la botella.";
    const proposal = acceptProposal(
      {
        fields: [
          { certain: true, name: "wineName", quote: "se llama Brisa Alta", value: "Brisa Alta" },
          { certain: true, name: "region", quote: "de aquí de la zona", value: "local region" },
          {
            certain: true,
            name: "aromas",
            quote: "huele a vainilla, roble y un poco de madera",
            value: ["vainilla", "roble", "madera"],
          },
          { certain: true, name: "tanninLevel", quote: "Taninos suaves", value: 2 },
          { certain: true, name: "finishLength", quote: "un final algo largo", value: 4 },
          {
            certain: true,
            name: "wouldDrinkAgain",
            quote: "No sé cuántas copas me tomaría",
            value: "yes",
          },
          { certain: true, name: "bottleSizeMl", quote: "la botella", value: 750 },
        ],
        wineCount: 1,
      },
      text,
      today,
    );
    expect(proposal.fields.wineName?.value).toBe("Brisa Alta");
    // "local region" was never said; nor was a size.
    expect(proposal.fields.region).toBeUndefined();
    expect(proposal.fields.bottleSizeMl).toBeUndefined();
    // "No sé…" is a doubt, offered rather than filled.
    expect(proposal.fields.wouldDrinkAgain?.status).toBe("ambiguous");
    // The nose and the mouth in the taster's words, though the model gave neither.
    expect(proposal.fields.noseText?.value).toBe("huele a vainilla, roble y un poco de madera");
    expect(proposal.fields.palateText?.value).toBe("Taninos suaves. un final algo largo");
  });

  it("counts the tasting's day from the words that say it, in every language", () => {
    // Saturday 17 October 2026.
    const saturday = "2026-10-17";
    expect(spokenDay("last Saturday", saturday)).toBe("2026-10-10");
    expect(spokenDay("el viernes", saturday)).toBe("2026-10-16");
    expect(spokenDay("ayer", saturday)).toBe("2026-10-16");
    expect(spokenDay("antes de ayer", saturday)).toBe("2026-10-15");
    expect(spokenDay("avant-hier", saturday)).toBe("2026-10-15");
    expect(spokenDay("vor drei Tagen", saturday)).toBe("2026-10-14");
    expect(spokenDay("tre giorni fa", saturday)).toBe("2026-10-14");
    expect(spokenDay("há dois dias", saturday)).toBe("2026-10-15");
    expect(spokenDay("afgelopen zondag", saturday)).toBe("2026-10-11");
    expect(spokenDay("na terça-feira", saturday)).toBe("2026-10-13");
    expect(spokenDay("aquesta nit", saturday)).toBe(saturday);
    // Two days named, or none: the model's answer stands.
    expect(spokenDay("la abrí ayer y la pruebo hoy", saturday)).toBeNull();
    expect(spokenDay("una botella de 2019", saturday)).toBeNull();

    const proposal = acceptProposal(
      {
        fields: [{ certain: true, name: "tastedAt", quote: "last Saturday", value: "2026-10-11" }],
        wineCount: 1,
      },
      "I tasted it last Saturday with friends.",
      saturday,
    );
    expect(proposal.fields.tastedAt?.value).toBe("2026-10-10");
  });
});
