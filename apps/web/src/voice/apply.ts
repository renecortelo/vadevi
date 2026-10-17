import type { DeepTastingRequest, VoiceExtractResponse, WineType } from "@vadevi/contracts";

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

/** The identification form's fields, as strings, the way its inputs hold them. */
export type SpokenWine = {
  countryCode: string;
  displayName: string;
  producerName: string;
  region: string;
  vintageYear: string;
  wineType: string;
};

/**
 * What was said of a bottle, laid onto the wine being added: only empty
 * fields fill, and what was said of the tasting is not this form's.
 */
export function applyVoiceToWine(
  wine: SpokenWine,
  proposal: Proposal,
): { filled: string[]; suggestions: [string, Field][]; wine: SpokenWine } {
  const next = { ...wine };
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
  const fill = (name: string, key: keyof SpokenWine, value: unknown) => {
    if ((typeof value !== "string" && typeof value !== "number") || next[key] !== "") return;
    next[key] = String(value);
    filled.push(name);
  };
  fill("producerName", "producerName", certain("producerName"));
  fill("wineName", "displayName", certain("wineName"));
  fill("vintageYear", "vintageYear", certain("vintageYear"));
  // The registered name, when the atlas placed what was heard.
  fill("region", "region", proposal.region?.name ?? certain("region"));
  fill("countryCode", "countryCode", certain("countryCode"));
  fill("wineType", "wineType", certain("wineType"));
  return { filled, suggestions, wine: next };
}

/** The deep tasting's fields a spoken note may fill as said, one to one. */
const deepFields = [
  "score100",
  "sentiment",
  "wouldBuy",
  "wouldDrinkAgain",
  "appearanceClarity",
  "appearanceColorFamily",
  "appearanceIntensity",
  "appearanceHue",
  "appearanceText",
  "noseCondition",
  "noseText",
  "palateText",
  "conclusionText",
  "sweetness",
  "acidity",
  "tanninLevel",
  "body",
  "finishLength",
  "tanninTexture",
  "palateTexture",
  "effervescence",
  "beadSize",
] as const satisfies readonly (keyof DeepTastingRequest)[];

/**
 * The same, laid onto a deep tasting of a wine already chosen: what was said
 * of the wine's identity is not this form's (the wine is the one being
 * tasted), and the date stays the one the form has. Only empty fields fill;
 * a hedged value comes back as a suggestion.
 */
export function applyVoiceToDeepTasting(
  payload: DeepTastingRequest,
  proposal: Proposal,
): { filled: string[]; payload: DeepTastingRequest; suggestions: [string, Field][] } {
  const next: Record<string, unknown> = { ...payload };
  const context: Record<string, unknown> = { ...payload.context };
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
  const empty = (value: unknown) => value === undefined || value === null || value === "";

  for (const name of deepFields) {
    const value = certain(name);
    if (value === undefined || !empty(next[name])) continue;
    next[name] = value;
    filled.push(name);
  }
  // The aromas named, in the taster's words, when nothing else was said of the nose.
  const aromas = certain("aromas");
  if (Array.isArray(aromas) && aromas.length > 0 && empty(next.noseText)) {
    next.noseText = aromas.join(", ").slice(0, 2_000);
    filled.push("aromas");
  }
  const food = certain("foodText");
  if (typeof food === "string" && empty(context.foodText)) {
    context.foodText = food.slice(0, 500);
    filled.push("foodText");
  }
  const temperature = certain("servingTemperatureC");
  if (typeof temperature === "number" && empty(context.servingTemperatureTenthsC)) {
    context.servingTemperatureTenthsC = Math.round(temperature * 10);
    filled.push("servingTemperatureC");
  }
  const decanted = certain("decanted");
  if (typeof decanted === "boolean" && empty(context.decanted)) {
    context.decanted = decanted;
    filled.push("decanted");
  }
  if (Object.keys(context).length > 0) next.context = context;
  if (filled.length > 0) next.creationMethod = "audio";
  return { filled, payload: next as DeepTastingRequest, suggestions };
}
