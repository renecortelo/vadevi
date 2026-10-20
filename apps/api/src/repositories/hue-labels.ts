/**
 * The colours a tasting notes (`tasting.hueOption`), each with every name the
 * interface gives it: a tasting keeps the name it was written in, so a wine
 * is found by its colour in any of the eight languages. Kept in step with the
 * catalogues by `scripts/hue-labels.test.ts`.
 */
export const hueLabels: Readonly<Record<string, readonly string[]>> = {
  straw: ["Straw", "Pajizo", "Palla", "Paille", "Strohgelb", "Paglierino", "Strogeel", "Palha"],
  yellow: ["Yellow", "Amarillo", "Groc", "Jaune", "Gelb", "Giallo", "Geel", "Amarelo"],
  gold: ["Gold", "Dorado", "Daurat", "Doré", "Goldgelb", "Dorato", "Goudgeel", "Dourado"],
  amber: ["Amber", "Ámbar", "Ambre", "Ambré", "Bernstein", "Ambra", "Âmbar"],
  copper: ["Copper", "Cobre", "Coure", "Cuivré", "Kupfer", "Ramato", "Koper"],
  pale_pink: [
    "Pale pink",
    "Rosa pálido",
    "Rosa pàl·lid",
    "Rose pâle",
    "Blassrosa",
    "Rosa pallido",
    "Lichtroze",
  ],
  salmon: ["Salmon", "Salmón", "Salmó", "Saumon", "Lachsrosa", "Salmone", "Zalmroze", "Salmão"],
  raspberry: [
    "Raspberry",
    "Frambuesa",
    "Gerd",
    "Framboise",
    "Himbeerrot",
    "Lampone",
    "Framboos",
    "Framboesa",
  ],
  coral: ["Coral", "Corail", "Koralle", "Corallo", "Koraal"],
  purple: ["Purple", "Púrpura", "Porpra", "Pourpre", "Purpur", "Porpora", "Purper"],
  ruby: ["Ruby", "Rubí", "Robí", "Rubis", "Rubinrot", "Rubino", "Robijnrood", "Rubi"],
  garnet: [
    "Garnet",
    "Granate",
    "Granat",
    "Grenat",
    "Granatrot",
    "Granato",
    "Granaatrood",
    "Granada",
  ],
  brick: ["Brick", "Teja", "Teula", "Tuilé", "Ziegelrot", "Mattone", "Baksteenrood", "Telha"],
  tawny: [
    "Tawny",
    "Teja parduzco",
    "Torrat",
    "Fauve",
    "Bräunlich",
    "Aranciato",
    "Roodbruin",
    "Alourado",
  ],
  mahogany: ["Mahogany", "Caoba", "Acajou", "Mahagoni", "Mogano", "Mahonie", "Mogno"],
  brown: ["Brown", "Marrón", "Marró", "Brun", "Braun", "Marrone", "Bruin", "Castanho"],
  orange: ["Orange", "Naranja", "Taronja", "Arancione", "Oranje", "Laranja"],
};
