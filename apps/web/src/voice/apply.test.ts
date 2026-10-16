import { describe, expect, it } from "vitest";

import type { QuickLogDraft } from "../offline/database";
import { applyVoiceProposal } from "./apply";

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
