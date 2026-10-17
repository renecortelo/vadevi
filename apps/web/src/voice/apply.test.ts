import { describe, expect, it } from "vitest";

import type { DeepTastingRequest } from "@vadevi/contracts";

import type { QuickLogDraft } from "../offline/database";
import { applyVoiceProposal, applyVoiceToDeepTasting, applyVoiceToWine } from "./apply";

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
    // What was there stays; the wine and the date are not this form's to change.
    expect(next.acidity).toBe(2);
    expect(next.tastedAt).toBe(payload.tastedAt);
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
