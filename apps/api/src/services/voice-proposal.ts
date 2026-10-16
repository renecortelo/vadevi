/**
 * Voice tastings, step two, the part that trusts nothing: what a model proposes
 * from a transcript becomes a proposal only field by field, and a field only
 * when its value fits the form and the words it came from are in the
 * transcript. A value without those words was not said — it is dropped, never
 * guessed (the library's rule: no fact without its source).
 */

/** The form fields a spoken tasting may fill, and what each accepts. */
export const voiceFields = {
  // The wine, as said: for finding or creating it, never saved on its own.
  producerName: "text",
  wineName: "text",
  vintageYear: "year",
  region: "text",
  countryCode: "country",
  grapes: "list",
  // The contract's own types (`WineTypeSchema`); a sweet wine is told by its
  // sweetness, not a type of its own.
  wineType: ["red", "white", "rose", "sparkling", "fortified", "orange"],
  alcoholAbv: "percent",
  bottleSizeMl: "volume",
  priceAmount: "money",
  currency: "currency",
  // The tasting.
  tastedAt: "date",
  score100: "score",
  sentiment: ["dislike", "neutral", "like"],
  wouldDrinkAgain: ["yes", "no", "unsure"],
  wouldBuy: ["yes", "no", "unsure"],
  appearanceClarity: ["clear", "hazy"],
  appearanceColorFamily: ["white", "rose", "red", "orange", "brown"],
  appearanceIntensity: "scale",
  appearanceHue: "text",
  appearanceText: "text",
  aromas: "list",
  noseCondition: ["clean", "possible_fault"],
  noseText: "text",
  palateText: "text",
  conclusionText: "text",
  sweetness: "scale",
  acidity: "scale",
  tanninLevel: "scale",
  body: "scale",
  finishLength: "scale",
  tanninTexture: ["silky", "fine", "grippy", "coarse"],
  palateTexture: ["lean", "round", "creamy", "oily"],
  effervescence: "scale",
  beadSize: ["fine", "medium", "coarse"],
  foodText: "text",
  servingTemperatureC: "temperature",
  decanted: "boolean",
} as const;

export type VoiceField = keyof typeof voiceFields;

export type ProposedField = {
  /** "ambiguous" when the speaker hedged ("I think", "maybe"): offered, not filled. */
  status: "ambiguous" | "explicit";
  /** The transcript's words the value came from. */
  quote: string;
  value: boolean | number | string | string[];
};

export type VoiceProposal = {
  fields: Partial<Record<VoiceField, ProposedField>>;
  /** Proposed values left out, and why — counted, never shown as the reader's words. */
  discarded: {
    field: string;
    reason: "name-overlap" | "no-evidence" | "not-a-field" | "out-of-range";
  }[];
  /** The speaker described more than one wine: only the first is proposed. */
  severalWines: boolean;
};

/** Text compared without case, accents, punctuation or spacing differences. */
export function comparable(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const days = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;

/**
 * Words that hedge what follows, in the app's languages: a value said after
 * one is offered as a guess, whatever the model marked. Models missed one in
 * three of eight test notes ("Diria que hi ha garnatxa…"). Written as
 * `comparable` writes text: no accents, no hyphens.
 */
const hedges =
  /\b(creo|me parece|diria|crec|em sembla|potser|quizas|quiza|tal vez|i think|maybe|perhaps|probably|i guess|je pense|je crois|peut etre|il me semble|credo|penso|forse|mi sembra|ich glaube|ich denke|vielleicht|wohl|ik denk|misschien|volgens mij|acho|talvez|parece me|suspeito)\b/;

/** Words that say a name is a winery's, in the app's languages. */
const winery =
  /\b(bodega|bodegas|celler|cellers|cava|domaine|domaines|chateau|clos|maison|cave|weingut|winzer|cantina|tenuta|azienda|fattoria|quinta|adega|herdade|casa|winery|wines|estate|vineyards|cellars|wijnhuis|wijngoed|producer|productor|productora|elaborador|elabora|vigneron|produttore|produtor)\b/;

/** Fields that hold the taster's own words: the quote itself, never a paraphrase. */
const ownWords = new Set<VoiceField>([
  "appearanceText",
  "conclusionText",
  "foodText",
  "noseText",
  "palateText",
]);

/** A value as the form takes it, or null when it does not fit. */
function fit(field: VoiceField, raw: unknown, today: string): ProposedField["value"] | null {
  const kind = voiceFields[field];
  const text = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
  if (Array.isArray(kind)) return (kind as readonly string[]).includes(text) ? text : null;
  switch (kind) {
    case "text":
      return text.length > 0 && text.length <= 2_000 ? text : null;
    case "list": {
      const items = (Array.isArray(raw) ? raw : text.split(/\s*[,;]\s*/))
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0 && item.length <= 80);
      return items.length > 0 && items.length <= 12 ? items : null;
    }
    case "year": {
      const year = Number(text);
      const now = Number(today.slice(0, 4));
      return Number.isInteger(year) && year >= 1900 && year <= now ? year : null;
    }
    case "country":
      return /^[A-Z]{2}$/.test(text) ? text : null;
    case "currency":
      return /^[A-Z]{3}$/.test(text) ? text : null;
    case "money": {
      const value = Number(text.replace(",", "."));
      return value > 0 && value <= 100_000 ? Math.round(value * 100) / 100 : null;
    }
    case "volume": {
      const value = Number(text);
      return Number.isInteger(value) && value >= 50 && value <= 20_000 ? value : null;
    }
    case "percent": {
      const value = Number(text.replace(",", "."));
      return value >= 3 && value <= 25 ? Math.round(value * 10) / 10 : null;
    }
    case "score": {
      const value = Number(text);
      return Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
    }
    case "scale": {
      const value = Number(text);
      return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
    }
    case "temperature": {
      const value = Number(text.replace(",", "."));
      return value >= -2 && value <= 30 ? Math.round(value * 10) / 10 : null;
    }
    case "boolean":
      return text === "true" ? true : text === "false" ? false : null;
    case "date": {
      // A tasting from today or the recent past; never the future.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) return null;
      const before = days(text, today);
      return before >= 0 && before <= 60 ? text : null;
    }
  }
  return null;
}

/**
 * The proposal a model's answer makes, checked against the form and the
 * transcript. `raw` is whatever the model returned; nothing in it is trusted.
 */
export function acceptProposal(raw: unknown, transcript: string, today: string): VoiceProposal {
  const proposal: VoiceProposal = { discarded: [], fields: {}, severalWines: false };
  if (typeof raw !== "object" || raw === null) return proposal;
  const answer = raw as { fields?: unknown; wineCount?: unknown };
  proposal.severalWines = typeof answer.wineCount === "number" && answer.wineCount > 1;
  const heard = ` ${comparable(transcript)} `;
  for (const item of Array.isArray(answer.fields) ? answer.fields.slice(0, 60) : []) {
    if (typeof item !== "object" || item === null) continue;
    const { certain, name, quote, value } = item as Record<string, unknown>;
    if (typeof name !== "string" || !(name in voiceFields)) {
      proposal.discarded.push({ field: String(name).slice(0, 40), reason: "not-a-field" });
      continue;
    }
    const field = name as VoiceField;
    // The words must have been said: the quote, as heard, in the transcript.
    const words = typeof quote === "string" ? comparable(quote) : "";
    if (words.length < 2 || !heard.includes(` ${words} `)) {
      proposal.discarded.push({ field, reason: "no-evidence" });
      continue;
    }
    // A sentence of the taster's is kept in their words and language: models
    // translated or paraphrased them (an Italian note came back in English).
    const fitted = fit(field, ownWords.has(field) ? quote : value, today);
    if (fitted === null) {
      proposal.discarded.push({ field, reason: "out-of-range" });
      continue;
    }
    // The first proposal of a field stands; a model repeating one adds nothing.
    proposal.fields[field] ??= {
      quote: (quote as string).trim().slice(0, 300),
      status:
        certain === false || hedges.test(comparable(quote as string)) ? "ambiguous" : "explicit",
      value: fitted,
    };
  }
  // A score of nought is only a nought that was said: models turned "no
  // score yet" into 0 (lote 2, 16 October 2026).
  const score = proposal.fields.score100;
  if (
    score?.value === 0 &&
    !/\b(0|zero|cero|zero|null|nul|nulla)\b/.test(comparable(score.quote))
  ) {
    delete proposal.fields.score100;
    proposal.discarded.push({ field: "score100", reason: "no-evidence" });
  }
  // A producer is a winery or a maker, said as one. A lone given name ("Laia",
  // "Tosca") is far more often who brought the bottle: offered, not filled.
  const maker = proposal.fields.producerName;
  if (
    maker !== undefined &&
    !/\s/.test(String(maker.value).trim()) &&
    !winery.test(comparable(maker.quote))
  ) {
    maker.status = "ambiguous";
  }
  // A producer heard inside the wine's own name ("Patio de Lucía" → "Lucía",
  // "Alina's High Path") is a reading of the name, not a producer that was
  // said: models made it in two of four test notes on 16 October 2026.
  const producer = proposal.fields.producerName;
  const wine = proposal.fields.wineName;
  if (producer !== undefined && wine !== undefined) {
    const [a, b] = [comparable(String(producer.value)), comparable(String(wine.value))];
    if (a.includes(b) || b.includes(a)) {
      delete proposal.fields.producerName;
      proposal.discarded.push({ field: "producerName", reason: "name-overlap" });
    }
  }
  return proposal;
}
