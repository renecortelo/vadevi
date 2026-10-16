import { describe, expect, it } from "vitest";

import { acceptProposal } from "../src/services/voice-proposal";

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
});
