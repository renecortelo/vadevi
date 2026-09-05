export const tastingOntologyVersion = "2026.1" as const;

export type OntologyLocale = "ca" | "de" | "en" | "es" | "fr" | "it" | "nl" | "pt-PT";
export type TastingPhase = "appearance" | "nose" | "palate";

/**
 * The wine types a descriptor belongs to. Mirrors the WineType contract; the
 * web guards the two against drift with a test, since this package deliberately
 * does not depend on the contracts package.
 */
export type OntologyWineType =
  | "fortified"
  | "orange"
  | "other"
  | "red"
  | "rose"
  | "sparkling"
  | "vermouth_red"
  | "vermouth_white"
  | "white";

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
  /**
   * Which wines this belongs to. Omitted means every wine — brightness and
   * juiciness read the same whatever is in the glass. Naming types keeps a
   * taster from being offered oak on a cava or brioche on a young red.
   */
  wineTypes?: readonly OntologyWineType[];
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
    wineTypes: ["red", "rose"],
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
    wineTypes: ["sparkling", "white"],
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
    wineTypes: ["red"],
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
    wineTypes: ["red"],
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
    wineTypes: ["fortified", "red", "white"],
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
    wineTypes: ["red"],
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
    wineTypes: ["orange", "sparkling", "white"],
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
    wineTypes: ["sparkling", "white"],
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
    wineTypes: ["fortified", "orange", "red"],
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
    wineTypes: ["red", "sparkling", "white"],
  },
  {
    code: "appearance.mousse.persistent",
    family: "light",
    introducedVersion: tastingOntologyVersion,
    phase: "appearance",
    sortOrder: 40,
    text: {
      ca: {
        help: "La bombolla continua pujant molt després de servir.",
        label: "Bombolla persistent",
      },
      de: {
        help: "Die Perlage steigt lange nach dem Einschenken weiter auf.",
        label: "Anhaltende Perlage",
      },
      en: { help: "The bead keeps rising long after the pour.", label: "Persistent mousse" },
      es: {
        help: "La burbuja sigue subiendo mucho después de servir.",
        label: "Burbuja persistente",
      },
      fr: {
        help: "Les bulles continuent de monter longtemps après le service.",
        label: "Mousse persistante",
      },
      it: {
        help: "Il perlage continua a salire a lungo dopo il servizio.",
        label: "Perlage persistente",
      },
      nl: {
        help: "De belletjes blijven lang na het inschenken opstijgen.",
        label: "Aanhoudende mousse",
      },
      "pt-PT": {
        help: "A bolha continua a subir muito depois de servir.",
        label: "Bolha persistente",
      },
    },
    wineTypes: ["sparkling"],
  },
  {
    code: "fruit.black.blackberry",
    family: "fruit",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 110,
    text: {
      ca: { help: "Fruita negra madura d'esbarzer.", label: "Móra" },
      de: { help: "Dunkle, reife Beerenfrucht.", label: "Brombeere" },
      en: { help: "Dark, ripe bramble fruit.", label: "Blackberry" },
      es: { help: "Fruta negra madura de zarza.", label: "Mora" },
      fr: { help: "Fruit noir mûr des ronces.", label: "Mûre" },
      it: { help: "Frutto nero maturo di rovo.", label: "Mora" },
      nl: { help: "Donker, rijp braamfruit.", label: "Braam" },
      "pt-PT": { help: "Fruto preto maduro da silva.", label: "Amora" },
    },
    wineTypes: ["red"],
  },
  {
    code: "fruit.black.plum",
    family: "fruit",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 115,
    text: {
      ca: { help: "Polpa de pruna fosca i carnosa.", label: "Pruna" },
      de: { help: "Weiches, dunkles Pflaumenfleisch.", label: "Pflaume" },
      en: { help: "Soft, dark plum flesh.", label: "Plum" },
      es: { help: "Pulpa de ciruela oscura y carnosa.", label: "Ciruela" },
      fr: { help: "Chair de prune noire et fondante.", label: "Prune" },
      it: { help: "Polpa di prugna scura e morbida.", label: "Prugna" },
      nl: { help: "Zacht, donker pruimenvlees.", label: "Pruim" },
      "pt-PT": { help: "Polpa de ameixa escura e macia.", label: "Ameixa" },
    },
    wineTypes: ["red"],
  },
  {
    code: "spice.clove",
    family: "spice",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 150,
    text: {
      ca: { help: "Espècia càlida de rebosteria, sovint de la bóta.", label: "Clau" },
      de: { help: "Warmes Backgewürz, oft aus dem Holz.", label: "Nelke" },
      en: { help: "Warm baking spice, often from oak.", label: "Clove" },
      es: { help: "Especia cálida de repostería, a menudo de la barrica.", label: "Clavo" },
      fr: { help: "Épice chaude de pâtisserie, souvent issue du bois.", label: "Clou de girofle" },
      it: { help: "Spezia calda da forno, spesso dal legno.", label: "Chiodo di garofano" },
      nl: { help: "Warme bakspecerij, vaak uit het hout.", label: "Kruidnagel" },
      "pt-PT": { help: "Especiaria quente de forno, muitas vezes da madeira.", label: "Cravinho" },
    },
    wineTypes: ["fortified", "red"],
  },
  {
    code: "earth.leather",
    family: "earth",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 180,
    text: {
      ca: { help: "Cuir adobat, senyal d'evolució.", label: "Cuir" },
      de: { help: "Getragenes Leder, ein Reifezeichen.", label: "Leder" },
      en: { help: "Worn leather, a sign of age.", label: "Leather" },
      es: { help: "Cuero curtido, señal de evolución.", label: "Cuero" },
      fr: { help: "Cuir patiné, signe d'évolution.", label: "Cuir" },
      it: { help: "Cuoio vissuto, segno di evoluzione.", label: "Cuoio" },
      nl: { help: "Gedragen leer, een teken van rijping.", label: "Leer" },
      "pt-PT": { help: "Couro curtido, sinal de evolução.", label: "Couro" },
    },
    wineTypes: ["fortified", "red"],
  },
  {
    code: "fruit.citrus.grapefruit",
    family: "fruit",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 120,
    text: {
      ca: { help: "Cítric punxant amb un toc amarg.", label: "Aranja" },
      de: { help: "Scharfe Zitrusnote mit bitterem Rand.", label: "Grapefruit" },
      en: { help: "Sharp citrus with a bitter edge.", label: "Grapefruit" },
      es: { help: "Cítrico punzante con un borde amargo.", label: "Pomelo" },
      fr: { help: "Agrume vif avec une pointe amère.", label: "Pamplemousse" },
      it: { help: "Agrume pungente con bordo amaro.", label: "Pompelmo" },
      nl: { help: "Scherpe citrus met een bittere rand.", label: "Grapefruit" },
      "pt-PT": { help: "Citrino intenso com aresta amarga.", label: "Toranja" },
    },
    wineTypes: ["sparkling", "white"],
  },
  {
    code: "fruit.orchard.green_apple",
    family: "fruit",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 125,
    text: {
      ca: { help: "Fruita d'horta cruixent i àcida.", label: "Poma verda" },
      de: { help: "Knackige, säuerliche Obstfrucht.", label: "Grüner Apfel" },
      en: { help: "Crisp, tart orchard fruit.", label: "Green apple" },
      es: { help: "Fruta de huerta crujiente y ácida.", label: "Manzana verde" },
      fr: { help: "Fruit de verger croquant et acidulé.", label: "Pomme verte" },
      it: { help: "Frutto di frutteto croccante e acidulo.", label: "Mela verde" },
      nl: { help: "Knapper, friszuur boomgaardfruit.", label: "Groene appel" },
      "pt-PT": { help: "Fruta de pomar crocante e ácida.", label: "Maçã verde" },
    },
    wineTypes: ["sparkling", "white"],
  },
  {
    code: "fruit.orchard.pear",
    family: "fruit",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 130,
    text: {
      ca: { help: "Fruita d'horta suau i sucosa.", label: "Pera" },
      de: { help: "Milde, saftige Obstfrucht.", label: "Birne" },
      en: { help: "Gentle, juicy orchard fruit.", label: "Pear" },
      es: { help: "Fruta de huerta suave y jugosa.", label: "Pera" },
      fr: { help: "Fruit de verger doux et juteux.", label: "Poire" },
      it: { help: "Frutto di frutteto delicato e succoso.", label: "Pera" },
      nl: { help: "Zacht, sappig boomgaardfruit.", label: "Peer" },
      "pt-PT": { help: "Fruta de pomar suave e sumarenta.", label: "Pera" },
    },
    wineTypes: ["sparkling", "white"],
  },
  {
    code: "fruit.stone.peach",
    family: "fruit",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 135,
    text: {
      ca: { help: "Fruita de pinyol madura, suau i perfumada.", label: "Préssec" },
      de: { help: "Reife Steinfrucht, weich und duftig.", label: "Pfirsich" },
      en: { help: "Ripe stone fruit, soft and sweet-scented.", label: "Peach" },
      es: { help: "Fruta de hueso madura, suave y perfumada.", label: "Melocotón" },
      fr: { help: "Fruit à noyau mûr, tendre et parfumé.", label: "Pêche" },
      it: { help: "Frutto a nocciolo maturo, morbido e profumato.", label: "Pesca" },
      nl: { help: "Rijpe steenvrucht, zacht en geurig.", label: "Perzik" },
      "pt-PT": { help: "Fruta de caroço madura, macia e perfumada.", label: "Pêssego" },
    },
    wineTypes: ["orange", "white"],
  },
  {
    code: "floral.white_flower",
    family: "floral",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 140,
    text: {
      ca: { help: "Acàcia, arç blanc, tarongina.", label: "Flors blanques" },
      de: { help: "Akazie, Weißdorn, Orangenblüte.", label: "Weiße Blüten" },
      en: { help: "Acacia, hawthorn, orange blossom.", label: "White flowers" },
      es: { help: "Acacia, espino blanco, azahar.", label: "Flores blancas" },
      fr: { help: "Acacia, aubépine, fleur d'oranger.", label: "Fleurs blanches" },
      it: { help: "Acacia, biancospino, zagara.", label: "Fiori bianchi" },
      nl: { help: "Acacia, meidoorn, oranjebloesem.", label: "Witte bloemen" },
      "pt-PT": { help: "Acácia, espinheiro-alvar, flor de laranjeira.", label: "Flores brancas" },
    },
    wineTypes: ["sparkling", "white"],
  },
  {
    code: "mineral.flint",
    family: "mineral",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 145,
    text: {
      ca: { help: "Pedra picada, fumada i freda.", label: "Pedra foguera" },
      de: { help: "Angeschlagener Stein, rauchig und kühl.", label: "Feuerstein" },
      en: { help: "Struck stone, smoky and cool.", label: "Flint" },
      es: { help: "Piedra golpeada, ahumada y fría.", label: "Pedernal" },
      fr: { help: "Pierre frottée, fumée et froide.", label: "Pierre à fusil" },
      it: { help: "Pietra sfregata, affumicata e fredda.", label: "Pietra focaia" },
      nl: { help: "Geslagen steen, rokerig en koel.", label: "Vuursteen" },
      "pt-PT": { help: "Pedra ferida, fumada e fria.", label: "Pederneira" },
    },
    wineTypes: ["sparkling", "white"],
  },
  {
    code: "production.autolysis.brioche",
    family: "production",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 190,
    text: {
      ca: { help: "Calidesa de forn per la criança sobre mares.", label: "Brioix" },
      de: { help: "Backstubenwärme aus dem Hefelager.", label: "Brioche" },
      en: { help: "Bakery warmth from time on the lees.", label: "Brioche" },
      es: { help: "Calidez de panadería por la crianza sobre lías.", label: "Brioche" },
      fr: { help: "Chaleur boulangère issue du temps sur lies.", label: "Brioche" },
      it: { help: "Calore da forno dovuto alla sosta sui lieviti.", label: "Brioche" },
      nl: { help: "Bakkerswarmte door rijping op de gist.", label: "Brioche" },
      "pt-PT": { help: "Calor de padaria pelo estágio sobre borras.", label: "Brioche" },
    },
    wineTypes: ["sparkling"],
  },
  {
    code: "production.autolysis.yeast",
    family: "production",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 195,
    text: {
      ca: { help: "Massa fresca i mares.", label: "Llevat" },
      de: { help: "Frischer Teig und Hefe.", label: "Hefe" },
      en: { help: "Fresh dough and lees.", label: "Yeast" },
      es: { help: "Masa fresca y lías.", label: "Levadura" },
      fr: { help: "Pâte fraîche et lies.", label: "Levure" },
      it: { help: "Impasto fresco e fecce.", label: "Lievito" },
      nl: { help: "Vers deeg en gistdepot.", label: "Gist" },
      "pt-PT": { help: "Massa fresca e borras.", label: "Levedura" },
    },
    wineTypes: ["sparkling"],
  },
  {
    code: "nut.walnut",
    family: "nut",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 200,
    text: {
      ca: { help: "Toc de fruit sec per oxidació.", label: "Nou" },
      de: { help: "Oxidative Nussigkeit.", label: "Walnuss" },
      en: { help: "Oxidative nuttiness.", label: "Walnut" },
      es: { help: "Toque de fruto seco por oxidación.", label: "Nuez" },
      fr: { help: "Note oxydative de fruit sec.", label: "Noix" },
      it: { help: "Sentore ossidativo di frutta secca.", label: "Noce" },
      nl: { help: "Oxidatieve nootachtigheid.", label: "Walnoot" },
      "pt-PT": { help: "Toque oxidativo de fruto seco.", label: "Noz" },
    },
    wineTypes: ["fortified", "orange", "vermouth_red", "vermouth_white"],
  },
  {
    code: "fruit.dried.apricot",
    family: "fruit",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 205,
    text: {
      ca: { help: "Fruita de pinyol concentrada i assecada al sol.", label: "Albercoc sec" },
      de: { help: "Konzentrierte, sonnengetrocknete Steinfrucht.", label: "Getrocknete Aprikose" },
      en: { help: "Concentrated, sun-dried stone fruit.", label: "Dried apricot" },
      es: { help: "Fruta de hueso concentrada y secada al sol.", label: "Orejón" },
      fr: { help: "Fruit à noyau concentré, séché au soleil.", label: "Abricot sec" },
      it: { help: "Frutto a nocciolo concentrato, essiccato al sole.", label: "Albicocca secca" },
      nl: { help: "Geconcentreerde, zongedroogde steenvrucht.", label: "Gedroogde abrikoos" },
      "pt-PT": { help: "Fruta de caroço concentrada, seca ao sol.", label: "Alperce seco" },
    },
    wineTypes: ["fortified", "orange"],
  },
  {
    code: "fruit.dried.raisin",
    family: "fruit",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 210,
    text: {
      ca: { help: "Raïm sec i dolç.", label: "Pansa" },
      de: { help: "Süße, getrocknete Traube.", label: "Rosine" },
      en: { help: "Sweet, dried grape.", label: "Raisin" },
      es: { help: "Uva seca y dulce.", label: "Pasa" },
      fr: { help: "Raisin séché et sucré.", label: "Raisin sec" },
      it: { help: "Uva secca e dolce.", label: "Uvetta" },
      nl: { help: "Zoete, gedroogde druif.", label: "Rozijn" },
      "pt-PT": { help: "Uva seca e doce.", label: "Passa" },
    },
    wineTypes: ["fortified"],
  },
  {
    code: "botanical.wormwood",
    family: "botanical",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 215,
    text: {
      ca: { help: "L'herba amarga que defineix el vermut.", label: "Donzell" },
      de: { help: "Das bittere Kraut, das den Wermut prägt.", label: "Wermutkraut" },
      en: { help: "The bitter herb that defines vermouth.", label: "Wormwood" },
      es: { help: "La hierba amarga que define el vermut.", label: "Ajenjo" },
      fr: { help: "L'herbe amère qui définit le vermouth.", label: "Absinthe" },
      it: { help: "L'erba amara che definisce il vermut.", label: "Assenzio" },
      nl: { help: "Het bittere kruid dat vermout bepaalt.", label: "Alsem" },
      "pt-PT": { help: "A erva amarga que define o vermute.", label: "Absinto" },
    },
    wineTypes: ["vermouth_red", "vermouth_white"],
  },
  {
    code: "citrus.peel.orange",
    family: "botanical",
    introducedVersion: tastingOntologyVersion,
    phase: "nose",
    sortOrder: 220,
    text: {
      ca: { help: "Escorça cítrica seca, una mica amarga.", label: "Pell de taronja" },
      de: { help: "Getrocknete Zitrusschale, leicht bitter.", label: "Orangenschale" },
      en: { help: "Dried citrus zest, faintly bitter.", label: "Orange peel" },
      es: { help: "Corteza cítrica seca, algo amarga.", label: "Piel de naranja" },
      fr: { help: "Écorce d'agrume séchée, légèrement amère.", label: "Zeste d'orange" },
      it: { help: "Buccia di agrume essiccata, un po' amara.", label: "Scorza d'arancia" },
      nl: { help: "Gedroogde citrusschil, licht bitter.", label: "Sinaasappelschil" },
      "pt-PT": { help: "Casca cítrica seca, algo amarga.", label: "Casca de laranja" },
    },
    wineTypes: ["fortified", "vermouth_red", "vermouth_white"],
  },
  {
    code: "palate.grippy",
    family: "palate",
    introducedVersion: tastingOntologyVersion,
    phase: "palate",
    sortOrder: 320,
    text: {
      ca: { help: "Taní que arrapa les genives.", label: "Astringent" },
      de: { help: "Tannin, das am Zahnfleisch zieht.", label: "Griffig" },
      en: { help: "Tannin that grips the gums.", label: "Grippy" },
      es: { help: "Tanino que agarra las encías.", label: "Astringente" },
      fr: { help: "Tanin qui accroche les gencives.", label: "Astringent" },
      it: { help: "Tannino che stringe le gengive.", label: "Astringente" },
      nl: { help: "Tannine die aan het tandvlees trekt.", label: "Stroef" },
      "pt-PT": { help: "Tanino que prende as gengivas.", label: "Adstringente" },
    },
    wineTypes: ["orange", "red"],
  },
  {
    code: "palate.bitter_finish",
    family: "palate",
    introducedVersion: tastingOntologyVersion,
    phase: "palate",
    sortOrder: 325,
    text: {
      ca: { help: "Una amargor neta al final.", label: "Final amarg" },
      de: { help: "Eine klare Bitterkeit zum Schluss.", label: "Bitterer Abgang" },
      en: { help: "A clean bitterness at the end.", label: "Bitter finish" },
      es: { help: "Un amargor limpio al final.", label: "Final amargo" },
      fr: { help: "Une amertume nette en fin de bouche.", label: "Finale amère" },
      it: { help: "Un amaro pulito nel finale.", label: "Finale amaro" },
      nl: { help: "Een schone bitterheid op het eind.", label: "Bittere afdronk" },
      "pt-PT": { help: "Um amargor limpo no final.", label: "Final amargo" },
    },
    wineTypes: ["orange", "vermouth_red", "vermouth_white"],
  },
] as const satisfies readonly TastingDescriptorDefinition[];

export function descriptorText(code: string, locale: OntologyLocale) {
  return tastingDescriptors.find((descriptor) => descriptor.code === code)?.text[locale];
}

/**
 * The descriptors worth offering for a wine of this type, in order.
 *
 * A descriptor with no wine types belongs to every wine; one that names them is
 * offered only there. An unknown type (the wine's kind was never recorded) gets
 * everything, since guessing would hide the very words the taster wants.
 */
export function descriptorsForWineType(
  phase: TastingPhase,
  wineType: OntologyWineType | null,
): readonly TastingDescriptorDefinition[] {
  // The list is `as const`, so an entry without wineTypes has no such property in
  // its literal type; reading it through the declared shape, where it is
  // optional, keeps the check honest without a cast at each call site.
  return (tastingDescriptors as readonly TastingDescriptorDefinition[]).filter(
    (descriptor) =>
      descriptor.phase === phase &&
      (wineType === null ||
        descriptor.wineTypes === undefined ||
        descriptor.wineTypes.includes(wineType)),
  );
}

/** One descriptor definition by its code, for showing something already chosen. */
export function descriptorByCode(code: string): TastingDescriptorDefinition | undefined {
  return (tastingDescriptors as readonly TastingDescriptorDefinition[]).find(
    (descriptor) => descriptor.code === code,
  );
}
