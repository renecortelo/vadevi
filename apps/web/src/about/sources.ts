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
    | "varieties";
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
    group: "texts",
    name: "P. Viala, V. Vermorel, «Ampélographie» (Internet Archive)",
    terms: "publicDomain",
    url: "https://archive.org/details/traitegeneralvol02unse",
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
    name: "VQA Ontario (e-Laws) · BC Laws",
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
    credit: "Fonte: INE, Estatísticas da Produção Vegetal; municipalities summed",
    group: "figures",
    licence: "CC BY 4.0",
    name: "Instituto Nacional de Estatística (INE) · dados.gov.pt",
    url: "https://dados.gov.pt/datasets/producao-vinicola-declarada-em-vinho-hl-pelos-produtores",
    what: "areas",
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
