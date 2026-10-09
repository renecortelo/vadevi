import { describe, expect, it } from "vitest";

import {
  buildTasteProfile,
  priceBand,
  type TasteNote,
  tasteFacts,
} from "../src/services/taste-profile";

const now = new Date("2026-10-09T12:00:00Z");

function note(overrides: Partial<TasteNote> & { wineId: string }): TasteNote {
  return {
    acidity: null,
    body: null,
    country: "ES",
    descriptors: [],
    finish: null,
    grapes: [],
    price: null,
    region: null,
    score: null,
    sentiment: null,
    spaceId: "space",
    sweetness: null,
    tannin: null,
    tastedAt: "2026-09-01T12:00:00Z",
    type: "red",
    wineName: overrides.wineId,
    wouldDrinkAgain: null,
    ...overrides,
  };
}

// Four Garnachas the reader loved, four Tempranillos they did not, two Albariños.
const garnachas = [1, 2, 3, 4].map((index) =>
  note({
    acidity: 4,
    grapes: ["Garnacha"],
    price: { currency: "EUR", unitMinor: 1_500 },
    region: "Priorat",
    score: 93,
    wineId: `garnacha-${index}`,
  }),
);
const tempranillos = [1, 2, 3, 4].map((index) =>
  note({ grapes: ["Tempranillo"], region: "Rioja", score: 80, wineId: `tempranillo-${index}` }),
);
const albarinos = [1, 2].map((index) =>
  note({ grapes: ["Albariño"], score: 87, type: "white", wineId: `albarino-${index}` }),
);
const notes = [...garnachas, ...tempranillos, ...albarinos];

describe("a reader's taste", () => {
  it("says nothing below three tastings", () => {
    const profile = buildTasteProfile(notes.slice(0, 2), [], [], now);
    expect(profile.confidence).toBe("insufficient");
    expect(profile.likes).toEqual([]);
    expect(profile.dislikes).toEqual([]);
  });

  it("measures each trait against the reader's own average, drawn back when few", () => {
    const profile = buildTasteProfile(notes, [], [], now);
    expect(profile.averageScore).toBe(86.6);
    expect(profile.confidence).toBe("medium");
    // Four at +6.4 read as +4.3: as if two more had sat on the average.
    expect(profile.likes).toContainEqual(
      expect.objectContaining({ key: "garnacha", kind: "grape", label: "Garnacha", notes: 4 }),
    );
    const garnacha = profile.likes.find((trait) => trait.key === "garnacha")!;
    expect(garnacha.pointsVersusAverage).toBe(4.3);
    expect(garnacha.wines).toHaveLength(3);
    expect(profile.likes).toContainEqual(expect.objectContaining({ key: "high", kind: "acidity" }));
    expect(profile.dislikes).toContainEqual(
      expect.objectContaining({ key: "Rioja", kind: "region", pointsVersusAverage: -4.4 }),
    );
    // Two Albariños are not a taste, and red as a whole is about average.
    expect([...profile.likes, ...profile.dislikes].some((trait) => trait.key === "albarino")).toBe(
      false,
    );
    expect([...profile.likes, ...profile.dislikes].some((trait) => trait.key === "red")).toBe(
      false,
    );
  });

  it("names what the reader reaches for but scores below their usual", () => {
    const profile = buildTasteProfile(notes, [], [], now);
    expect(profile.habits.mostTasted[0]).toEqual({
      key: "red",
      kind: "type",
      label: "red",
      notes: 8,
      share: 0.8,
    });
    expect(profile.tensions).toContainEqual(
      expect.objectContaining({ key: "tempranillo", kind: "grape" }),
    );
  });

  it("hears a tasting without a score through what was said of it", () => {
    const unscored = [1, 2, 3].map((index) =>
      note({ grapes: ["Mencía"], sentiment: "like", wineId: `mencia-${index}` }),
    );
    const profile = buildTasteProfile([...notes, ...unscored], [], [], now);
    expect(profile.likes).toContainEqual(expect.objectContaining({ key: "mencia", notes: 3 }));
  });

  it("reads what the reader buys: what it costs, what is rebought, what disappointed", () => {
    const purchases = [
      {
        currency: "EUR" as const,
        spaceId: "space",
        unitMinor: 1_500,
        wineId: "garnacha-1",
        wineName: "garnacha-1",
      },
      {
        currency: "EUR" as const,
        spaceId: "space",
        unitMinor: 1_700,
        wineId: "garnacha-1",
        wineName: "garnacha-1",
      },
      {
        currency: "EUR" as const,
        spaceId: "space",
        unitMinor: 900,
        wineId: "tempranillo-1",
        wineName: "tempranillo-1",
      },
    ];
    const profile = buildTasteProfile(notes, purchases, [], now);
    expect(profile.habits.prices).toEqual([
      { currency: "EUR", medianUnitMinor: 1_500, purchases: 3 },
    ]);
    expect(profile.habits.rebought).toEqual([
      { purchases: 2, spaceId: "space", wineId: "garnacha-1", wineName: "garnacha-1" },
    ]);
    expect(profile.habits.boughtNotLiked).toEqual([
      { score: 80, spaceId: "space", wineId: "tempranillo-1", wineName: "tempranillo-1" },
    ]);
    // Bought at 10–20 € and scored high: a price band they like.
    expect(priceBand(1_500)).toBe("10_20");
    expect(profile.likes).toContainEqual(
      expect.objectContaining({ key: "EUR:10_20", kind: "price" }),
    );
  });

  it("points to bottles waiting in the cellar that share what the reader likes", () => {
    const cellar = [
      {
        country: "ES",
        grapes: ["Garnacha"],
        region: "Montsant",
        spaceId: "space",
        type: "red",
        wineId: "waiting",
        wineName: "Waiting",
      },
      {
        country: "FR",
        grapes: ["Chardonnay"],
        region: null,
        spaceId: "space",
        type: "white",
        wineId: "other",
        wineName: "Other",
      },
    ];
    const profile = buildTasteProfile(notes, [], cellar, now);
    expect(profile.inCellar).toEqual([
      expect.objectContaining({
        matches: [expect.objectContaining({ key: "garnacha", kind: "grape" })],
        wineId: "waiting",
      }),
    ]);
  });

  it("sets the last twelve months against the time before, when both have enough", () => {
    expect(buildTasteProfile(notes, [], [], now).evolution).toBeNull();
    const before = [1, 2, 3, 4, 5].map((index) =>
      note({ score: 84, tastedAt: "2024-03-01T12:00:00Z", type: "white", wineId: `old-${index}` }),
    );
    const evolution = buildTasteProfile([...notes, ...before], [], [], now).evolution!;
    expect(evolution).toMatchObject({ earlierAverage: 84, earlierNotes: 5, recentNotes: 10 });
    expect(evolution.shifts).toContainEqual(
      expect.objectContaining({ earlierShare: 0, key: "red", recentShare: 0.8 }),
    );
  });

  it("hands a writer plain facts and every number they hold", () => {
    const { facts, numbers } = tasteFacts(buildTasteProfile(notes, [], [], now), "es", {
      "grape:garnacha": "Garnacha",
    });
    // Named as the page names it, numbers as Spanish writes them.
    expect(facts).toContainEqual(
      "they score Garnacha 4,3 points above their own average, over 4 tastings",
    );
    // A trait the page did not name is left out, never sent as a code.
    expect(facts.some((fact) => fact.includes("acidity") || fact.includes("high"))).toBe(false);
    // A country by its name in the reader's language, never its code.
    expect(facts.some((fact) => fact.startsWith("España: 100% of their tastings"))).toBe(true);
    expect(numbers).toEqual(expect.arrayContaining([86.6, 4.3, 4, 100]));
  });
});
