import { describe, expect, it } from "vitest";

import { tastingSentences } from "../src/repositories/tasting-language";

/**
 * Research on the Mar de Lluna brought the estate's varieties and brands and
 * "perfect for an afternoon glass"; the comparison set the reader's tasting
 * against that. Only what is about the glass may reach it.
 */
describe("the sentences of research that are about the glass", () => {
  it("drops the estate, the brands and when to drink it", () => {
    expect(
      tastingSentences([
        "El Mar de Lluna es un vino producido por Celler Marià Pagés, que cuenta con una variedad de uvas como la Garnacha y el Tempranillo, procedentes de la región de Empordà, en España.",
        "Ha en propiedad: 11 Variedades de uva: Garnacha blanca y tinta, Chardonnay, Moscatel, Tempranillo, Merlot, Cabernet Sauvignon y Cabernet Franc Tipo de vino: blanco, rosado, tinto y dulce Marcas: Serrasagué, Taca Negra, Mar de lluna, Vinya de l'hort y Rosa-T",
        "A red wine produced by Celler Marià Pagés. A blend of Tempranillo and Garnacha from Empordà, Spain.",
        "La gamma mitjana que produïm són: els blancs Vinya de l’Hort i el Mar de Lluna, el rosat Rosa-T i el Mar de Lluna negre, que són perfectes per acompanyar una copa de tarda.",
        "Medalla de oro en el Concours Mondial de Bruxelles. Vino de la Tierra de Castilla, elaborado en Catalunya.",
        "La región de la DO Empordà se caracteriza por una gran variedad de terrenos, mayoritariamente de textura arenosa y pobres en materia orgánica, lo que la hace ideal para la producción de vinos de alta calidad.",
        "Ruixim de Mar es un Vino espumoso. Hecho con Macabeo. Ve las reseñas y los precios de este vino.",
      ]),
    ).toEqual([]);
  });

  it("keeps the nose, the palate, the structure and the dishes", () => {
    expect(
      tastingSentences([
        "Fundada en 1920. En nariz destacan las frutas rojas y la vainilla; en boca es fresco, con taninos suaves.",
        "Ideal con carnes a la brasa y quesos curados.",
        "Fresh and fruity with notes of cherry.",
        "The producer describes it as ripe and full-bodied.",
      ]),
    ).toEqual([
      "En nariz destacan las frutas rojas y la vainilla;",
      "en boca es fresco, con taninos suaves.",
      "Ideal con carnes a la brasa y quesos curados.",
      "Fresh and fruity with notes of cherry.",
      "The producer describes it as ripe and full-bodied.",
    ]);
  });
});
