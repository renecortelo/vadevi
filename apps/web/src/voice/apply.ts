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
  extra: { descriptors?: string[]; now?: Date } = {},
): { draft: QuickLogDraft; filled: string[]; suggestions: [string, Field][] } {
  const start = forgetVoice(draft);
  const wine = { ...start.winePayload };
  const note = { ...start.notePayload };
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
  // The tasting words the form offers, ticked from what was said.
  if (note.descriptorCodes.length === 0 && (extra.descriptors ?? []).length > 0) {
    // The quick note keeps three: the first ones said.
    note.descriptorCodes = extra.descriptors!.slice(0, 3);
    filled.push("descriptors");
  }
  // The day: the one said ("yesterday", "on Saturday"), or else today when
  // the draft was begun on another day — "I'm tasting" is now, and a draft
  // left unsaved for days kept the day it was begun (18 October 2026).
  const now = extra.now ?? new Date();
  const said = certain("tastedAt");
  if (typeof said === "string" && /^\d{4}-\d{2}-\d{2}$/.test(said)) {
    const [year, month, day] = said.split("-").map(Number);
    const at = new Date(now);
    at.setFullYear(year!, month! - 1, day!);
    note.tastedAt = at.toISOString();
    filled.push("tastedAt");
  } else if (
    filled.length > 0 &&
    new Date(note.tastedAt).toDateString() !== now.toDateString() &&
    new Date(note.tastedAt) < now
  ) {
    note.tastedAt = now.toISOString();
  }
  if (filled.length > 0) note.creationMethod = "audio";
  const next = { ...start, notePayload: note, winePayload: wine };
  return { draft: { ...next, voiceFilled: changedBy(start, next) }, filled, suggestions };
}

/** A draft's fields by path, the way `voiceFilled` names them. */
function fieldsOf(draft: QuickLogDraft): Record<string, unknown> {
  return {
    ...Object.fromEntries(
      Object.entries(draft.winePayload).map(([key, value]) => [`wine.${key}`, value]),
    ),
    ...Object.fromEntries(
      Object.entries(draft.notePayload).map(([key, value]) => [`note.${key}`, value]),
    ),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What a spoken note changed, field by field (its marker aside). */
function changedBy(before: QuickLogDraft, after: QuickLogDraft): Record<string, unknown> {
  const old = fieldsOf(before);
  return Object.fromEntries(
    Object.entries(fieldsOf(after)).filter(
      ([key, value]) => key !== "note.creationMethod" && !same(old[key], value),
    ),
  );
}

/** The empty value of a field the reader must still see as a field. */
const emptyOf: Record<string, unknown> = {
  "note.descriptorCodes": [],
  "wine.displayName": "",
  "wine.producerName": "",
  "wine.vintageYear": null,
};

/**
 * Before a new spoken note: what the last one filled and the reader left as it
 * was is cleared, so a second wine described into an unsaved draft replaces
 * the first's name and producer — what the reader typed or corrected stays.
 */
export function forgetVoice(draft: QuickLogDraft): QuickLogDraft {
  const filled = draft.voiceFilled ?? {};
  const wine: Record<string, unknown> = { ...draft.winePayload };
  const note: Record<string, unknown> = { ...draft.notePayload };
  for (const [path, value] of Object.entries(filled)) {
    if (path === "note.tastedAt") continue;
    const [part, key] = path.split(".") as ["note" | "wine", string];
    const holder = part === "wine" ? wine : note;
    if (!same(holder[key], value)) continue;
    if (path in emptyOf) holder[key] = emptyOf[path];
    else delete holder[key];
  }
  return {
    ...draft,
    notePayload: note as QuickLogDraft["notePayload"],
    voiceFilled: {},
    winePayload: wine as QuickLogDraft["winePayload"],
  };
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
  /** What the last spoken description filled; replaced where left as it was. */
  previous: Partial<SpokenWine> = {},
): {
  filled: string[];
  set: Partial<SpokenWine>;
  suggestions: [string, Field][];
  wine: SpokenWine;
} {
  const next = { ...wine };
  for (const [key, value] of Object.entries(previous) as [keyof SpokenWine, string][]) {
    if (next[key] === value) next[key] = "";
  }
  const before = { ...next };
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
  const set = Object.fromEntries(
    (Object.keys(next) as (keyof SpokenWine)[])
      .filter((key) => next[key] !== before[key])
      .map((key) => [key, next[key]]),
  ) as Partial<SpokenWine>;
  return { filled, set, suggestions, wine: next };
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
  "viscosity",
  "noseCondition",
  "noseIntensity",
  "noseText",
  "noseSwirledIntensity",
  "noseSwirledText",
  "palateText",
  "conclusionText",
  "sweetness",
  "acidity",
  "tanninLevel",
  "body",
  "finishLength",
  "alcoholPerception",
  "balance",
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
  extra: { descriptors?: { nose: string[]; palate: string[] }; now?: Date } = {},
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
  // The tasting words of each step, ticked from what was said of it.
  const descriptors = [...payload.descriptors];
  for (const phase of ["nose", "palate"] as const) {
    const heard = extra.descriptors?.[phase] ?? [];
    if (heard.length === 0 || descriptors.some((item) => item.phase === phase)) continue;
    descriptors.push(...heard.map((code) => ({ code, phase })));
    filled.push(`${phase}Descriptors`);
  }
  next.descriptors = descriptors;
  // The day said ("yesterday"), at the time the form already has.
  const said = certain("tastedAt");
  if (typeof said === "string" && /^\d{4}-\d{2}-\d{2}$/.test(said)) {
    const [year, month, day] = said.split("-").map(Number);
    const at = new Date(payload.tastedAt);
    at.setFullYear(year!, month! - 1, day!);
    next.tastedAt = at.toISOString();
    filled.push("tastedAt");
  }
  if (Object.keys(context).length > 0) next.context = context;
  if (filled.length > 0) next.creationMethod = "audio";
  return { filled, payload: next as DeepTastingRequest, suggestions };
}
