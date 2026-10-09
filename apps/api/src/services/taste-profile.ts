import type { CurrencyCode, TasteProfile, TasteTrait, TasteTraitKind } from "@vadevi/contracts";

/**
 * A reader's taste from their own records: which kinds of wine they score
 * above their usual, which below, what they reach for, what they pay.
 *
 * Pure, so every rule below is tested without a database. The rules:
 *
 * - A tasting speaks through its score against the reader's own average, so
 *   "high" means high for them. One without a score speaks through what was
 *   said instead — liked or not, would drink again or not — at three quarters
 *   and half of the reader's usual spread.
 * - A trait is said only when three tastings show it, and its effect is drawn
 *   back towards nothing as if two more tastings had sat exactly on the
 *   average: four bottles of Garnacha at +8 read as +5.3, not +8.
 * - Nothing is inferred beyond the records: a trait is a group of the
 *   reader's own tastings, with the wines behind it.
 */

export type TasteNote = Readonly<{
  acidity: number | null;
  body: number | null;
  country: string | null;
  descriptors: readonly { code: string; label: string }[];
  finish: number | null;
  grapes: readonly string[];
  /** The least this wine was bought for, when it was. */
  price: { currency: CurrencyCode; unitMinor: number } | null;
  region: string | null;
  score: number | null;
  sentiment: "dislike" | "like" | "neutral" | null;
  spaceId: string;
  sweetness: number | null;
  tannin: number | null;
  tastedAt: string;
  type: string | null;
  wineId: string;
  wineName: string;
  wouldDrinkAgain: "no" | "unsure" | "yes" | null;
}>;

export type TastePurchase = Readonly<{
  currency: CurrencyCode;
  spaceId: string;
  unitMinor: number;
  wineId: string;
  wineName: string;
}>;

export type TasteCellarWine = Readonly<{
  country: string | null;
  grapes: readonly string[];
  region: string | null;
  spaceId: string;
  type: string | null;
  wineId: string;
  wineName: string;
}>;

const minimumNotes = 3;
/** Tastings the effect is drawn towards the average by. */
const priorWeight = 2;
/** Points from the average a trait must reach to be said. */
const threshold = 2;

function plain(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function level(value: number | null): "high" | "low" | "medium" | null {
  if (value === null) return null;
  return value <= 2 ? "low" : value === 3 ? "medium" : "high";
}

/** A bottle's price band, in whole units of its currency. */
export function priceBand(unitMinor: number): string {
  const whole = unitMinor / 100;
  return whole < 10 ? "under_10" : whole < 20 ? "10_20" : whole < 40 ? "20_40" : "40_plus";
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

type Membership = Readonly<{ key: string; kind: TasteTraitKind; label: string }>;

/** Every group a tasting belongs to. */
function memberships(note: TasteNote): Membership[] {
  const groups: Membership[] = [];
  if (note.type !== null) groups.push({ key: note.type, kind: "type", label: note.type });
  if (note.country !== null) {
    groups.push({ key: note.country, kind: "country", label: note.country });
  }
  if (note.region !== null) groups.push({ key: note.region, kind: "region", label: note.region });
  for (const grape of new Set(note.grapes.map((name) => name.trim()).filter(Boolean))) {
    groups.push({ key: plain(grape), kind: "grape", label: grape });
  }
  for (const descriptor of note.descriptors) {
    groups.push({ key: descriptor.code, kind: "descriptor", label: descriptor.label });
  }
  for (const [kind, value] of [
    ["acidity", note.acidity],
    ["tannin", note.tannin],
    ["body", note.body],
    ["sweetness", note.sweetness],
    ["finish", note.finish],
  ] as const) {
    const named = level(value);
    if (named !== null) groups.push({ key: named, kind, label: named });
  }
  if (note.price !== null) {
    const key = `${note.price.currency}:${priceBand(note.price.unitMinor)}`;
    groups.push({ key, kind: "price", label: key });
  }
  return groups;
}

type Group = {
  key: string;
  kind: TasteTraitKind;
  labels: Map<string, number>;
  notes: number;
  signals: { signal: number; wine: { spaceId: string; wineId: string; wineName: string } }[];
};

function labelOf(group: Group): string {
  return [...group.labels].sort((left, right) => right[1] - left[1])[0]![0];
}

function traitOf(group: Group, direction: "down" | "up"): TasteTrait {
  const sum = group.signals.reduce((total, entry) => total + entry.signal, 0);
  const ordered = [...group.signals].sort((left, right) =>
    direction === "up" ? right.signal - left.signal : left.signal - right.signal,
  );
  const wines: TasteTrait["wines"] = [];
  for (const entry of ordered) {
    if (wines.some((wine) => wine.wineId === entry.wine.wineId)) continue;
    wines.push(entry.wine);
    if (wines.length === 3) break;
  }
  return {
    key: group.key,
    kind: group.kind,
    label: labelOf(group),
    notes: group.signals.length,
    pointsVersusAverage: round(sum / (group.signals.length + priorWeight)),
    wines,
  };
}

function confidenceFor(count: number): TasteProfile["confidence"] {
  if (count < minimumNotes) return "insufficient";
  if (count < 8) return "low";
  if (count < 20) return "medium";
  return "high";
}

export function buildTasteProfile(
  notes: readonly TasteNote[],
  purchases: readonly TastePurchase[],
  cellar: readonly TasteCellarWine[],
  now: Date,
): TasteProfile {
  const scores = notes.flatMap((note) => (note.score === null ? [] : [note.score]));
  const average =
    scores.length === 0 ? null : scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const spread =
    average === null || scores.length < 2
      ? null
      : Math.sqrt(scores.reduce((sum, score) => sum + (score - average) ** 2, 0) / scores.length);
  // A score's distance from the average is the signal; a tasting without
  // one says less, in proportion to how widely the reader usually scores.
  const scale = Math.max(spread ?? 6, 3);
  const signalOf = (note: TasteNote): number | null => {
    if (note.score !== null && average !== null) return note.score - average;
    if (note.sentiment === "like") return 0.75 * scale;
    if (note.sentiment === "dislike") return -0.75 * scale;
    if (note.wouldDrinkAgain === "yes") return 0.5 * scale;
    if (note.wouldDrinkAgain === "no") return -0.5 * scale;
    return null;
  };

  const groups = new Map<string, Group>();
  let speaking = 0;
  for (const note of notes) {
    const signal = signalOf(note);
    if (signal !== null) speaking += 1;
    for (const member of memberships(note)) {
      const id = `${member.kind}:${member.key}`;
      const group = groups.get(id) ?? {
        key: member.key,
        kind: member.kind,
        labels: new Map<string, number>(),
        notes: 0,
        signals: [],
      };
      group.notes += 1;
      group.labels.set(member.label, (group.labels.get(member.label) ?? 0) + 1);
      if (signal !== null) {
        group.signals.push({
          signal,
          wine: { spaceId: note.spaceId, wineId: note.wineId, wineName: note.wineName },
        });
      }
      groups.set(id, group);
    }
  }

  const confidence = confidenceFor(speaking);
  const sayable = confidence === "insufficient" ? [] : [...groups.values()];
  const traits = sayable
    .filter((group) => group.signals.length >= minimumNotes)
    .map((group) => {
      const sum = group.signals.reduce((total, entry) => total + entry.signal, 0);
      return { group, effect: sum / (group.signals.length + priorWeight) };
    });
  // Strength is the effect weighed by how much stands behind it.
  const strength = (entry: { effect: number; group: Group }) =>
    Math.abs(entry.effect) * Math.sqrt(entry.group.signals.length);
  const likes = traits
    .filter((entry) => entry.effect >= threshold)
    .sort((left, right) => strength(right) - strength(left))
    .slice(0, 8)
    .map((entry) => traitOf(entry.group, "up"));
  const dislikes = traits
    .filter((entry) => entry.effect <= -threshold)
    .sort((left, right) => strength(right) - strength(left))
    .slice(0, 6)
    .map((entry) => traitOf(entry.group, "down"));

  // What they reach for, by the kinds a wine is chosen by.
  const habitKinds: TasteTraitKind[] = ["type", "country", "region", "grape"];
  const mostTasted = habitKinds.flatMap((kind) =>
    [...groups.values()]
      .filter((group) => group.kind === kind && group.notes >= 2)
      .sort(
        (left, right) => right.notes - left.notes || labelOf(left).localeCompare(labelOf(right)),
      )
      .slice(0, 3)
      .map((group) => ({
        key: group.key,
        kind,
        label: labelOf(group),
        notes: group.notes,
        share: Math.min(1, Math.round((group.notes / notes.length) * 100) / 100),
      })),
  );
  // Among what they reach for most, what they score below their usual.
  const reachedFor = new Set(mostTasted.map((entry) => `${entry.kind}:${entry.key}`));
  const tensions = dislikes.filter((trait) => reachedFor.has(`${trait.kind}:${trait.key}`));

  const pricesByCurrency = new Map<CurrencyCode, number[]>();
  for (const purchase of purchases) {
    const list = pricesByCurrency.get(purchase.currency) ?? [];
    list.push(purchase.unitMinor);
    pricesByCurrency.set(purchase.currency, list);
  }
  const prices = [...pricesByCurrency]
    .map(([currency, values]) => ({
      currency,
      medianUnitMinor: median(values),
      purchases: values.length,
    }))
    .sort((left, right) => right.purchases - left.purchases);

  const purchasesByWine = new Map<string, { count: number; purchase: TastePurchase }>();
  for (const purchase of purchases) {
    const entry = purchasesByWine.get(purchase.wineId) ?? { count: 0, purchase };
    entry.count += 1;
    purchasesByWine.set(purchase.wineId, entry);
  }
  const rebought = [...purchasesByWine.values()]
    .filter((entry) => entry.count >= 2)
    .sort((left, right) => right.count - left.count)
    .slice(0, 5)
    .map((entry) => ({
      purchases: entry.count,
      spaceId: entry.purchase.spaceId,
      wineId: entry.purchase.wineId,
      wineName: entry.purchase.wineName,
    }));
  const bestScore = new Map<string, number>();
  for (const note of notes) {
    if (note.score === null) continue;
    bestScore.set(note.wineId, Math.max(bestScore.get(note.wineId) ?? 0, note.score));
  }
  const boughtNotLiked =
    average === null
      ? []
      : [...purchasesByWine.values()]
          .flatMap((entry) => {
            const score = bestScore.get(entry.purchase.wineId);
            return score === undefined || score > average - Math.max(spread ?? 0, 5)
              ? []
              : [
                  {
                    score,
                    spaceId: entry.purchase.spaceId,
                    wineId: entry.purchase.wineId,
                    wineName: entry.purchase.wineName,
                  },
                ];
          })
          .sort((left, right) => left.score - right.score)
          .slice(0, 5);

  // The last twelve months against the time before, when each has five.
  const yearAgo = now.getTime() - 365 * 24 * 60 * 60 * 1_000;
  const recent = notes.filter((note) => Date.parse(note.tastedAt) >= yearAgo);
  const earlier = notes.filter((note) => Date.parse(note.tastedAt) < yearAgo);
  const meanOf = (list: readonly TasteNote[]) => {
    const values = list.flatMap((note) => (note.score === null ? [] : [note.score]));
    return values.length === 0
      ? null
      : round(values.reduce((sum, score) => sum + score, 0) / values.length);
  };
  const shareOf = (list: readonly TasteNote[], kind: "country" | "type") => {
    const counts = new Map<string, number>();
    for (const note of list) {
      const value = note[kind];
      if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return counts;
  };
  const evolution =
    recent.length < 5 || earlier.length < 5
      ? null
      : {
          earlierAverage: meanOf(earlier),
          earlierNotes: earlier.length,
          recentAverage: meanOf(recent),
          recentNotes: recent.length,
          shifts: (["type", "country"] as const)
            .flatMap((kind) => {
              const before = shareOf(earlier, kind);
              const after = shareOf(recent, kind);
              return [...new Set([...before.keys(), ...after.keys()])].map((key) => ({
                earlierShare: Math.round(((before.get(key) ?? 0) / earlier.length) * 100) / 100,
                key,
                kind,
                label: key,
                recentShare: Math.round(((after.get(key) ?? 0) / recent.length) * 100) / 100,
              }));
            })
            .filter((shift) => Math.abs(shift.recentShare - shift.earlierShare) >= 0.15)
            .sort(
              (left, right) =>
                Math.abs(right.recentShare - right.earlierShare) -
                Math.abs(left.recentShare - left.earlierShare),
            )
            .slice(0, 3),
        };

  // Bottles waiting in the cellar that share what they like most.
  const wanted = likes.filter((trait) => habitKinds.includes(trait.kind));
  const inCellar = cellar
    .map((wine) => {
      const own: Membership[] = [
        ...(wine.type === null
          ? []
          : [{ key: wine.type, kind: "type" as const, label: wine.type }]),
        ...(wine.country === null
          ? []
          : [{ key: wine.country, kind: "country" as const, label: wine.country }]),
        ...(wine.region === null
          ? []
          : [{ key: wine.region, kind: "region" as const, label: wine.region }]),
        ...wine.grapes.map((grape) => ({
          key: plain(grape),
          kind: "grape" as const,
          label: grape,
        })),
      ];
      const matches = wanted
        .filter((trait) =>
          own.some((member) => member.kind === trait.kind && member.key === trait.key),
        )
        .map((trait) => ({ key: trait.key, kind: trait.kind, label: trait.label }));
      return {
        matches,
        spaceId: wine.spaceId,
        wineId: wine.wineId,
        wineName: wine.wineName,
      };
    })
    .filter((wine) => wine.matches.length > 0)
    .sort((left, right) => right.matches.length - left.matches.length)
    .filter((wine, index, all) => all.findIndex((other) => other.wineId === wine.wineId) === index)
    .slice(0, 5);

  return {
    averageScore: average === null ? null : round(average),
    confidence,
    dislikes,
    evolution,
    habits: { boughtNotLiked, mostTasted, prices, rebought },
    inCellar,
    likes,
    minimumNotes,
    sampleSize: notes.length,
    scoreSpread: spread === null ? null : round(spread),
    scored: scores.length,
    tensions,
  };
}

/**
 * The profile as plain facts for a writer, with every number they hold: the
 * text written from them may use those numbers and no other.
 */
export function tasteFacts(
  profile: TasteProfile,
  locale: string,
  labels: Readonly<Record<string, string>> = {},
): { facts: string[]; numbers: number[] } {
  const numbers: number[] = [];
  let format: Intl.NumberFormat;
  try {
    format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  } catch {
    format = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
  }
  // Every number as the reader's language writes it ("6,1"), and kept.
  const keep = (value: number) => {
    numbers.push(value, Math.abs(value));
    return format.format(value);
  };
  let countries: Intl.DisplayNames | null = null;
  try {
    countries = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    countries = null;
  }
  // A trait as the reader's language names it, or nothing: a code
  // ("appearance.soft") or an English level ("low sweetness") handed to the
  // writer came back word for word.
  const nameOf = (trait: { key: string; kind: string }): string | null => {
    if (trait.kind === "country") return countries?.of(trait.key) ?? null;
    return labels[`${trait.kind}:${trait.key}`] ?? null;
  };
  const facts: string[] = [];
  if (profile.averageScore !== null) {
    facts.push(
      `their average score is ${keep(profile.averageScore)}, over ${keep(profile.sampleSize)} tastings`,
    );
  }
  for (const trait of profile.likes.slice(0, 4)) {
    const name = nameOf(trait);
    if (name === null) continue;
    facts.push(
      `they score ${name} ${keep(trait.pointsVersusAverage)} points above their own average, over ${keep(trait.notes)} tastings`,
    );
  }
  for (const trait of profile.dislikes.slice(0, 3)) {
    const name = nameOf(trait);
    if (name === null) continue;
    facts.push(
      `they score ${name} ${keep(Math.abs(trait.pointsVersusAverage))} points below their own average, over ${keep(trait.notes)} tastings`,
    );
  }
  for (const entry of profile.habits.mostTasted
    .filter((item) => item.kind !== "region")
    .slice(0, 3)) {
    const name = nameOf(entry);
    if (name === null) continue;
    facts.push(`${name}: ${keep(Math.round(entry.share * 100))}% of their tastings`);
  }
  for (const trait of profile.tensions.slice(0, 2)) {
    const name = nameOf(trait);
    if (name !== null) facts.push(`they drink a lot of ${name} but score it below their average`);
  }
  const price = profile.habits.prices[0];
  if (price !== undefined) {
    const whole = Math.round(price.medianUnitMinor / 100);
    facts.push(`a bottle usually costs them about ${keep(whole)} ${price.currency}`);
  }
  return { facts, numbers };
}
