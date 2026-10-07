import { describe, expect, it } from "vitest";

import { registerCategories, registerGrapeName, registerGrapes } from "./register-facts";

// Excerpts of the register's own texts, as Ghostscript and the Publications
// Office give them: one of each format the build reads.

/** A French technical file in the older format (Gigondas). */
const olderTechnicalFile = `
             CATÉGORIES DE PRODUITS DE LA VIGNE
             1. Vin
       2. DESCRIPTION DU OU DES VINS
             Caractéristiques analytiques
             L’appellation « Gigondas » est réservée aux vins tranquilles rouges et rosés.
       5. VARIÉTÉS À RAISINS DE CUVE
       a. Inventaire des principales variétés à raisins de cuve:
       b. Variétés à raisins de cuve figurant dans la liste établie par l'OIV:
         Bourboulenc B
         Counoise N
         Mourvedre N
         Grenache N
       c. Autres variétés
         Clairette B
`;

/** An Italian technical file in the newer format. */
const newerTechnicalFile = `
              CATEGORIE DI PRODOTTI VITICOLI
              1. Vino
              8. Vino frizzante
        3. DESCRIZIONE DEI VINI:
           Rotae Bianco, frizzante con specifica del nome del vitigno
      VITIGNI PRINCIPALI
       * VERDICCHIO BIANCO B. (MAIN)
       * CABERNET SAUVIGNON N. (MAIN)
       ** BOMBINO BIANCO B. (MAIN)
       * NERO D'AVOLA N. (MAIN)
       * AGLIANICO (MAIN)
`;

/** The Journal's spaces after a list number are no-break ones. */
const nbsp = String.fromCharCode(0xa0);

/** The Official Journal, where the register holds no technical file. */
const officialJournal = `
Categories of grapevine products \n 1.\n Wine \n 4.${nbsp.repeat(3)} Description of the wine(s) \n Analytical and organoleptic characteristics
 Main wine grape variety(-ies) \n Alicante Bouschet N - Alicante Henri Bouschet
 Burgund Mare R - Grosser burgunder, Grossburgunder, Blaufrankisch, Kekfrankos
 Cabernet Sauvignon N - Petit Vidure, Bourdeos tinto
 Fetească albă B - Păsărească albă, Poama fetei, Mädchentraube
 7.${nbsp.repeat(3)} Link with the geographical area
`;

describe("the register's single document", () => {
  it("reads the categories by their Annex VII number, in any language", () => {
    expect(registerCategories(olderTechnicalFile)).toEqual([1]);
    expect(registerCategories(newerTechnicalFile)).toEqual([1, 8]);
    // The section that follows, numbered too, is not a category.
    expect(registerCategories(officialJournal)).toEqual([1]);
  });

  it("reads the main varieties as the document names them", () => {
    expect(registerGrapes(olderTechnicalFile)).toEqual([
      "Bourboulenc",
      "Counoise",
      "Mourvedre",
      "Grenache",
    ]);
    expect(registerGrapes(newerTechnicalFile)).toEqual([
      "Verdicchio Bianco",
      "Cabernet Sauvignon",
      "Bombino Bianco",
      "Nero d'Avola",
      "Aglianico",
    ]);
    // The synonyms after the dash are the Journal's, not more varieties.
    expect(registerGrapes(officialJournal)).toEqual([
      "Alicante Bouschet",
      "Burgund Mare",
      "Cabernet Sauvignon",
      "Fetească albă",
    ]);
  });

  it("gives nothing rather than a guess", () => {
    expect(registerCategories("No headings here.")).toEqual([]);
    expect(registerGrapes("No headings here.")).toEqual([]);
  });

  it("cleans a line of the register's own marks and keeps the first name", () => {
    expect(registerGrapeName("06. CABERNET SAUVIGNON")).toBe("Cabernet Sauvignon");
    expect(registerGrapeName("MALVASIA BIANCA DI CANDIA B.")).toBe("Malvasia Bianca di Candia");
    expect(registerGrapeName("Calabrese o Nero d'Avola N")).toBe("Calabrese");
    expect(registerGrapeName("Ryzlink rýnský (syn. Rheinriesling)")).toBe("Ryzlink rýnský");
    expect(registerGrapeName("Garnacha tinta, Garnacha")).toBe("Garnacha tinta");
    expect(registerGrapeName("Pinot Gris Gr")).toBe("Pinot Gris");
    expect(registerGrapeName("Wine with a protected designation of origin 12")).toBeNull();
  });
});
