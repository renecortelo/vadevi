import { z } from "@hono/zod-openapi";

import { SupportedLocaleSchema } from "./session";

/**
 * The wine library: reference knowledge about grapes, the same for every
 * reader, built from open sources with the sentence behind each value.
 */
export const LibraryLevelSchema = z.enum(["low", "medium", "high"]);

export const LibraryEvidenceSchema = z
  .object({
    field: z.string(),
    /**
     * The place whose wine the quote describes, where it is not the variety
     * everywhere — a single-variety DOC's, or the region where nearly all of
     * the grape grows — and its atlas entry, where it is one.
     */
    place: z.string().nullable(),
    placeId: z.string().nullable(),
    /**
     * From a page that is not openly licensed: shown as the value and its
     * link only. Its sentence was checked when the library was built and is
     * not carried (`quote` is empty).
     */
    factOnly: z.boolean(),
    /** Who says it, where the address alone would not name them. */
    publisher: z.string().nullable(),
    /**
     * Taken from the grape's single-variety wines, held only when at least
     * three producers say the same of theirs: those wines, each linked.
     * `producers-abv`: the alcohol each sheet gives as a figure, a level on
     * WSET's scale (low below 11 %, high from 14 %), with each wine's figure.
     */
    basis: z.enum(["producers", "producers-abv"]).nullable(),
    wines: z
      .array(
        z
          .object({
            abv: z.number().optional(),
            producer: z.string(),
            sourceUrl: z.string().url(),
            wine: z.string(),
          })
          .strict(),
      )
      .nullable(),
    quote: z.string(),
    sourceUrl: z.string().url(),
    value: z.string(),
  })
  .strict();

/**
 * A picture, served by the app itself, with what its licence asks to be
 * shown beside it.
 */
export const LibraryImageSchema = z
  .object({
    author: z.string(),
    license: z.string(),
    licenseUrl: z.string().url().nullable(),
    path: z.string().regex(/^library\/[a-z0-9/._-]+$/),
    sourceUrl: z.string().url(),
  })
  .strict();

const SweetnessSchema = z.enum(["dry", "medium", "sweet"]);

export const LibraryGrapeSchema = z
  .object({
    acidity: LibraryLevelSchema.nullable(),
    /** The alcohol its wines typically reach, as its sources state it. */
    alcohol: LibraryLevelSchema.nullable(),
    /** How dry or sweet its wines are: a range where its sources give one. */
    sweetness: z.object({ from: SweetnessSchema, to: SweetnessSchema }).strict().nullable(),
    aromas: z.array(z.string()),
    /** Each aroma's term in the library's vocabulary, in the same order. */
    aromaTerms: z.array(z.string()),
    body: LibraryLevelSchema.nullable(),
    color: z.enum(["white", "red", "pink"]).nullable(),
    evidence: z.array(LibraryEvidenceSchema),
    id: z.string(),
    image: LibraryImageSchema.nullable(),
    name: z.string(),
    originCountryCode: z.string().length(2).nullable(),
    pairings: z.array(z.string()),
    /** Each dish's term in the library's vocabulary, in the same order. */
    pairingTerms: z.array(z.string()),
    regions: z.array(
      z
        .object({
          countryCode: z.string().nullable(),
          name: z.string(),
          // The atlas entry this region is, where it is a registered name.
          regionId: z.string().nullable(),
        })
        .strict(),
    ),
    styles: z.array(z.string()),
    summary: z
      .object({
        license: z.string(),
        locale: z.string(),
        sourceUrl: z.string().url(),
        text: z.string(),
        translated: z.boolean(),
      })
      .strict()
      .nullable(),
    /**
     * What the wine goes with by the application's pairing rules — not by the
     * source. `basis` says how its styles were chosen: named for this grape by
     * the sources the rules cite, or placed by the grape's colour and
     * structure. `groups` keeps each style's dishes apart (a dry and a sweet
     * Riesling do not go with the same things); `families` is all of them,
     * less any the grape's own source already names. Null when neither is
     * known well enough to say.
     */
    suggestedPairings: z
      .object({
        basis: z.enum(["catalogue", "profile"]),
        families: z.array(z.string()),
        groups: z.array(
          z
            .object({
              basis: z.enum(["catalogue", "profile"]),
              families: z.array(z.string()),
              style: z.string(),
            })
            .strict(),
        ),
        styles: z.array(z.string()),
      })
      .strict()
      .nullable(),
    synonyms: z.array(z.string()),
    tannin: LibraryLevelSchema.nullable(),
    wikidataId: z.string(),
  })
  .strict()
  .openapi("LibraryGrape");

export const LibraryGrapeResponseSchema = z
  .object({ data: LibraryGrapeSchema })
  .strict()
  .openapi("LibraryGrapeResponse");

export const LibraryGrapeQuerySchema = z
  .object({ locale: SupportedLocaleSchema.default("en") })
  .strict();

/** By name; without one, every grape — the library's list. */
export const LibrarySearchQuerySchema = z
  .object({
    /** Only the grapes whose aromas include this library term ("raspberry"). */
    aroma: z.string().trim().min(2).max(60).optional(),
    locale: SupportedLocaleSchema.default("en"),
    query: z.string().trim().min(2).max(120).optional(),
  })
  .strict();

/**
 * Every aroma term of the library's vocabulary, named in the reader's
 * language, with how many grapes carry it: what the aroma wheel draws.
 */
export const LibraryAromaCountsQuerySchema = z
  .object({ locale: SupportedLocaleSchema.default("en") })
  .strict();

export const LibraryAromaCountsResponseSchema = z
  .object({
    data: z.array(
      z
        .object({ grapeCount: z.number().int().min(0), label: z.string(), term: z.string() })
        .strict(),
    ),
  })
  .strict();

/**
 * What the pairing wheel draws: for each family of dishes the rules know,
 * the grapes that go with it — first those whose own sources say so, then
 * those the pairing rules suggest from the grape's style (`said: false`).
 */
export const LibraryPairingsQuerySchema = z
  .object({ locale: SupportedLocaleSchema.default("en") })
  .strict();

export const LibraryPairingsResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          family: z.string(),
          grapes: z.array(
            z.object({ id: z.string(), name: z.string(), said: z.boolean() }).strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict()
  .openapi("LibraryPairings");

export const LibrarySearchResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          color: z.enum(["white", "red", "pink"]).nullable(),
          id: z.string(),
          imagePath: z.string().nullable(),
          name: z.string(),
          originCountryCode: z.string().length(2).nullable(),
        })
        .strict(),
    ),
  })
  .strict()
  .openapi("LibrarySearchResponse");

export const LibraryGrapePathSchema = z
  .object({ grapeId: z.string().regex(/^[a-z0-9-]{1,80}$/) })
  .strict();

/**
 * How a register designates a protected wine name: the EU's PDO and PGI, and
 * other countries' own — the American Viticultural Area of 27 CFR part 9, New
 * Zealand's and Australia's geographical indications, South Africa's Wine of
 * Origin, Chile's denominations of origin, Argentina's geographical
 * indications (IG) and controlled denominations of origin (DOC); the UK
 * names its own PDO and PGI as the EU does.
 */
export const RegionDesignationSchema = z.enum([
  "PDO",
  "PGI",
  "AVA",
  "GI",
  "WO",
  "DO",
  "IG",
  "IP",
  "DOC",
  "AOC",
  "VQA",
  "WR",
]);
export type RegionDesignation = z.infer<typeof RegionDesignationSchema>;

/**
 * The kinds of area a register names: Australia's (country, multi-state
 * zone, state, super zone, zone, region, subregion), South Africa's Wine of
 * Origin scheme's (geographical unit … ward) and Chile's (region, subregion,
 * zone, area). Each register's are largest first.
 */
export const RegionLevelSchema = z.enum([
  "country",
  "multiStateZone",
  "state",
  "superZone",
  "zone",
  "overarchingUnit",
  "unit",
  "overarchingRegion",
  "region",
  "subregion",
  "district",
  "ward",
  "area",
  "cantonal",
  "regional",
  "local",
]);
export type RegionLevel = z.infer<typeof RegionLevelSchema>;

const RegionLinkSchema = z
  .object({ id: z.string(), level: RegionLevelSchema.nullable(), name: z.string() })
  .strict();

/** A protected wine name from its register, with what the library adds. */
const RegionFigureSchema = z
  .object({
    /** Hectares, or hectolitres. */
    amount: z.number(),
    /**
     * Who gives it, where not Wikipedia: Spain's Ministry ("mapa"), France's
     * customs ("douane"), Argentina's wine institute ("inv"), Germany's
     * statistical office ("destatis"), Statistik Austria ("statistik-austria"),
     * the US Federal Register rule that established an AVA ("federal-register"),
     * Hungary's Central Statistical Office ("ksh"), Tuscany's agricultural
     * payments agency ("artea"), the Lombardy region ("regione-lombardia"), the Umbria region
     * ("regione-umbria"), the University of Adelaide's database of winegrape
     * areas ("adelaide"), Statistics Portugal ("ine-portugal"), Switzerland's
     * Federal Office for Agriculture ("blw"), the Australian Bureau of
     * Statistics ("abs").
     */
    publisher: z
      .enum([
        "abs",
        "adelaide",
        "artea",
        "blw",
        "destatis",
        "douane",
        "federal-register",
        "ine-portugal",
        "inv",
        "ksh",
        "mapa",
        "regione-lombardia",
        "regione-umbria",
        "statistik-austria",
        // The appellation's own body, on a page that is not openly licensed:
        // the figure and who gives it (`by`), never its sentence.
        "web",
      ])
      .optional(),
    by: z.string().optional(),
    /** The infobox line it was read from. */
    quote: z.string(),
    sourceUrl: z.string().url(),
    /** The year the article gives it for. */
    year: z.string().nullable(),
  })
  .strict();

export const LibraryRegionSchema = z
  .object({
    /**
     * The climate at the name's point on the map, 1981–2010 (CHELSA V2.1):
     * one point, so only a guide for a large area. Null without a point.
     */
    climate: z
      .object({
        /** Metres above the sea at the point (Copernicus DEM GLO-90). */
        elevation: z.number().nullable(),
        /** Winkler's growing degree days over 10 °C. */
        growingDegreeDays: z.number(),
        koppen: z.string(),
        meanTemperature: z.number(),
        /** Monthly precipitation, January first, in millimetres. */
        pr: z.array(z.number()).length(12),
        rainfall: z.number(),
        /** Monthly mean temperature, January first, in °C. */
        tas: z.array(z.number()).length(12),
        winkler: z.enum(["I", "II", "III", "IV", "V"]).nullable(),
      })
      .strict()
      .nullable(),
    /** The names whose area lies within this one's, directly: a district's wards. */
    contains: z.array(RegionLinkSchema),
    /**
     * The soil at the name's point in the top 30 cm (SoilGrids 2.0, ISRIC):
     * clay, silt and sand in %, pH in water, organic carbon in g/kg. One
     * point, so only a guide. Null without one.
     */
    soil: z
      .object({
        clay: z.number(),
        /** Read this far from the point, which falls in a town or on water. */
        nearKm: z.number().nullable(),
        organicCarbon: z.number(),
        ph: z.number(),
        sand: z.number(),
        silt: z.number(),
      })
      .strict()
      .nullable(),
    countryCode: z.string().length(2),
    /** The EU register's id; null for a name another country's register holds. */
    eambrosiaId: z.string().nullable(),
    /** Planted area and yearly production, from its article's infobox. */
    figures: z
      .object({ planted: RegionFigureSchema.nullable(), production: RegionFigureSchema.nullable() })
      .strict(),
    giType: RegionDesignationSchema,
    grapes: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          quote: z.string(),
          sourceUrl: z.string().url(),
        })
        .strict(),
    ),
    id: z.string(),
    latitude: z.number().nullable(),
    legalUrl: z.string().url().nullable(),
    longitude: z.number().nullable(),
    name: z.string(),
    otherNames: z.array(z.string()),
    /**
     * Where the point comes from: inside the name's official boundary, the
     * wine's own item, or — approximately — the area it lies in or the town
     * it is named after. Null without one.
     */
    pointSource: z.enum(["boundary", "item", "area", "place"]).nullable(),
    registeredOn: z.string().nullable(),
    /** Its place in a register other than the EU's: "27 CFR 9.23", an IP number. */
    registerRef: z.string().nullable(),
    /** The kind of area, where its register has several: a Wine of Origin ward. */
    registerLevel: RegionLevelSchema.nullable(),
    /**
     * What the name's single document in the EU register says of its wines:
     * the categories of grapevine product it covers (their number in Annex
     * VII, Part II of Regulation (EU) No 1308/2013) and its main grape
     * varieties as the document writes them, with a grape card where the
     * variety is certainly that grape. Null where the document could not be
     * read.
     */
    register: z
      .object({
        categories: z.array(z.number().int()),
        grapes: z.array(z.object({ grapeId: z.string().nullable(), name: z.string() }).strict()),
        sourceUrl: z.string().url(),
      })
      .strict()
      .nullable(),
    summary: z
      .object({
        license: z.string(),
        locale: z.string(),
        sourceUrl: z.string().url(),
        text: z.string(),
        /** A faithful translation of the article at `sourceUrl`. */
        translated: z.boolean(),
      })
      .strict()
      .nullable(),
    wikidataId: z.string().nullable(),
    /** The names whose area holds this one's, the nearest first. */
    within: z.array(RegionLinkSchema),
  })
  .strict()
  .openapi("LibraryRegion");

export const LibraryRegionResponseSchema = z
  .object({ data: LibraryRegionSchema })
  .strict()
  .openapi("LibraryRegionResponse");

/** By name, in a country, or both; a country alone lists all of its names. */
export const LibraryRegionSearchQuerySchema = z
  .object({
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    query: z.string().trim().min(2).max(120).optional(),
  })
  .strict();

export const LibraryRegionPathSchema = z
  .object({ regionId: z.string().regex(/^[a-z]{2}-[a-z0-9-]{1,120}$/) })
  .strict();

export const LibraryRegionSearchResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          countryCode: z.string(),
          giType: RegionDesignationSchema,
          id: z.string(),
          name: z.string(),
          /** Its point on the map, in a country's full list; approximate where the
           *  atlas places it by an area or a place of its name. */
          point: z
            .object({ approximate: z.boolean(), latitude: z.number(), longitude: z.number() })
            .strict()
            .nullable()
            .optional(),
        })
        .strict(),
    ),
  })
  .strict()
  .openapi("LibraryRegionSearchResponse");

export type LibraryRegionSearchResponse = z.infer<typeof LibraryRegionSearchResponseSchema>;

export const LibraryAtlasCoverageQuerySchema = z
  .object({ locale: SupportedLocaleSchema.default("en") })
  .strict();

/**
 * How much the atlas knows of each country: its registered names, how many
 * are described in the reader's language and in all eight, how each is placed
 * on the map, and how many name their grapes.
 */
export const LibraryAtlasCoverageResponseSchema = z
  .object({
    data: z
      .object({
        countries: z.array(
          z
            .object({
              countryCode: z.string(),
              described: z.number().int().nonnegative(),
              describedInEveryLanguage: z.number().int().nonnegative(),
              names: z.number().int().positive(),
              /** By where the point comes from; `none` is a name not on the map. */
              points: z
                .object({
                  area: z.number().int().nonnegative(),
                  boundary: z.number().int().nonnegative(),
                  item: z.number().int().nonnegative(),
                  none: z.number().int().nonnegative(),
                  place: z.number().int().nonnegative(),
                })
                .strict(),
              withGrapes: z.number().int().nonnegative(),
            })
            .strict(),
        ),
        /** The library build the figures describe. */
        libraryVersion: z.string().nullable(),
      })
      .strict(),
  })
  .strict()
  .openapi("LibraryAtlasCoverageResponse");

/**
 * A style or a method: a kind of wine, a way of growing or making it, or a
 * concept, explained from its Wikipedia article in the reader's language.
 */
export const LibraryTopicSchema = z
  .object({
    category: z.enum(["kind", "farming", "method", "concept"]),
    id: z.string(),
    /** A picture of it from Wikimedia Commons, under a free licence. */
    image: LibraryImageSchema.nullable(),
    name: z.string(),
    otherNames: z.array(z.string()),
    summary: z
      .object({
        license: z.string(),
        locale: z.string(),
        sourceUrl: z.string().url(),
        text: z.string(),
        /** A faithful translation of the article at `sourceUrl`. */
        translated: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .openapi("LibraryTopic");

export const LibraryTopicsResponseSchema = z
  .object({ data: z.array(LibraryTopicSchema) })
  .strict()
  .openapi("LibraryTopicsResponse");

export const LibraryTopicResponseSchema = z
  .object({ data: LibraryTopicSchema })
  .strict()
  .openapi("LibraryTopicResponse");

export const LibraryTopicPathSchema = z
  .object({ topicId: z.string().regex(/^[a-z0-9-]{1,60}$/) })
  .strict();

export type LibraryTopic = z.infer<typeof LibraryTopicSchema>;
export type LibraryRegion = z.infer<typeof LibraryRegionSchema>;
export type LibraryGrape = z.infer<typeof LibraryGrapeSchema>;
export type LibraryGrapeResponse = z.infer<typeof LibraryGrapeResponseSchema>;
export type LibrarySearchResponse = z.infer<typeof LibrarySearchResponseSchema>;
export type LibraryAromaCountsResponse = z.infer<typeof LibraryAromaCountsResponseSchema>;
export type LibraryPairingsResponse = z.infer<typeof LibraryPairingsResponseSchema>;
export type LibraryAtlasCoverageResponse = z.infer<typeof LibraryAtlasCoverageResponseSchema>;

/** Registered names by id, as the register writes them. */
export const LibraryRegionNamesQuerySchema = z
  .object({
    /** Up to a hundred ids, comma-separated. */
    ids: z
      .string()
      .max(8_000)
      .openapi({ param: { in: "query", name: "ids" } }),
  })
  .strict();

export const LibraryRegionNamesResponseSchema = z
  .object({
    data: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
  })
  .strict()
  .openapi("LibraryRegionNamesResponse");

/** Wineries by name, in a country if one is given: for the producer field. */
export const LibraryWinerySearchQuerySchema = z
  .object({
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    query: z.string().trim().min(2).max(120),
  })
  .strict();

export const LibraryWinerySearchResponseSchema = z
  .object({
    data: z.array(z.object({ countryCode: z.string(), id: z.string(), name: z.string() }).strict()),
  })
  .strict()
  .openapi("LibraryWinerySearchResponse");
