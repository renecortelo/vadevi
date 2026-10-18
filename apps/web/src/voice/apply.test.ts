import { describe, expect, it } from "vitest";

import type { DeepTastingRequest } from "@vadevi/contracts";

import type { QuickLogDraft } from "../offline/database";
import { applyVoiceProposal, applyVoiceToDeepTasting, applyVoiceToWine } from "./apply";
import { heardDescriptors } from "./descriptors";

const draft = {
  id: "d",
  includeNote: true,
  noteId: "n",
  noteMutationId: "nm",
  notePayload: {
    descriptorCodes: [],
    mode: "quick",
    state: "submitted",
    tastedAt: "2026-10-16T20:00:00.000Z",
  },
  spaceId: "s",
  updatedAt: "2026-10-16T20:00:00.000Z",
  userId: "u",
  wineId: "w",
  wineMutationId: "wm",
  winePayload: {
    displayName: "Typed by hand",
    identityStatus: "confirmed",
    nonVintage: false,
    producerName: "",
  },
} as unknown as QuickLogDraft;

describe("a spoken note laid onto the quick log", () => {
  it("fills only what is empty, from what was said for certain", () => {
    const {
      draft: next,
      filled,
      suggestions,
    } = applyVoiceProposal(draft, {
      fields: {
        grapes: { quote: "creo que garnacha", status: "ambiguous", value: ["Garnacha"] },
        noseText: { quote: "cereza y clavo", status: "explicit", value: "cereza y clavo" },
        producerName: { quote: "de Bodega Nudo", status: "explicit", value: "Bodega Nudo" },
        region: { quote: "Ries Baixes", status: "explicit", value: "Ries Baixes" },
        score100: { quote: "ocho y medio sobre diez", status: "explicit", value: 85 },
        wineName: { quote: "Loma de Nerea", status: "explicit", value: "Loma de Nerea" },
      },
      region: { name: "Rías Baixas", regionId: "es-rias-baixas" },
      severalWines: false,
    });
    // What the reader typed stays; the register's name stands for what was heard.
    expect(next.winePayload.displayName).toBe("Typed by hand");
    expect(next.winePayload.producerName).toBe("Bodega Nudo");
    expect(next.winePayload.region).toBe("Rías Baixas");
    expect(next.winePayload.grapes).toBeUndefined();
    expect(next.notePayload.score100).toBe(85);
    expect(next.notePayload.comment).toBe("cereza y clavo");
    expect(next.notePayload.creationMethod).toBe("audio");
    expect(filled.sort()).toEqual(["comment", "producerName", "region", "score100"]);
    expect(suggestions.map(([name]) => name)).toEqual(["grapes"]);
  });

  it("leaves a note written by hand when nothing was filled", () => {
    const { draft: next } = applyVoiceProposal(draft, {
      fields: {},
      region: null,
      severalWines: false,
    });
    expect(next.notePayload.creationMethod).toBeUndefined();
  });
});

describe("a spoken note laid onto a deep tasting", () => {
  const payload = {
    acidity: 2,
    descriptors: [],
    mode: "deep",
    state: "draft",
    tastedAt: "2026-10-16T20:00:00.000Z",
    wineId: "w",
  } as DeepTastingRequest;

  it("fills every step's empty fields, the context's in its own units", () => {
    const {
      filled,
      payload: next,
      suggestions,
    } = applyVoiceToDeepTasting(payload, {
      fields: {
        acidity: { quote: "acidez alta", status: "explicit", value: 4 },
        aromas: { quote: "mora, regaliz", status: "explicit", value: ["mora", "regaliz"] },
        body: { quote: "creo que con cuerpo", status: "ambiguous", value: 4 },
        conclusionText: { quote: "Muy rico.", status: "explicit", value: "Muy rico." },
        foodText: { quote: "con cordero", status: "explicit", value: "cordero" },
        producerName: { quote: "de Bodega Nudo", status: "explicit", value: "Bodega Nudo" },
        servingTemperatureC: { quote: "a dieciséis grados", status: "explicit", value: 16.5 },
        tastedAt: { quote: "ayer", status: "explicit", value: "2026-10-15" },
        tanninLevel: { quote: "taninos medios", status: "explicit", value: 3 },
      },
      region: null,
      severalWines: false,
    });
    // What was there stays, and the wine is not this form's to change; the
    // day said ("ayer") is the tasting's, at the time the form had.
    expect(next.acidity).toBe(2);
    expect(new Date(next.tastedAt).getDate()).toBe(15);
    expect(next).not.toHaveProperty("producerName");
    expect(next.tanninLevel).toBe(3);
    expect(next.noseText).toBe("mora, regaliz");
    expect(next.context).toEqual({ foodText: "cordero", servingTemperatureTenthsC: 165 });
    expect(next.creationMethod).toBe("audio");
    expect(filled.sort()).toEqual([
      "aromas",
      "conclusionText",
      "foodText",
      "servingTemperatureC",
      "tanninLevel",
      "tastedAt",
    ]);
    expect(suggestions.map(([name]) => name)).toEqual(["body"]);
  });

  it("marks nothing spoken when nothing was filled", () => {
    const { payload: next } = applyVoiceToDeepTasting(payload, {
      fields: { acidity: { quote: "acidez alta", status: "explicit", value: 4 } },
      region: null,
      severalWines: false,
    });
    expect(next.creationMethod).toBeUndefined();
    expect(next.context).toBeUndefined();
  });
});

describe("a spoken description laid onto a wine being added", () => {
  it("fills the empty fields as the form's strings, and nothing of the tasting", () => {
    const { filled, wine } = applyVoiceToWine(
      {
        countryCode: "",
        displayName: "Loma",
        producerName: "",
        region: "",
        vintageYear: "",
        wineType: "",
      },
      {
        fields: {
          producerName: { quote: "Bodega Nudo", status: "explicit", value: "Bodega Nudo" },
          score100: { quote: "un noventa", status: "explicit", value: 90 },
          vintageYear: { quote: "2022", status: "explicit", value: 2022 },
          wineName: { quote: "Loma de Nerea", status: "explicit", value: "Loma de Nerea" },
          wineType: { quote: "tinto", status: "explicit", value: "red" },
        },
        region: { name: "Rías Baixas", regionId: "es-rias-baixas" },
        severalWines: false,
      },
    );
    expect(wine).toEqual({
      countryCode: "",
      displayName: "Loma",
      producerName: "Bodega Nudo",
      region: "Rías Baixas",
      vintageYear: "2022",
      wineType: "red",
    });
    expect(filled.sort()).toEqual(["producerName", "region", "vintageYear", "wineType"]);
  });
});

describe("a second spoken note into a draft never saved", () => {
  it("replaces what the first one filled and the reader left, never what they typed", () => {
    const now = new Date("2026-10-18T10:00:00.000Z");
    const first = applyVoiceProposal(
      { ...draft, winePayload: { ...draft.winePayload, displayName: "" } },
      {
        fields: {
          producerName: { quote: "de Casa Uno", status: "explicit", value: "Casa Uno" },
          sentiment: { quote: "me encanta", status: "explicit", value: "like" },
          wineName: { quote: "Vino Uno", status: "explicit", value: "Vino Uno" },
        },
        region: null,
        severalWines: false,
      },
      { now },
    ).draft;
    // The reader corrects the producer by hand; the name stays as voice left it.
    const corrected = {
      ...first,
      winePayload: { ...first.winePayload, producerName: "Casa Uno Corregida" },
    };
    const second = applyVoiceProposal(
      corrected,
      {
        fields: {
          producerName: { quote: "de Casa Dos", status: "explicit", value: "Casa Dos" },
          wineName: { quote: "Vino Dos", status: "explicit", value: "Vino Dos" },
        },
        region: null,
        severalWines: false,
      },
      { now },
    ).draft;
    expect(second.winePayload.displayName).toBe("Vino Dos");
    expect(second.winePayload.producerName).toBe("Casa Uno Corregida");
    // Nothing of the first wine's liking survives into the second.
    expect(second.notePayload.sentiment).toBeUndefined();
    expect(second.voiceFilled).toEqual({ "wine.displayName": "Vino Dos" });
  });

  it("takes up a draft begun on another day today, or on the day that was said", () => {
    const now = new Date("2026-10-18T10:00:00.000Z");
    const stale = applyVoiceProposal(
      draft,
      {
        fields: { score100: { quote: "un 90", status: "explicit", value: 90 } },
        region: null,
        severalWines: false,
      },
      { now },
    ).draft;
    expect(stale.notePayload.tastedAt).toBe(now.toISOString());
    const said = applyVoiceProposal(
      draft,
      {
        fields: { tastedAt: { quote: "ayer", status: "explicit", value: "2026-10-17" } },
        region: null,
        severalWines: false,
      },
      { now },
    ).draft;
    expect(new Date(said.notePayload.tastedAt).toISOString().slice(0, 10)).toBe("2026-10-17");
  });
});

describe("the tasting words a spoken note names", () => {
  it("ticks the form's descriptors from the reader's words and the model's list", () => {
    const heard = heardDescriptors(
      {
        fields: {
          aromas: {
            quote: "huele a mantequilla, a brioche y a flor blanca",
            status: "explicit",
            value: ["butter", "brioche", "white flowers"],
          },
          palateText: {
            quote: "me da como cereza",
            status: "explicit",
            value: "me da como cereza",
          },
        },
        region: null,
        severalWines: false,
      },
      "es",
      null,
    );
    expect(heard.nose).toEqual(
      expect.arrayContaining(["production.autolysis.brioche", "floral.white_flower"]),
    );
    // Cherry was said of the mouth: the quick note's single list counts it.
    expect(heard.any).toContain("fruit.red.cherry");
  });
});
