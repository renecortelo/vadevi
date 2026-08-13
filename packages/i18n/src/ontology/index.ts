export const tastingOntologyVersion = "2026.1" as const;

export type OntologyLocale = "ca" | "de" | "en" | "es" | "fr" | "it" | "nl" | "pt-PT";
export type TastingPhase = "appearance" | "nose" | "palate";

type LocalizedDescriptorText = Record<OntologyLocale, { help: string; label: string }>;

export type TastingDescriptorDefinition = {
  code: string;
  deprecatedVersion?: string;
  family: string;
  introducedVersion: typeof tastingOntologyVersion;
  parentCode?: string;
  phase: TastingPhase;
  sortOrder: number;
  text: LocalizedDescriptorText;
};

export const tastingDescriptors = [
  {
    code: "appearance.bright",
    family: "light",
    introducedVersion: tastingOntologyVersion,
    phase: "appearance",
    sortOrder: 10,
    text: {
      ca: { help: "Reflecteix la llum amb nitidesa.", label: "Brillant" },
      de: { help: "Reflektiert das Licht klar.", label: "Leuchtend" },
      en: { help: "Reflects light with a clear glow.", label: "Bright" },
      es: { help: "Refleja la luz con nitidez.", label: "Brillante" },
      fr: { help: "Reflète nettement la lumière.", label: "Brillant" },
      it: { help: "Riflette la luce con nitidezza.", label: "Brillante" },
      nl: { help: "Weerspiegelt het licht helder.", label: "Helder" },
      "pt-PT": { help: "Reflete a luz com nitidez.", label: "Brilhante" },
    },
  },
  {
    code: "appearance.soft",
    family: "light",
    introducedVersion: tastingOntologyVersion,
    phase: "appearance",
    sortOrder: 20,
    text: {
      ca: { help: "Té una aparença suau i poc reflectant.", label: "Suau" },
      de: { help: "Wirkt weich und wenig reflektierend.", label: "Sanft" },
      en: { help: "Looks gentle and softly reflective.", label: "Soft" },
      es: { help: "Tiene un aspecto suave y poco reflectante.", label: "Suave" },
      fr: { help: "Présente un éclat doux et discret.", label: "Doux" },
      it: { help: "Ha un aspetto morbido e poco riflettente.", label: "Morbido" },
      nl: { help: "Oogt zacht en weinig spiegelend.", label: "Zacht" },
      "pt-PT": { help: "Tem um aspeto suave e pouco refletor.", label: "Suave" },
    },
  },
  {
    code: "appearance.evolving",
    family: "evolution",
    introducedVersion: tastingOntologyVersion,
    phase: "appearance",
    sortOrder: 30,
    text: {
      ca: { help: "Mostra matisos visuals d'evolució.", label: "Evolucionat" },
      de: { help: "Zeigt sichtbare Reifetöne.", label: "Gereift" },
      en: { help: "Shows visible signs of evolution.", label: "Evolving" },
      es: { help: "Muestra matices visuales de evolución.", label: "Evolucionado" },
      fr: { help: "Montre des signes visuels d'évolution.", label: "Évolué" },
      it: { help: "Mostra segni visivi di evoluzione.", label: "Evoluto" },
      nl: { help: "Toont zichtbare rijpingstonen.", label: "Geëvolueerd" },
      "pt-PT": { help: "Mostra sinais visuais de evolução.", label: "Evoluído" },
    },
  },
  {
    code: "fruit.red.cherry",
    family: "fruit",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 100,
    text: {
      ca: { help: "Recorda cirera fresca o madura.", label: "Cirera" },
      de: { help: "Erinnert an frische oder reife Kirsche.", label: "Kirsche" },
      en: { help: "Recalls fresh or ripe cherry.", label: "Cherry" },
      es: { help: "Recuerda a cereza fresca o madura.", label: "Cereza" },
      fr: { help: "Évoque la cerise fraîche ou mûre.", label: "Cerise" },
      it: { help: "Ricorda la ciliegia fresca o matura.", label: "Ciliegia" },
      nl: { help: "Doet denken aan verse of rijpe kers.", label: "Kers" },
      "pt-PT": { help: "Lembra cereja fresca ou madura.", label: "Cereja" },
    },
  },
  {
    code: "fruit.citrus.lemon",
    family: "fruit",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 110,
    text: {
      ca: { help: "Recorda pell, suc o flor de llimona.", label: "Llimona" },
      de: { help: "Erinnert an Zitronenschale, Saft oder Blüte.", label: "Zitrone" },
      en: { help: "Recalls lemon peel, juice, or blossom.", label: "Lemon" },
      es: { help: "Recuerda a piel, zumo o flor de limón.", label: "Limón" },
      fr: { help: "Évoque le zeste, le jus ou la fleur de citron.", label: "Citron" },
      it: { help: "Ricorda scorza, succo o fiore di limone.", label: "Limone" },
      nl: { help: "Doet denken aan citroenschil, sap of bloesem.", label: "Citroen" },
      "pt-PT": { help: "Lembra casca, sumo ou flor de limão.", label: "Limão" },
    },
  },
  {
    code: "floral.violet",
    family: "floral",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 120,
    text: {
      ca: { help: "Evoca una floració fosca i delicada.", label: "Violeta" },
      de: { help: "Wirkt dunkelblumig und fein.", label: "Veilchen" },
      en: { help: "Suggests a delicate, dark floral note.", label: "Violet" },
      es: { help: "Evoca una flor oscura y delicada.", label: "Violeta" },
      fr: { help: "Évoque une fleur sombre et délicate.", label: "Violette" },
      it: { help: "Evoca un fiore scuro e delicato.", label: "Violetta" },
      nl: { help: "Geeft een fijne, donkerbloemige indruk.", label: "Viooltje" },
      "pt-PT": { help: "Evoca uma flor escura e delicada.", label: "Violeta" },
    },
  },
  {
    code: "spice.black_pepper",
    family: "spice",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 130,
    text: {
      ca: { help: "Té una espurna aromàtica de pebre.", label: "Pebre negre" },
      de: { help: "Zeigt eine pfeffrige aromatische Würze.", label: "Schwarzer Pfeffer" },
      en: { help: "Has a peppery aromatic spark.", label: "Black pepper" },
      es: { help: "Tiene una chispa aromática de pimienta.", label: "Pimienta negra" },
      fr: { help: "Présente une étincelle aromatique poivrée.", label: "Poivre noir" },
      it: { help: "Ha una vivace nota aromatica pepata.", label: "Pepe nero" },
      nl: { help: "Heeft een pittige pepertoets.", label: "Zwarte peper" },
      "pt-PT": { help: "Tem um toque aromático apimentado.", label: "Pimenta-preta" },
    },
  },
  {
    code: "production.oak.vanilla",
    family: "production",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 140,
    text: {
      ca: { help: "Recorda la vainilla dolça de la criança.", label: "Vainilla" },
      de: { help: "Erinnert an süße Vanille aus dem Ausbau.", label: "Vanille" },
      en: { help: "Recalls sweet vanilla from maturation.", label: "Vanilla" },
      es: { help: "Recuerda a vainilla dulce de la crianza.", label: "Vainilla" },
      fr: { help: "Évoque la vanille douce de l'élevage.", label: "Vanille" },
      it: { help: "Ricorda la vaniglia dolce dell'affinamento.", label: "Vaniglia" },
      nl: { help: "Doet denken aan zoete vanille van rijping.", label: "Vanille" },
      "pt-PT": { help: "Lembra baunilha doce do estágio.", label: "Baunilha" },
    },
  },
  {
    code: "earth.forest_floor",
    family: "earth",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 150,
    text: {
      ca: { help: "Evoca fulles seques i terra humida.", label: "Sotabosc" },
      de: { help: "Erinnert an trockenes Laub und feuchte Erde.", label: "Waldboden" },
      en: { help: "Recalls dry leaves and damp earth.", label: "Forest floor" },
      es: { help: "Evoca hojas secas y tierra húmeda.", label: "Sotobosque" },
      fr: { help: "Évoque les feuilles sèches et la terre humide.", label: "Sous-bois" },
      it: { help: "Evoca foglie secche e terra umida.", label: "Sottobosco" },
      nl: { help: "Doet denken aan droog blad en vochtige aarde.", label: "Bosgrond" },
      "pt-PT": { help: "Evoca folhas secas e terra húmida.", label: "Vegetação rasteira" },
    },
  },
  {
    code: "palate.juicy",
    family: "shape",
    introducedVersion: tastingOntologyVersion,
    phase: "palate",
    sortOrder: 200,
    text: {
      ca: { help: "La fruita i la frescor fan salivar.", label: "Sucós" },
      de: { help: "Frucht und Frische wirken saftig.", label: "Saftig" },
      en: { help: "Fruit and freshness feel mouthwatering.", label: "Juicy" },
      es: { help: "La fruta y la frescura hacen salivar.", label: "Jugoso" },
      fr: { help: "Le fruit et la fraîcheur font saliver.", label: "Juteux" },
      it: { help: "Frutto e freschezza fanno salivare.", label: "Succoso" },
      nl: { help: "Fruit en frisheid geven een sappig gevoel.", label: "Sappig" },
      "pt-PT": { help: "A fruta e a frescura fazem salivar.", label: "Suculento" },
    },
  },
  {
    code: "palate.mineral",
    family: "shape",
    introducedVersion: tastingOntologyVersion,
    phase: "palate",
    sortOrder: 210,
    text: {
      ca: { help: "Deixa una sensació pedregosa o salina.", label: "Mineral" },
      de: { help: "Hinterlässt einen steinigen oder salzigen Eindruck.", label: "Mineralisch" },
      en: { help: "Leaves a stony or saline impression.", label: "Mineral" },
      es: { help: "Deja una sensación pedregosa o salina.", label: "Mineral" },
      fr: { help: "Laisse une impression pierreuse ou saline.", label: "Minéral" },
      it: { help: "Lascia una sensazione pietrosa o salina.", label: "Minerale" },
      nl: { help: "Geeft een stenige of zilte indruk.", label: "Mineraal" },
      "pt-PT": { help: "Deixa uma sensação pedregosa ou salina.", label: "Mineral" },
    },
  },
  {
    code: "palate.creamy",
    family: "texture",
    introducedVersion: tastingOntologyVersion,
    phase: "palate",
    sortOrder: 220,
    text: {
      ca: { help: "Té una textura envoltant i cremosa.", label: "Cremós" },
      de: { help: "Wirkt umhüllend und cremig.", label: "Cremig" },
      en: { help: "Feels enveloping and creamy.", label: "Creamy" },
      es: { help: "Tiene una textura envolvente y cremosa.", label: "Cremoso" },
      fr: { help: "Offre une texture enveloppante et crémeuse.", label: "Crémeux" },
      it: { help: "Ha una consistenza avvolgente e cremosa.", label: "Cremoso" },
      nl: { help: "Voelt omhullend en romig.", label: "Romig" },
      "pt-PT": { help: "Tem uma textura envolvente e cremosa.", label: "Cremoso" },
    },
  },
  {
    code: "palate.savory",
    family: "flavor",
    introducedVersion: tastingOntologyVersion,
    phase: "palate",
    sortOrder: 230,
    text: {
      ca: { help: "Mostra un costat més salat que dolç.", label: "Saborós" },
      de: { help: "Zeigt eine eher würzige als süße Seite.", label: "Herzhaft" },
      en: { help: "Shows a more savory than sweet side.", label: "Savory" },
      es: { help: "Muestra un lado más salado que dulce.", label: "Sabroso" },
      fr: { help: "Montre un caractère plus salé que doux.", label: "Savoureux" },
      it: { help: "Mostra un lato più sapido che dolce.", label: "Sapido" },
      nl: { help: "Toont een eerder hartige dan zoete kant.", label: "Hartig" },
      "pt-PT": { help: "Mostra um lado mais salgado do que doce.", label: "Saboroso" },
    },
  },
  {
    code: "palate.toasty",
    family: "production",
    introducedVersion: tastingOntologyVersion,
    phase: "palate",
    sortOrder: 240,
    text: {
      ca: { help: "Recorda pa torrat o fruita seca torrada.", label: "Torrat" },
      de: { help: "Erinnert an Toast oder geröstete Nüsse.", label: "Röstig" },
      en: { help: "Recalls toast or roasted nuts.", label: "Toasty" },
      es: { help: "Recuerda a pan o frutos secos tostados.", label: "Tostado" },
      fr: { help: "Évoque le pain grillé ou les fruits secs torréfiés.", label: "Grillé" },
      it: { help: "Ricorda pane o frutta secca tostati.", label: "Tostato" },
      nl: { help: "Doet denken aan toast of geroosterde noten.", label: "Geroosterd" },
      "pt-PT": { help: "Lembra pão ou frutos secos torrados.", label: "Tostado" },
    },
  },
] as const satisfies readonly TastingDescriptorDefinition[];

export function descriptorText(code: string, locale: OntologyLocale) {
  return tastingDescriptors.find((descriptor) => descriptor.code === code)?.text[locale];
}
