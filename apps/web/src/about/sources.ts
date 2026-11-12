/**
 * Where the library's facts, figures, maps and photographs come from, and
 * under what licence — the same list `data/kb/README.md` keeps, gathered for
 * the reader. Names and licences are proper names, never translated; what
 * each gives is said in the reader's language (`sources.what.*`). Each link
 * is the page or file the data was read from.
 */
export type SourceGroup = "climate" | "figures" | "images" | "maps" | "registers" | "texts";

/** Terms that are not a licence's own name, said in the reader's language. */
export type SourceTerms =
  | "commonsEach"
  | "crownFacts"
  | "euReuse"
  | "extract"
  /** A page that is not openly licensed: the fact and its link, never its text. */
  | "factOnly"
  | "officialFacts"
  | "publicDomain"
  | "reuseCiting"
  | "usPublicDomain";

export type Source = {
  /** A credit the source asks for, as it words it. */
  credit?: string;
  group: SourceGroup;
  /** The licence's own name, where it has one. */
  licence?: string;
  name: string;
  terms?: SourceTerms;
  url: string;
  what:
    | "areas"
    | "boundaries"
    | "climate"
    | "elevation"
    | "names"
    | "outlines"
    | "photos"
    | "plantings"
    | "points"
    | "registerNames"
    | "summaries"
    | "traits"
    | "soil"
    | "varieties"
    | "wineries";
};

export const sourceGroups: SourceGroup[] = [
  "texts",
  "registers",
  "figures",
  "climate",
  "maps",
  "images",
];

export const sources: Source[] = [
  {
    group: "texts",
    licence: "CC BY-SA 4.0",
    name: "Wikipedia",
    url: "https://www.wikipedia.org/",
    what: "summaries",
  },
  {
    credit: "Wikivoyage, «Tokaj»",
    group: "texts",
    licence: "CC BY-SA 4.0",
    name: "Wikivoyage",
    url: "https://en.wikivoyage.org/wiki/Tokaj",
    what: "traits",
  },
  {
    group: "texts",
    name: "Wines of Greece (EDOAO), «Varieties»",
    terms: "factOnly",
    url: "https://winesofgreece.org/varieties/",
    what: "traits",
  },
  {
    group: "texts",
    name: "Wines of Germany (Deutsches Weininstitut en el Reino Unido), German grape varieties",
    terms: "factOnly",
    url: "https://winesofgermany.co.uk/grape/dornfelder/",
    what: "traits",
  },
  {
    group: "texts",
    name: "Swiss Wine Promotion, «Wine grapes»",
    terms: "factOnly",
    url: "https://www.swisswine.com/en/swiss-vineyards/wine-grapes",
    what: "traits",
  },
  {
    group: "texts",
    name: "Las guías de uvas de los comerciantes: The Wine Society, Weinfreunde, Vinissimus, Mövenpick Wein, Vinatis, BurdiVino, Martel, House of Townend, Martinez Wines, Baur au Lac Vins, Indigene Wines, Enotria&Coe, Italy Abroad y Tannico (la página de la tienda sobre la uva misma, no la ficha de un vino; cada una enlazada en la ficha de la uva)",
    terms: "factOnly",
    url: "https://www.weinfreunde.de/c/rebsorte/cinsault/",
    what: "traits",
  },
  {
    group: "texts",
    name: "Las páginas de bodegas y rutas del vino sobre una uva, no sobre uno de sus vinos: Quinta da Alameda, Bodegas Monje, Siston Brook Vineyard, Douloufakis, Winemakers of Northern Greece, la Rota de Vinhos da Península de Setúbal, el Instituto de la Vid y el Vino de Pleven, Madeira Wine Company, Taste Trentino (Trentino Marketing), Mezzacorona, Citra y el Consejo Regulador de la D.O. Ribeiro (cada una enlazada en la ficha de la uva)",
    terms: "factOnly",
    url: "https://www.quintadaalameda.com/en/vinho-e-saber/alfrocheiro-grape-variety",
    what: "traits",
  },
  {
    group: "texts",
    name: "Quattrocalici, fichas de vitigni: solo el dato, con su enlace",
    terms: "factOnly",
    url: "https://www.quattrocalici.it/vitigni/ancellotta/",
    what: "traits",
  },
  {
    group: "texts",
    name: "Club de Catas Torrejón, fichas de uvas: solo el dato (maridajes, cuerpo), con su enlace",
    terms: "factOnly",
    url: "https://catastorrejon.eu/uvas-inicio/uvas/",
    what: "traits",
  },
  {
    group: "texts",
    name: "vinograd.info, ampelografía en ruso (permite citar con enlace): solo el dato, con su enlace",
    terms: "factOnly",
    url: "https://vinograd.info/sorta/vinnye/rondo.html",
    what: "traits",
  },
  {
    group: "texts",
    name: "Vinum, léxico de variedades: solo el dato, con su enlace",
    terms: "factOnly",
    url: "https://www.vinum.eu/de/weinwissen/weinlexikon/rebsortenlexikon/m/mavrud/",
    what: "traits",
  },
  {
    group: "texts",
    name: "Paphos Weine, Wein aus Zypern y Bulwine, importadores de vino de Chipre y Bulgaria: solo el dato de sus páginas sobre la uva, con su enlace",
    terms: "factOnly",
    url: "https://www.paphosweine.ch/2021/12/02/xinisteri-guenstige-spitzenweine-aus-zypern/",
    what: "traits",
  },
  {
    group: "texts",
    name: "Cave SA (cavesa.ch) y Mövenpick Wein, tiendas suizas: la uva y el grado de cada vino, con su bodega",
    terms: "factOnly",
    url: "https://www.cavesa.ch/en/geneve-gamaret-pellegrin-2022-1000963",
    what: "traits",
  },
  {
    group: "texts",
    name: "Private Celler e Iberowine, tiendas: la ficha de cada vino, con su bodega (maridaje del txakoli)",
    terms: "factOnly",
    url: "https://www.iberowine.com/wine/txakoli-txomin-etxanix",
    what: "traits",
  },
  {
    group: "texts",
    name: "Olé & Obrigado, importador: la ficha que publica de cada vino que trae, con su bodega",
    terms: "factOnly",
    url: "https://www.oleobrigado.com/wine/2436-macanita-sousao-letra-a",
    what: "traits",
  },
  {
    group: "texts",
    name: "South America Wine Guide (Amanda Barnes): solo el grado y la uva que da de cada vino, contados para el consenso de tres bodegas",
    terms: "factOnly",
    url: "https://southamericawineguide.com/tasting-note/j-bouchon-pais-salvaje/",
    what: "traits",
  },
  {
    group: "texts",
    name: "De Bortoli Wines, guías de la bodega sobre cada uva: solo el dato, con su enlace",
    terms: "factOnly",
    url: "https://www.debortoli.com.au/wine-101/grape-variety/durif",
    what: "traits",
  },
  {
    group: "texts",
    name: "Wineland, academia de uvas de una tienda de vino de Tiflis: solo el dato, con su enlace",
    terms: "factOnly",
    url: "https://wineland.ge/academy/grapes/ojaleshi",
    what: "traits",
  },
  {
    group: "texts",
    name: "Wines of Georgia, directorio de etiquetas: bodega, grado y maridajes de cada vino, contados para el consenso de tres bodegas",
    terms: "factOnly",
    url: "https://www.winesgeorgia.com/grape-variety/tsolikouri/",
    what: "traits",
  },
  {
    group: "texts",
    name: "Wine Paradigm (Pocket Wine), fichas de uvas: solo el nivel que da la ficha (cuerpo, acidez, seco o dulce, aromas), con su enlace",
    terms: "factOnly",
    url: "https://wineparadigm.com/zweigelt/",
    what: "traits",
  },
  {
    group: "texts",
    name: "Tiendas de vino y catálogos de agencias, la descripción de una botella (Vino.com: cuerpo, dosaggio, maridajes; Tocade y Elixirs, en Kork: grado y maridajes): solo el dato, contado como la ficha de ese vino para el consenso de tres bodegas, y para mostrar que las fuentes no coinciden",
    terms: "factOnly",
    url: "https://www.vino.com/dettaglio/marche-igt-passerina-belisario-2025.html",
    what: "traits",
  },
  {
    group: "texts",
    name: "Great British Wine, páginas de uvas de su guía del vino inglés: solo el dato (acidez de la Ortega), con su enlace",
    terms: "factOnly",
    url: "https://www.greatbritishwine.com/grapevariety/ortega",
    what: "traits",
  },
  {
    group: "texts",
    name: "Tiendas de vino, la ficha de una botella (WirWinzer, The Wine Society, Grape Britannia): solo el dato de ese vino, para el consenso de tres bodegas",
    terms: "factOnly",
    url: "https://wirwinzer.de/rebsorten/ortega",
    what: "traits",
  },
  {
    group: "texts",
    name: "Vine&Wine, perfiles de variedades: solo el nivel que marca (acidez, taninos, alcohol moderado), con su enlace; nunca su texto",
    terms: "factOnly",
    url: "https://vineandwine.vin/en/wine/wine-varieties/nerello-mascalese/",
    what: "traits",
  },
  {
    group: "texts",
    name: "Enotria&Coe, páginas de uvas: solo el dato (acidez del Nerello Mascalese), con su enlace",
    terms: "factOnly",
    url: "https://www.enotriacoe.com/wine/grapes/nerello-mascalese",
    what: "traits",
  },
  {
    group: "texts",
    name: "Grand Cru Wijnen, tienda: páginas de uvas (acidez del Teroldego, seco y dulce del Gros Manseng) y fichas de vinos con su bodega: solo el dato, con su enlace",
    terms: "factOnly",
    url: "https://www.grandcruwijnen.nl/en/wines/druif/teroldego",
    what: "traits",
  },
  {
    group: "texts",
    name: "AIS Lombardia (Associazione Italiana Sommelier), revista ViniPlus: artículos sobre una uva (cada uno enlazado en la ficha de la uva)",
    terms: "factOnly",
    url: "https://www.aislombardia.it/media2/libreria/allegati/ViniPlus24_specialeVitigni_Croatina.pdf",
    what: "traits",
  },
  {
    group: "texts",
    name: "Institut d'Estudis Catalans, Dossiers Agraris: «Descripció del tast de vins elaborats amb la varietat sumoll»",
    terms: "factOnly",
    url: "https://revistes.iec.cat/index.php/DA/article/view/78875",
    what: "traits",
  },
  {
    group: "texts",
    name: "Vine to Wine Circle, fichas de variedades de la península ibérica (cada una enlazada en la ficha de la uva)",
    terms: "factOnly",
    url: "https://www.vinetowinecircle.com/en/castas_post/baga-3/",
    what: "traits",
  },
  {
    group: "texts",
    name: "Ministero dell'agricoltura (MASAF), Registro nazionale delle varietà di vite: fichas de variedades",
    terms: "factOnly",
    url: "http://catalogoviti.politicheagricole.it/scheda.php?codice=285",
    what: "traits",
  },
  {
    group: "texts",
    name: "Las fichas técnicas de las propias bodegas, por ejemplo Feudi del Pisciotto (un dato de una uva solo cuando tres bodegas o más dicen lo mismo de su vino de esa uva; el alcohol, de la cifra de cada ficha pasada a nivel con la escala del WSET; seco o dulce, del azúcar residual de cada ficha con los términos de etiquetado de la UE; cada una enlazada en la ficha de la uva)",
    terms: "factOnly",
    url: "https://www.castellare.it/wp-content/uploads/2025/04/Feudi-del-Pisciotto_Grillo_Colori-di-Sicilia_ita.pdf",
    what: "traits",
  },
  {
    group: "texts",
    name: "Comissão Vitivinícola Regional Alentejana (Vinhos do Alentejo), catálogo de vinos: solo las cifras de la ficha que cada bodega publica (uva, azúcar, grado), un vino por bodega y un dato de la uva solo cuando tres bodegas o más y dos tercios de ellas coinciden",
    terms: "factOnly",
    url: "https://www.vinhosdoalentejo.pt/en/wines/wine-search/",
    what: "traits",
  },
  {
    group: "texts",
    name: "Comissão Vitivinícola Regional do Tejo (Vinhos do Tejo), fichas de sus vinos y notas de prensa: solo las cifras que da de cada bodega, con la misma regla de tres bodegas",
    terms: "factOnly",
    url: "https://www.cvrtejo.pt/media/vinhos-do-tejo-brindam-a-rentree-com-6-monocastas-de-fernao-pires",
    what: "traits",
  },
  {
    group: "texts",
    name: "Rota da Bairrada, fichas técnicas que publica de sus bodegas socias: solo las cifras, con la misma regla de tres bodegas",
    terms: "factOnly",
    url: "https://www.rotadabairrada.pt/",
    what: "traits",
  },
  {
    group: "texts",
    name: "Wines from Spain (ICEX), catálogo de su cata anual en Bottlebooks: solo las cifras de cada vino (uva, grado, azúcar residual), nunca notas ni precios; un vino por bodega y la misma regla de tres bodegas",
    terms: "factOnly",
    url: "https://wfs.bottlebooks.me/products/",
    what: "traits",
  },
  {
    group: "texts",
    name: "Associazione Più Freisa, fichas de los vinos de sus productores socios: solo el dato (los platos que cada bodega propone para su Freisa), con la regla de tres bodegas",
    terms: "factOnly",
    url: "https://www.piufreisa.it/cantine.asp",
    what: "traits",
  },
  {
    group: "texts",
    name: "Casa do Vinho de Almeirim, catálogo de los vinos de sus bodegas: solo el dato (los platos que cada bodega propone), con la regla de tres bodegas",
    terms: "factOnly",
    url: "https://casadovinhodealmeirim.pt/catalogo",
    what: "traits",
  },
  {
    group: "texts",
    name: "Comissão Vitivinícola Regional da Península de Setúbal, «Castas»: solo el dato (aromas del Castelão), con su enlace",
    terms: "factOnly",
    url: "https://vinhosdapeninsuladesetubal.org/vinhos/castas/",
    what: "traits",
  },
  {
    group: "texts",
    name: "Ministerio de Agricultura, Pesca y Alimentación, exposición «La vid»: fichas de variedades (copia del Internet Archive)",
    terms: "reuseCiting",
    url: "https://web.archive.org/web/2023/https://www.mapa.gob.es/ministerio/pags/exposiciones/vid/www/imagenes/pdf/GODELLO.pdf",
    what: "traits",
  },
  {
    group: "texts",
    name: "Ministerio de Agricultura, Pesca y Alimentación, pliegos de condiciones de DOP",
    terms: "reuseCiting",
    url: "https://www.mapa.gob.es/es/alimentacion/temas/calidad-diferenciada/valdeorras_2024_12_04_tcm30-210717.pdf",
    what: "traits",
  },
  {
    group: "texts",
    name: "P. Viala, V. Vermorel, «Ampélographie» (Internet Archive)",
    terms: "publicDomain",
    url: "https://archive.org/details/traitegeneralvol02unse",
    what: "traits",
  },
  {
    group: "texts",
    name: "P. P. Demaria, C. Leardi, «Ampelografia della provincia di Alessandria», 1875 (Internet Archive)",
    terms: "publicDomain",
    url: "https://archive.org/details/ampelografiadel00leargoog",
    what: "traits",
  },
  {
    group: "texts",
    name: "J. Guyot, «Étude des vignobles de France», 2nd ed., 1876 (Internet Archive)",
    terms: "publicDomain",
    url: "https://archive.org/details/bwb_Y0-BSE-098_1",
    what: "traits",
  },
  {
    credit: "M. Kreidlmayer (2026), «Wines of Fire and Earth», Ecocycles 11(3)",
    group: "texts",
    licence: "CC BY 4.0",
    name: "Ecocycles · European Ecocycles Society",
    url: "https://doi.org/10.19040/ecocycles.v11i3.648",
    what: "traits",
  },
  {
    credit: "Plantevin et al. (2024), Frontiers in Plant Science 15:1439114",
    group: "texts",
    licence: "CC BY 4.0",
    name: "Frontiers in Plant Science · Frontiers Media",
    url: "https://doi.org/10.3389/fpls.2024.1439114",
    what: "traits",
  },
  {
    credit:
      "Ibn Amor et al. (2025), Insects 16:497 · Cisterna-Castillo et al. (2024), Foods 13:3065 · Thomaz et al. (2022), Antioxidants 11:859 · Valcárcel-Muñoz et al. (2023), Foods 12:1911 · Filimon et al. (2026), Foods 15:321 · Sarais et al. (2025), Foods 14:2290 · Damiano et al. (2022), Horticulturae 8:829",
    group: "texts",
    licence: "CC BY 4.0",
    name: "MDPI open-access articles",
    url: "https://europepmc.org/",
    what: "traits",
  },
  {
    group: "texts",
    name: "University of California, «Report of the viticultural work» 1885–1896 (Internet Archive)",
    terms: "publicDomain",
    url: "https://archive.org/details/reportofviticult8793cali",
    what: "traits",
  },
  {
    group: "texts",
    licence: "CC0 1.0",
    name: "Wikidata",
    url: "https://www.wikidata.org/",
    what: "names",
  },
  {
    group: "texts",
    licence: "CC0 1.0",
    name: "Wikidata",
    url: "https://www.wikidata.org/wiki/Q156362",
    what: "wineries",
  },
  {
    group: "texts",
    credit: "© OpenStreetMap contributors",
    licence: "ODbL 1.0",
    name: "OpenStreetMap",
    url: "https://www.openstreetmap.org/copyright",
    what: "wineries",
  },
  {
    group: "registers",
    credit: "© European Union",
    terms: "euReuse",
    name: "eAmbrosia",
    url: "https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/",
    what: "registerNames",
  },
  {
    group: "registers",
    licence: "Open Government Licence v3.0",
    name: "UK register of protected food and drink names (GOV.UK)",
    url: "https://www.gov.uk/protected-food-drink-names",
    what: "registerNames",
  },
  {
    group: "registers",
    terms: "usPublicDomain",
    name: "27 CFR part 9 (eCFR) · Federal Register (govinfo.gov)",
    url: "https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-9",
    what: "registerNames",
  },
  {
    group: "registers",
    credit: "© Wine Australia",
    licence: "CC BY 4.0",
    name: "Wine Australia",
    url: "https://www.wineaustralia.com/",
    what: "registerNames",
  },
  {
    group: "registers",
    credit: "Crown copyright",
    terms: "crownFacts",
    name: "IPONZ",
    url: "https://www.iponz.govt.nz/",
    what: "registerNames",
  },
  {
    group: "registers",
    terms: "officialFacts",
    name: "Wine of Origin · SAWIS",
    url: "https://www.sawis.co.za/",
    what: "registerNames",
  },
  {
    group: "registers",
    terms: "officialFacts",
    name: "Instituto Nacional de Vitivinicultura",
    url: "https://www.argentina.gob.ar/sites/default/files/i.g._y_d.o.c._de_la_republica_argentina_1.pdf",
    what: "registerNames",
  },
  {
    group: "registers",
    terms: "officialFacts",
    name: "Decreto 464 de 1994 (Ley Chile)",
    url: "https://www.bcn.cl/leychile/navegar?idNorma=13601",
    what: "registerNames",
  },
  {
    group: "registers",
    terms: "officialFacts",
    name: "Instituto Nacional da Propriedade Industrial",
    url: "https://www.gov.br/inpi/pt-br/servicos/indicacoes-geograficas",
    what: "registerNames",
  },
  {
    group: "registers",
    terms: "officialFacts",
    name: "IMPI · Diario Oficial de la Federación",
    url: "https://sidof.segob.gob.mx/notas/docFuente/5751385",
    what: "registerNames",
  },
  {
    group: "registers",
    terms: "officialFacts",
    name: "OFAG / BLW",
    url: "https://www.blw.admin.ch/",
    what: "registerNames",
  },
  {
    group: "registers",
    terms: "officialFacts",
    name: "VQA Ontario (e-Laws, O. Reg. 406/00; © King's Printer for Ontario, 2000; la descripción de cada zona, copiada tal cual, no es una versión oficial) · BC Laws",
    url: "https://www.ontario.ca/laws/regulation/000406",
    what: "registerNames",
  },
  {
    group: "registers",
    terms: "officialFacts",
    name: "国税庁 · National Tax Agency",
    url: "https://www.nta.go.jp/english/taxes/liquor_administration/geographical/02.htm",
    what: "registerNames",
  },
  {
    group: "registers",
    terms: "officialFacts",
    name: "Sakpatenti · AGEPI",
    url: "https://www.sakpatenti.gov.ge/en/state_registry/",
    what: "registerNames",
  },
  {
    group: "registers",
    terms: "officialFacts",
    name: "Genève RSG M 2 50.05 · Vaud RSV 916.125.2 · Fribourg RSF 912.4.111",
    url: "https://silgeneve.ch/legis/data/rsg_m2_50p05.htm",
    what: "varieties",
  },
  {
    group: "figures",
    terms: "factOnly",
    name: "Los consorcios y consejos reguladores de cada denominación, por ejemplo el Consorzio di Tutela del Roero (solo donde ninguna fuente oficial da la cifra; cada una enlazada en la ficha)",
    url: "https://www.consorziodelroero.it/en/origins-and-history/",
    what: "areas",
  },
  {
    group: "registers",
    terms: "factOnly",
    name: "Wine Growers British Columbia, VQA Ontario, Wines of South Africa, Wine Australia y New Zealand Winegrowers: las uvas de sus regiones, los viñedos en acres de Columbia Británica y Niagara y la vendimia de 2026 de las regiones de Nueva Zelanda en toneladas de uva (solo donde ninguna otra fuente los da; cada una enlazada en la ficha)",
    url: "https://winebc.com/wine-regions/",
    what: "varieties",
  },
  {
    group: "figures",
    terms: "reuseCiting",
    name: "Ministerio de Agricultura, Pesca y Alimentación",
    url: "https://www.mapa.gob.es/",
    what: "areas",
  },
  {
    group: "figures",
    licence: "Licence Ouverte / Etalab 2.0",
    name: "Douane · DGDDI",
    url: "https://www.douane.gouv.fr/",
    what: "areas",
  },
  {
    group: "figures",
    terms: "reuseCiting",
    name: "Destatis",
    url: "https://www.destatis.de/",
    what: "areas",
  },
  {
    group: "figures",
    credit: "STATISTIK AUSTRIA",
    terms: "extract",
    name: "Statistik Austria",
    url: "https://www.statistik.at/",
    what: "areas",
  },
  {
    credit: "Forrás: KSH",
    group: "figures",
    licence: "CC BY 4.0",
    name: "Központi Statisztikai Hivatal (KSH)",
    url: "https://www.ksh.hu/docs/hun/xftp/idoszaki/szoloultetvenyek/2020/index.html",
    what: "areas",
  },
  {
    credit: "Fonte: ARTEA – Regione Toscana",
    group: "figures",
    licence: "CC BY 4.0",
    name: "ARTEA · dati.toscana.it",
    url: "https://dati.toscana.it/dataset/artea-raccolta-uva-dal-2004",
    what: "areas",
  },
  {
    group: "figures",
    licence: "CC BY 4.0",
    name: "Regione Umbria · dati.regione.umbria.it",
    url: "https://dati.regione.umbria.it/dataset/produzioni_certificate",
    what: "areas",
  },
  {
    group: "figures",
    terms: "officialFacts",
    name: "Bundesamt für Landwirtschaft (BLW) · Office fédéral de l'agriculture (OFAG)",
    url: "https://www.admin.ch/de/newnsb/Wiy4sgpi96CU",
    what: "areas",
  },
  {
    credit: "Source: ABS, Vineyards, Australia, 2014-15 (1329.0.55.002)",
    group: "figures",
    licence: "CC BY 4.0",
    name: "Australian Bureau of Statistics (ABS)",
    url: "https://www.abs.gov.au/AUSSTATS/abs@.nsf/DetailsPage/1329.0.55.0022014-15?OpenDocument",
    what: "areas",
  },
  {
    credit: "Fonte: INE, Estatísticas da Produção Vegetal; municipalities summed",
    group: "figures",
    licence: "CC BY 4.0",
    name: "Instituto Nacional de Estatística (INE) · dados.gov.pt",
    url: "https://dados.gov.pt/datasets/producao-vinicola-declarada-em-vinho-hl-pelos-produtores",
    what: "areas",
  },
  {
    group: "texts",
    name: "Bundessortenamt, Beschreibende Sortenliste Reben 2024",
    terms: "reuseCiting",
    url: "https://www.bundessortenamt.de/bsa/media/Files/BSL/bsl_rebe_2024.pdf",
    what: "traits",
  },
  {
    credit:
      "Candiago, S., et al., A geospatial inventory of regulatory information for wine protected designations of origin in Europe, Scientific Data 9, 2022",
    group: "figures",
    licence: "CC0 1.0",
    name: "Candiago et al., inventory of the EU's wine PDOs",
    url: "https://doi.org/10.1038/s41597-022-01513-0",
    what: "varieties",
  },
  {
    credit:
      "Anderson, K., S. Nelgen and G. Puga, Database of Regional, National and Global Winegrape Bearing Areas by Variety, 2000 to 2023, Wine Economics Research Centre, University of Adelaide, December 2025 (revised March 2026); summed by region and grape",
    group: "figures",
    licence: "CC BY 4.0",
    name: "University of Adelaide · Wine Economics Research Centre",
    url: "https://doi.org/10.25909/32870405.v1",
    what: "plantings",
  },
  {
    group: "figures",
    licence: "CC0 1.0",
    name: "Regione Lombardia · dati.lombardia.it",
    url: "https://www.dati.lombardia.it/Agricoltura/Superfici-rivendicate-per-la-produzione-vini-DOC_D/gp6s-ezv4",
    what: "areas",
  },
  {
    group: "figures",
    licence: "CC BY 4.0",
    name: "Instituto Nacional de Vitivinicultura",
    url: "https://www.argentina.gob.ar/inv",
    what: "areas",
  },
  {
    group: "figures",
    terms: "usPublicDomain",
    name: "Federal Register (govinfo.gov)",
    url: "https://www.govinfo.gov/app/collection/fr",
    what: "areas",
  },
  {
    group: "climate",
    credit: "Karger et al. 2017, 2021",
    licence: "CC0 1.0",
    name: "CHELSA V2.1",
    url: "https://chelsa-climate.org/",
    what: "climate",
  },
  {
    group: "climate",
    licence: "CC BY 4.0",
    name: "Copernicus DEM GLO-90 · Open-Meteo",
    url: "https://open-meteo.com/en/docs/elevation-api",
    what: "elevation",
  },
  {
    credit: "Poggio et al. (2021), SoilGrids 2.0, SOIL 7, 217–240",
    group: "climate",
    licence: "CC BY 4.0",
    name: "ISRIC SoilGrids 2.0",
    url: "https://doi.org/10.5194/soil-7-217-2021",
    what: "soil",
  },
  {
    group: "maps",
    licence: "CC0 1.0",
    name: "UC Davis AVA project",
    url: "https://github.com/UCDavisLibrary/ava",
    what: "boundaries",
  },
  {
    group: "maps",
    credit: "© OpenStreetMap contributors",
    licence: "ODbL 1.0",
    name: "OpenStreetMap (Nominatim)",
    url: "https://www.openstreetmap.org/copyright",
    what: "points",
  },
  {
    group: "maps",
    credit: "© EuroGeographics",
    name: "Eurostat GISCO (NUTS)",
    url: "https://ec.europa.eu/eurostat/web/gisco",
    what: "outlines",
  },
  {
    group: "maps",
    terms: "publicDomain",
    name: "Natural Earth",
    url: "https://www.naturalearthdata.com/",
    what: "outlines",
  },
  {
    group: "images",
    terms: "commonsEach",
    name: "Wikimedia Commons",
    url: "https://commons.wikimedia.org/",
    what: "photos",
  },
  {
    group: "images",
    credit: "© Doris Schneider, Ursula Brühl, JKI",
    licence: "CC BY-SA 4.0",
    name: "VIVC (Julius Kühn-Institut)",
    url: "https://www.vivc.de/",
    what: "photos",
  },
];
