import type { VoiceExtractResponse, WineType } from "@vadevi/contracts";

import type { QuickLogDraft } from "../offline/database";

type Proposal = VoiceExtractResponse["data"];
type Field = Proposal["fields"][string];

/**
 * A spoken note's proposal laid onto the quick-log draft: it fills only what
 * is still empty — nothing the reader typed is overwritten — and only what was
 * said for certain. A hedged value ("I think there is garnacha") is handed
 * back as a suggestion for the reader to take or leave. Nothing is saved: the
 * reader reviews and saves the form as always, and the note then keeps that
 * it was first written by voice.
 */
export function applyVoiceProposal(
  draft: QuickLogDraft,
  proposal: Proposal,
): { draft: QuickLogDraft; filled: string[]; suggestions: [string, Field][] } {
  const wine = { ...draft.winePayload };
  const note = { ...draft.notePayload };
  const filled: string[] = [];
  const suggestions: [string, Field][] = [];
  const certain = (name: string) => {
    const field = proposal.fields[name];
    if (field === undefined) return undefined;
    if (field.status === "ambiguous") {
      suggestions.push([name, field]);
      return undefined;
    }
    return field.value;
  };
  const fill = <T>(name: string, current: T | undefined, apply: (value: never) => void) => {
    const value = certain(name);
    if (value === undefined || (current !== undefined && current !== "" && current !== null)) {
      return;
    }
    apply(value as never);
    filled.push(name);
  };

  fill("wineName", wine.displayName, (value: string) => (wine.displayName = value));
  fill("producerName", wine.producerName, (value: string) => (wine.producerName = value));
  // The registered name, when the atlas placed what was heard ("Ries Baixes").
  const region = proposal.region?.name ?? certain("region");
  if (typeof region === "string" && (wine.region ?? "") === "") {
    wine.region = region;
    filled.push("region");
  }
  fill("countryCode", wine.countryCode, (value: string) => (wine.countryCode = value));
  fill("vintageYear", wine.vintageYear, (value: number) => (wine.vintageYear = value));
  fill("wineType", wine.wineType, (value: WineType) => (wine.wineType = value));
  fill("alcoholAbv", wine.alcoholAbv, (value: number) => (wine.alcoholAbv = value));
  fill("bottleSizeMl", wine.bottleSizeMl, (value: number) => (wine.bottleSizeMl = value));
  const grapes = certain("grapes");
  if (Array.isArray(grapes) && (wine.grapes ?? []).length === 0) {
    wine.grapes = grapes.map((name) => ({ name }));
    filled.push("grapes");
  }

  fill("score100", note.score100, (value: number) => (note.score100 = value));
  fill("sentiment", note.sentiment, (value: typeof note.sentiment) => (note.sentiment = value));
  fill("wouldBuy", note.wouldBuy, (value: typeof note.wouldBuy) => (note.wouldBuy = value));
  fill(
    "wouldDrinkAgain",
    note.wouldDrinkAgain,
    (value: typeof note.wouldDrinkAgain) => (note.wouldDrinkAgain = value),
  );
  fill("foodText", note.foodText, (value: string) => (note.foodText = value));
  // The quick note's one comment gathers what was said of the wine itself, in
  // the taster's own words.
  if ((note.comment ?? "") === "") {
    const words = ["noseText", "palateText", "conclusionText"]
      .map((name) => certain(name))
      .filter((value): value is string => typeof value === "string");
    if (words.length > 0) {
      note.comment = words.join(" ").slice(0, 2_000);
      filled.push("comment");
    }
  }
  if (filled.length > 0) note.creationMethod = "audio";
  return { draft: { ...draft, notePayload: note, winePayload: wine }, filled, suggestions };
}
