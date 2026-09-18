import { describe, expect, it } from "vitest";

import { profileDish } from "../src/adapters/dish-profile";
import { LocalFoodPairingAdapter, pairingStylesFor } from "../src/adapters/local-pairing";

/**
 * The rules are only worth having if they are wrong in public when they are
 * wrong, so these assert the pairings a sommelier would argue about — not that
 * the function returns four things.
 */

const adapter = new LocalFoodPairingAdapter();

function names(dish: string, locale: "en" | "es" = "es"): string[] {
  return pairingStylesFor(profileDish(dish), locale).map((style) => style.name);
}

describe("reading a dish", () => {
  it("reads the same plate through any of the eight languages", () => {
    for (const dish of [
      "salmón salteado",
      "seared salmon",
      "gebratener Lachs",
      "salmone saltato",
    ]) {
      const profile = profileDish(dish);
      expect(profile.protein).toBe("oily_fish");
      expect(profile.richness).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps the loudest claim on an axis rather than averaging it away", () => {
    // Oily fish is rich on its own; cooking it in fat does not make it less so.
    const profile = profileDish("salmón salteado");
    expect(profile.richness).toBe(4);
  });

  it("lets the first protein named own the plate", () => {
    expect(profileDish("salmon with lentils").protein).toBe("oily_fish");
  });

  it("recognises nothing in a dish it has never heard of", () => {
    expect(profileDish("zzyzx à la mode").terms).toHaveLength(0);
  });
});

describe("pairing a dish with styles", () => {
  it("answers seared salmon with sharp whites and no tannin", () => {
    const styles = pairingStylesFor(profileDish("salmón salteado"), "es");
    expect(styles).toHaveLength(4);
    // The point of the rule: tannin turns metallic on fish, so a structured red
    // must not be the first answer to a salmon.
    expect(styles[0]!.name).not.toBe("Full structured red");
    expect(styles.map((style) => style.color)).toContain("white");
    expect(styles[0]!.description).toContain("acidez");
  });

  it("answers roast lamb with a tannic red", () => {
    const top = names("cordero asado")[0]!;
    expect(["Full structured red", "Medium-bodied red"]).toContain(top);
  });

  it("never opens with a dry wine for a dessert", () => {
    const styles = pairingStylesFor(profileDish("tarta de chocolate"), "es");
    expect(styles[0]!.name).toMatch(/Sweet/);
  });

  it("reaches for sweetness against heat rather than tannin", () => {
    const styles = pairingStylesFor(profileDish("curry picante de pollo"), "en");
    expect(styles[0]!.name).not.toBe("Full structured red");
    expect(styles[0]!.description).toContain("sweetness");
  });

  it("offers oysters something saline and sharp, not a red", () => {
    expect(names("ostras").slice(0, 2).join(" ")).not.toContain("red");
  });

  it("names grapes on every style, because that is what finds them in a cellar", () => {
    // `matchCellarToPairing` recognises a style by type, grape or region. A
    // style with no grapes is invisible to it.
    for (const style of pairingStylesFor(profileDish("merluza al vapor"), "es")) {
      expect(style.grapes.length).toBeGreaterThan(0);
      expect(style.matchPercent).toBeGreaterThan(0);
    }
  });

  it("explains itself in the language it was asked in", () => {
    const es = pairingStylesFor(profileDish("salmón salteado"), "es")[0]!;
    const nl = pairingStylesFor(profileDish("salmón salteado"), "nl")[0]!;
    expect(es.description).not.toBe(nl.description);
    expect(nl.description).toContain("zuren");
  });
});

describe("the local pairing port", () => {
  it("answers a dish it understands", async () => {
    const result = await adapter.pair({ dish: "cordero asado", locale: "es" });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.data.provider).toBe("local");
    expect(result.data.styles.length).toBeGreaterThan(0);
  });

  it("declines a dish it does not understand rather than guessing", async () => {
    // A neutral profile would produce a confident answer to a question nobody
    // asked. Reporting nothing lets the caller ask instead.
    const result = await adapter.pair({ dish: "zzyzx", locale: "es" });
    expect(result.status).toBe("unavailable");
  });
});

describe("cooking from outside Europe", () => {
  it("recognises a dish from each of the cuisines it claims to cover", () => {
    for (const dish of [
      "sushi de salmón",
      "pollo teriyaki",
      "pad thai de gambas",
      "pollo tikka masala",
      "hummus con falafel",
      "tagine de cordero",
      "tacos de carnitas",
      "mole poblano",
      "jollof con pollo",
      "brisket ahumado",
    ]) {
      expect(profileDish(dish).terms.length, dish).toBeGreaterThan(0);
    }
  });

  it("holds tannin back when the plate is full of umami", () => {
    // Soy makes tannin taste harder than it is, so teriyaki must not be answered
    // with the tannic red that its chicken alone would have justified.
    expect(profileDish("pollo teriyaki").umami).toBe(true);
    expect(names("pollo teriyaki")[0]).not.toBe("Full structured red");
  });

  it("meets smoke with ripe fruit", () => {
    expect(names("brisket ahumado").slice(0, 2)).toContain("Ripe fruit-forward red");
  });

  it("does not let smoke put tannin on a fish", () => {
    // Smoked salmon is still salmon. Smoke raises the weight, never the grip.
    const top = names("salmón ahumado").slice(0, 3).join(" ");
    expect(top).not.toContain("Full structured red");
    expect(top).not.toContain("Ripe fruit-forward red");
  });

  it("reads a dish whose name is two words", () => {
    // "padthai" as a single token could never match what anyone types.
    expect(profileDish("pad thai de gambas").spicy).toBe(true);
  });

  it("knows carnitas are pork and barbacoa is not", () => {
    expect(profileDish("tacos de carnitas").protein).toBe("white_meat");
    expect(profileDish("tacos de barbacoa").protein).toBe("red_meat");
  });

  it("treats falafel as the chickpea it is", () => {
    // Without a protein these were read as thin air and answered accordingly.
    expect(profileDish("hummus con falafel").protein).toBe("legume");
  });

  it("answers a spicy Thai plate with sweetness rather than tannin", () => {
    expect(names("pad thai de gambas")[0]).toBe("Off-dry aromatic white");
  });
});

describe("dishes named in the eight locales", () => {
  it("knows a regional dish from each language it ships in", () => {
    for (const dish of [
      "fabada asturiana",
      "escalivada",
      "cassoulet",
      "sauerbraten",
      "lasagna",
      "stamppot",
      "bacalhau à brás",
      "fish and chips",
    ]) {
      expect(profileDish(dish).terms.length, dish).toBeGreaterThan(0);
    }
  });

  it("knows the generic words, not only the species", () => {
    // Naming every fish and no word for "fish" left "fish and chips" with no
    // protein at all, and it was answered as if it were thin air.
    expect(profileDish("fish and chips").protein).toBe("lean_fish");
    expect(profileDish("carne asada").protein).toBe("red_meat");
  });

  it("sends a meat lasagne to a medium red, not to a white", () => {
    // Umami reduces the tannin you want; it does not forbid it. Capping it flat
    // sent lasagne and soy-glazed chicken to the same wine, and lasagne wants a
    // Sangiovese.
    expect(names("lasagna")[0]).toBe("Medium-bodied red");
    expect(names("pollo teriyaki")[0]).not.toContain("red");
  });

  it("puts a sour braise where its vinegar belongs", () => {
    expect(profileDish("sauerbraten").acidic).toBe(true);
    expect(profileDish("sauerbraten").protein).toBe("red_meat");
  });

  it("reads the coals in escalivada and calçots", () => {
    // Both arrive off the fire, which is why the Catalan answer is a young red
    // rather than the white the vegetables alone would have suggested.
    expect(profileDish("calçots").smoky).toBe(true);
    expect(names("escalivada")[0]).toContain("red");
  });

  it("does not let carbonara pretend it has tomato in it", () => {
    expect(profileDish("carbonara").acidic).toBe(false);
    expect(profileDish("carbonara").umami).toBe(true);
  });
});
